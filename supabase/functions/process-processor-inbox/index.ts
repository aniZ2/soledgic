// Soledgic Edge Function: Process Processor Inbox
// POST /process-processor-inbox
//
// Internal worker that:
// - Claims pending rows from processor_webhook_inbox (concurrency-safe)
// - Normalizes them into Soledgic domain events (whitelabeled)
// - Applies handlers (payout/refund/dispute bookkeeping)
//
// Security:
// - Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// - Optional (ops/testing): Authorization: Bearer <PROCESS_PROCESSOR_INBOX_TOKEN>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getProcessorWebhookAdapter,
  type NormalizedProcessorEvent,
  type ProcessorWebhookInboxRow,
} from '../_shared/processor-webhook-adapters.ts'
import { getCorsHeaders, timingSafeEqual } from '../_shared/utils.ts'

function isAuthorized(authHeader: string, serviceRoleKey: string): boolean {
  const expectedAuth = `Bearer ${serviceRoleKey}`
  if (timingSafeEqual(authHeader, expectedAuth)) return true

  const testingToken = (Deno.env.get('PROCESS_PROCESSOR_INBOX_TOKEN') || '').trim()
  if (!testingToken) return false
  return timingSafeEqual(authHeader, `Bearer ${testingToken}`)
}

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function minorUnitFactor(currency: string | null): number {
  const c = (currency || 'USD').toUpperCase()
  if (['JPY', 'KRW', 'VND'].includes(c)) return 1
  if (['BHD', 'IQD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 1000
  return 100
}

function amountToMajorUnits(amountMinorUnits: number, currency: string | null): number {
  const unitMode = (Deno.env.get('PROCESSOR_AMOUNT_UNIT') || 'minor').toLowerCase().trim()
  if (unitMode === 'major') return Number(amountMinorUnits)
  const factor = minorUnitFactor(currency)
  return Number(amountMinorUnits) / factor
}

function truncateError(value: unknown): string {
  const msg = value instanceof Error ? value.message : String(value || 'Unknown error')
  return msg.length > 500 ? msg.slice(0, 500) : msg
}

function domainEventType(ev: NormalizedProcessorEvent): string {
  if (ev.kind === 'payout') return 'payout.status_changed'
  if (ev.kind === 'refund') return 'refund.status_changed'
  if (ev.kind === 'dispute') return 'dispute.status_changed'
  if (ev.kind === 'charge') return 'payment.status_changed'
  return 'event.unknown'
}

type TransactionRow = { id: string; metadata: any }

async function queueWebhook(
  supabase: any,
  ledgerId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  await supabase.rpc('queue_webhook', {
    p_ledger_id: ledgerId,
    p_event_type: eventType,
    p_payload: payload,
  })
}

function mapToPayoutRailStatus(status: NormalizedProcessorEvent['status']): 'pending' | 'processing' | 'completed' | 'failed' {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'processing') return 'processing'
  return 'pending'
}

async function handlePayoutUpdate(
  supabase: any,
  ev: NormalizedProcessorEvent,
): Promise<{ transactionId: string | null; webhookQueued: boolean }> {
  const payoutId = (ev.tags.soledgic_payout_id || '').trim()
  if (!payoutId) return { transactionId: null, webhookQueued: false }
  const ledgerId = ev.ledger_id
  if (!ledgerId) return { transactionId: null, webhookQueued: false }

  const { data: payoutTx } = await supabase
    .from('transactions')
    .select('id, metadata')
    .eq('id', payoutId)
    .eq('ledger_id', ledgerId)
    .maybeSingle()

  if (!payoutTx?.id) return { transactionId: null, webhookQueued: false }

  const nextRailStatus = mapToPayoutRailStatus(ev.status)
  const prevRailStatus = String(payoutTx.metadata?.rail_status || '')
  const shouldQueue = prevRailStatus !== nextRailStatus && (nextRailStatus === 'completed' || nextRailStatus === 'failed')

  await supabase
    .from('transactions')
    .update({
      metadata: {
        ...(payoutTx.metadata || {}),
        external_id: ev.resource_id || payoutTx.metadata?.external_id || null,
        rail_status: nextRailStatus,
        processor_status: ev.status,
        processor_event_id: ev.source_event_id,
      },
    })
    .eq('id', payoutTx.id)

  if (shouldQueue) {
    const eventType = nextRailStatus === 'completed' ? 'payout.executed' : 'payout.failed'
    await queueWebhook(supabase, ledgerId, eventType, {
      payout_id: payoutTx.id,
      external_id: ev.resource_id,
      status: nextRailStatus,
      occurred_at: ev.occurred_at,
    })
    return { transactionId: payoutTx.id, webhookQueued: true }
  }

  return { transactionId: payoutTx.id, webhookQueued: false }
}

async function handleRefundUpdate(
  supabase: any,
  ev: NormalizedProcessorEvent,
): Promise<{ transactionId: string | null; webhookQueued: boolean }> {
  const ledgerId = ev.ledger_id
  if (!ledgerId || !ev.resource_id) return { transactionId: null, webhookQueued: false }

  const { data: refundTx } = await supabase
    .from('transactions')
    .select('id, metadata')
    .eq('ledger_id', ledgerId)
    .eq('transaction_type', 'refund')
    .or(`reference_id.eq.${ev.resource_id},metadata->>external_refund_id.eq.${ev.resource_id}`)
    .maybeSingle()

  if (!refundTx?.id) return { transactionId: null, webhookQueued: false }

  const prev = String(refundTx.metadata?.processor_refund_status || '')
  const next = ev.status
  const shouldQueue = prev !== next && next === 'completed'

  await supabase
    .from('transactions')
    .update({
      metadata: {
        ...(refundTx.metadata || {}),
        processor_refund_status: next,
        processor_event_id: ev.source_event_id,
      },
    })
    .eq('id', refundTx.id)

  if (shouldQueue) {
    await queueWebhook(supabase, ledgerId, 'sale.refunded', {
      refund_transaction_id: refundTx.id,
      refund_id: ev.resource_id,
      original_sale_reference: refundTx.metadata?.original_sale_reference || ev.tags.soledgic_original_sale_reference || null,
      occurred_at: ev.occurred_at,
    })
    return { transactionId: refundTx.id, webhookQueued: true }
  }

  return { transactionId: refundTx.id, webhookQueued: false }
}

function disputeActionFromEventType(ev: NormalizedProcessorEvent): 'open' | 'resolve' | null {
  const t = (ev.source_event_type || '').toLowerCase()
  if (!t.includes('dispute')) return null
  if (t.includes('created') || t.includes('opened') || t.includes('new')) return 'open'
  if (t.includes('closed') || t.includes('resolved') || t.includes('won') || t.includes('lost')) return 'resolve'
  return null
}

async function handleDisputeUpdate(
  supabase: any,
  ev: NormalizedProcessorEvent,
): Promise<{ heldFundId: string | null }> {
  const enabled = (Deno.env.get('PROCESSOR_WEBHOOK_ENABLE_DISPUTE_HOLDS') || '').toLowerCase().trim() === 'true'
  if (!enabled) return { heldFundId: null }

  const ledgerId = ev.ledger_id
  const creatorId = (ev.tags.creator_id || '').trim()
  const disputeId = (ev.resource_id || '').trim() || (ev.tags.dispute_id || '').trim()
  if (!ledgerId || !creatorId || !disputeId) return { heldFundId: null }

  const action = disputeActionFromEventType(ev)
  if (action !== 'open') return { heldFundId: null }

  const amountMinor = ev.amount_minor_units
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor) || amountMinor <= 0) return { heldFundId: null }
  const amountMajor = amountToMajorUnits(amountMinor, ev.currency)

  const { data: result } = await supabase.rpc('apply_dispute_hold', {
    p_ledger_id: ledgerId,
    p_creator_id: creatorId,
    p_dispute_id: disputeId,
    p_amount: amountMajor,
    p_source_reference: ev.tags.soledgic_original_sale_reference || ev.tags.original_sale_reference || null,
  })

  const heldFundId = result?.held_fund_id ? String(result.held_fund_id) : null
  return { heldFundId }
}

async function upsertProcessorTransaction(
  supabase: any,
  ev: NormalizedProcessorEvent
): Promise<void> {
  const ledgerId = ev.ledger_id
  const processorId = (ev.resource_id || '').trim()
  if (!ledgerId || !processorId) return
  if (typeof ev.amount_minor_units !== 'number' || !Number.isFinite(ev.amount_minor_units)) return

  const currency = (ev.currency || 'USD').toUpperCase()
  const amountMajor = amountToMajorUnits(ev.amount_minor_units, currency)

  const type: string =
    ev.kind === 'payout' ? 'payout' :
    ev.kind === 'refund' ? 'refund' :
    ev.kind === 'dispute' ? 'dispute' :
    ev.kind === 'charge' ? 'charge' :
    'transfer'

  const signedAmount = (type === 'payout' || type === 'refund' || type === 'dispute') ? -Math.abs(amountMajor) : Math.abs(amountMajor)

  await supabase
    .from('processor_transactions')
    .upsert(
      {
        ledger_id: ledgerId,
        processor_id: processorId,
        processor_type: type,
        amount: signedAmount,
        currency,
        status: ev.status,
        description: ev.source_event_type || null,
        raw_data: {
          source_event_id: ev.source_event_id,
          source_event_type: ev.source_event_type,
          occurred_at: ev.occurred_at,
          tags: ev.tags,
        },
      },
      { onConflict: 'ledger_id,processor_id,processor_type' }
    )
}

async function storeProcessorEvent(
  supabase: any,
  ev: NormalizedProcessorEvent
): Promise<{ stored: boolean; processorEventId: string | null }> {
  const ledgerId = ev.ledger_id
  if (!ledgerId) return { stored: false, processorEventId: null }

  const insertRow = {
    ledger_id: ledgerId,
    processor_event_id: ev.source_event_id,
    event_type: domainEventType(ev),
    livemode: Boolean(ev.livemode),
    status: 'pending',
    raw_data: {
      resource_id: ev.resource_id,
      source_event_type: ev.source_event_type,
      occurred_at: ev.occurred_at,
      tags: ev.tags,
      payload: ev.raw,
    },
  }

  const { data, error } = await supabase
    .from('processor_events')
    .upsert(insertRow, { onConflict: 'ledger_id,processor_event_id', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()

  if (error) {
    return { stored: false, processorEventId: null }
  }
  return { stored: true, processorEventId: data?.id ? String(data.id) : null }
}

async function markProcessorEvent(
  supabase: any,
  ledgerId: string,
  sourceEventId: string,
  next: { status: string; processed_at?: string | null; transaction_id?: string | null; error_message?: string | null }
) {
  await supabase
    .from('processor_events')
    .update({
      status: next.status,
      processed_at: next.processed_at ?? new Date().toISOString(),
      transaction_id: next.transaction_id ?? null,
      error_message: next.error_message ?? null,
    })
    .eq('ledger_id', ledgerId)
    .eq('processor_event_id', sourceEventId)
}

async function markInboxRow(
  supabase: any,
  inboxId: string,
  next: { status: 'processed' | 'failed' | 'skipped'; error?: string | null }
) {
  await supabase
    .from('processor_webhook_inbox')
    .update({
      status: next.status,
      processed_at: new Date().toISOString(),
      processing_error: next.error || null,
    })
    .eq('id', inboxId)
}

interface ProcessInboxRequest {
  limit?: number
  dry_run?: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return json(req, { success: false, error: 'Method not allowed' }, 405)

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim()
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, { success: false, error: 'Supabase environment is not configured' }, 503)
  }

  const authHeader = req.headers.get('authorization') || ''
  if (!isAuthorized(authHeader, serviceRoleKey)) {
    return json(req, { success: false, error: 'Unauthorized' }, 401)
  }

  let body: ProcessInboxRequest = {}
  try {
    body = (await req.json().catch(() => ({}))) as ProcessInboxRequest
  } catch {
    body = {}
  }

  const limitRaw = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.trunc(body.limit) : 25
  const limit = Math.max(1, Math.min(200, limitRaw))
  const dryRun = body.dry_run === true

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const adapter = getProcessorWebhookAdapter()

  const { data: claimed, error: claimError } = await supabase.rpc('claim_processor_webhook_inbox', { p_limit: limit })
  if (claimError) {
    return json(req, { success: false, error: 'Failed to claim inbox rows' }, 500)
  }

  const rows = (claimed || []) as ProcessorWebhookInboxRow[]
  if (!rows.length) {
    return json(req, { success: true, processed: 0, message: 'No pending inbox rows' }, 200)
  }

  const results = {
    claimed: rows.length,
    processed: 0,
    failed: 0,
    skipped: 0,
    webhooks_queued: 0,
  }

  for (const row of rows) {
    try {
      const normalized = adapter.normalize(row)
      if (!normalized.length) {
        results.skipped++
        if (!dryRun) await markInboxRow(supabase, row.id, { status: 'skipped', error: 'No events produced by adapter' })
        continue
      }

      // Current implementation expects one normalized event per inbox row.
      const ev = normalized[0] as NormalizedProcessorEvent

      if (!ev.ledger_id) {
        results.skipped++
        if (!dryRun) await markInboxRow(supabase, row.id, { status: 'skipped', error: 'Missing ledger_id in event tags' })
        continue
      }

      if (!dryRun) {
        await storeProcessorEvent(supabase, ev)
        await upsertProcessorTransaction(supabase, ev)
      }

      let linkedTxId: string | null = null

      if (!dryRun && ev.kind === 'payout') {
        const payout = await handlePayoutUpdate(supabase, ev)
        linkedTxId = payout.transactionId
        if (payout.webhookQueued) results.webhooks_queued++
      }

      if (!dryRun && ev.kind === 'refund') {
        const refund = await handleRefundUpdate(supabase, ev)
        linkedTxId = refund.transactionId
        if (refund.webhookQueued) results.webhooks_queued++
      }

      if (!dryRun && ev.kind === 'dispute') {
        await handleDisputeUpdate(supabase, ev)
      }

      if (!dryRun) {
        await markProcessorEvent(supabase, ev.ledger_id, ev.source_event_id, {
          status: 'processed',
          transaction_id: linkedTxId,
          processed_at: new Date().toISOString(),
        })
        await markInboxRow(supabase, row.id, { status: 'processed' })
      }

      results.processed++
    } catch (err) {
      results.failed++
      if (!dryRun) {
        await markInboxRow(supabase, row.id, { status: 'failed', error: truncateError(err) })
      }
    }
  }

  return json(req, { success: true, adapter: adapter.name, dry_run: dryRun, results }, 200)
})
