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
  if (ev.kind === 'book_transfer') return 'book_transfer.status_changed'
  return 'event.unknown'
}

type TransactionRow = { id: string; metadata: any }

/**
 * Resolve ledger_id and creator_id from a linked transfer ID.
 * Used when disputes/reversals from the processor lack Soledgic tags
 * but reference the original charge via _linked_transfer_id.
 */
async function resolveFromLinkedTransfer(
  supabase: any,
  linkedTransferId: string
): Promise<{ ledger_id: string | null; creator_id: string | null }> {
  const { data } = await supabase
    .from('processor_transactions')
    .select('ledger_id, raw_data')
    .eq('processor_id', linkedTransferId)
    .limit(1)
    .maybeSingle()

  if (!data) return { ledger_id: null, creator_id: null }

  const tags = (data.raw_data?.tags || {}) as Record<string, string>
  return {
    ledger_id: data.ledger_id || null,
    creator_id: tags.creator_id || tags.soledgic_creator_id || null,
  }
}

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

  // ========================================================================
  // AUTO-REPAIR: If no ledger refund transaction exists, check for a pending
  // processor refund record (created when the refunds ledger write failed
  // after a successful processor refund) and attempt to book it now.
  // ========================================================================
  if (!refundTx?.id) {
    const { data: pending } = await supabase
      .from('pending_processor_refunds')
      .select('*')
      .eq('ledger_id', ledgerId)
      .eq('external_refund_id', ev.resource_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pending) {
      const { data: repairResult, error: repairError } = await supabase.rpc('record_refund_atomic_v2', {
        p_ledger_id: pending.ledger_id,
        p_reference_id: pending.reference_id,
        p_original_tx_id: pending.original_transaction_id,
        p_refund_amount: pending.refund_amount,
        p_reason: pending.reason || 'Auto-repaired from processor webhook',
        p_refund_from: pending.refund_from || 'both',
        p_external_refund_id: pending.external_refund_id,
        p_metadata: {
          ...(pending.metadata || {}),
          auto_repaired: true,
          repaired_from: 'process_processor_inbox',
          repair_event_id: ev.source_event_id,
        },
        p_entry_method: 'system',
      })

      const repairedRow = Array.isArray(repairResult) ? repairResult[0] : repairResult
      if (!repairError && repairedRow?.out_transaction_id) {
        // Mark pending record as repaired
        await supabase
          .from('pending_processor_refunds')
          .update({ status: 'repaired', repaired_at: new Date().toISOString() })
          .eq('id', pending.id)

        console.log(`[inbox] Auto-repaired refund: pending_id=${pending.id} → tx=${repairedRow.out_transaction_id}`)

        await queueWebhook(supabase, ledgerId, 'sale.refunded', {
          refund_transaction_id: repairedRow.out_transaction_id,
          refund_id: ev.resource_id,
          original_sale_reference: ev.tags.soledgic_original_sale_reference || null,
          occurred_at: ev.occurred_at,
          auto_repaired: true,
        })
        return { transactionId: repairedRow.out_transaction_id, webhookQueued: true }
      } else {
        console.error(`[inbox] Auto-repair failed for pending refund ${pending.id}:`, repairError)
        await supabase
          .from('pending_processor_refunds')
          .update({
            status: 'repair_failed',
            error_message: String(repairError?.message || 'Unknown').slice(0, 500),
          })
          .eq('id', pending.id)
      }
    }

    return { transactionId: null, webhookQueued: false }
  }

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
  let creatorId = (ev.tags.creator_id || '').trim()
  const disputeId = (ev.resource_id || '').trim() || (ev.tags.dispute_id || '').trim()

  // Resolve creator_id from linked transfer if missing
  if (!creatorId && ev.tags._linked_transfer_id) {
    const resolved = await resolveFromLinkedTransfer(supabase, ev.tags._linked_transfer_id)
    creatorId = (resolved.creator_id || '').trim()
  }

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
    ev.kind === 'book_transfer' ? 'book_transfer' :
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

/**
 * Resolve the creator split percentage using the same cascade as checkout-sessions:
 *   1. Product-specific split (product_splits table)
 *   2. Creator-specific custom_split_percent (accounts.metadata)
 *   3. Creator tier split (creator_tiers table)
 *   4. Ledger default (settings.default_split_percent or 100 - default_platform_fee_percent)
 *   5. Ultimate fallback: 80%
 */
async function resolveCreatorSplitPercent(
  supabase: any,
  ledgerId: string,
  creatorId: string,
  productId: string | null,
  ledgerSettings: Record<string, any>,
): Promise<number> {
  // 1. Product-specific split
  if (productId) {
    const { data: productSplit } = await supabase
      .from('product_splits')
      .select('creator_percent')
      .eq('ledger_id', ledgerId)
      .eq('product_id', productId)
      .maybeSingle()
    if (productSplit?.creator_percent !== undefined) return productSplit.creator_percent
  }

  // 2. Creator-specific split or 3. tier-based split
  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('metadata')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .eq('is_active', true)
    .maybeSingle()

  if (creatorAccount?.metadata?.custom_split_percent !== undefined) {
    return creatorAccount.metadata.custom_split_percent
  }

  if (creatorAccount?.metadata?.tier_id) {
    const { data: tier } = await supabase
      .from('creator_tiers')
      .select('creator_percent')
      .eq('id', creatorAccount.metadata.tier_id)
      .maybeSingle()
    if (tier?.creator_percent !== undefined) return tier.creator_percent
  }

  // 4. Ledger defaults
  if (ledgerSettings.default_split_percent !== undefined) return ledgerSettings.default_split_percent
  if (ledgerSettings.default_platform_fee_percent !== undefined) return 100 - ledgerSettings.default_platform_fee_percent

  // 5. Ultimate fallback
  return 80
}

/**
 * Handle a completed charge event from the processor.
 * If the charge has Soledgic tags (ledger_id, creator_id) but no matching
 * ledger sale transaction, this books the sale automatically. This is the
 * safety net for the direct-charge path in checkout-sessions which doesn't
 * write ledger entries synchronously.
 *
 * IMPORTANT: record_sale_atomic expects amounts in CENTS (minor units).
 * amountToMajorUnits converts processor amounts to major units for display,
 * but the RPC divides by 100 internally, so we must pass cents.
 */
async function handleChargeCompleted(
  supabase: any,
  ev: NormalizedProcessorEvent,
): Promise<{ transactionId: string | null; webhookQueued: boolean }> {
  const ledgerId = ev.ledger_id
  const creatorId = (ev.tags.soledgic_creator_id || ev.tags.creator_id || '').trim()
  if (!ledgerId || !creatorId) return { transactionId: null, webhookQueued: false }

  const amountMinor = ev.amount_minor_units
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { transactionId: null, webhookQueued: false }
  }

  // Derive a stable reference from the processor transfer ID
  const referenceId = ev.tags.soledgic_checkout_session_id
    ? `checkout_${ev.tags.soledgic_checkout_session_id}`
    : `charge_${ev.resource_id}`

  // Check if sale already booked (idempotent)
  const { data: existingSale } = await supabase
    .from('transactions')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('reference_id', referenceId)
    .eq('transaction_type', 'sale')
    .maybeSingle()

  if (existingSale?.id) {
    return { transactionId: existingSale.id, webhookQueued: false }
  }

  // Resolve the amount in cents for record_sale_atomic.
  // amountToMajorUnits handles the PROCESSOR_AMOUNT_UNIT env var:
  //   - If 'major', amountMinor is already in major units → convert to cents
  //   - If 'minor' (default), amountMinor is already in cents → pass through
  const unitMode = (Deno.env.get('PROCESSOR_AMOUNT_UNIT') || 'minor').toLowerCase().trim()
  const amountCents = unitMode === 'major'
    ? Math.round(Number(amountMinor) * minorUnitFactor(ev.currency))
    : Number(amountMinor)

  // Resolve split using the same cascade as checkout-sessions
  const { data: ledgerRow } = await supabase
    .from('ledgers')
    .select('settings')
    .eq('id', ledgerId)
    .maybeSingle()

  const settings = (ledgerRow?.settings || {}) as Record<string, any>
  const productId = (ev.tags.product_id || '').trim() || null
  const creatorPercent = await resolveCreatorSplitPercent(
    supabase, ledgerId, creatorId, productId, settings
  )

  const creatorAmountCents = Math.floor(amountCents * (creatorPercent / 100))
  const platformAmountCents = amountCents - creatorAmountCents

  const { data: saleResult, error: saleError } = await supabase.rpc('record_sale_atomic', {
    p_ledger_id: ledgerId,
    p_reference_id: referenceId,
    p_creator_id: creatorId,
    p_gross_amount: amountCents,
    p_creator_amount: creatorAmountCents,
    p_platform_amount: platformAmountCents,
    p_processing_fee: 0,
    p_product_id: productId,
    p_product_name: ev.tags.product_name || null,
    p_metadata: {
      auto_booked: true,
      booked_from: 'process_processor_inbox',
      processor_transfer_id: ev.resource_id,
      source_event_id: ev.source_event_id,
    },
    p_entry_method: 'system',
  })

  if (saleError) {
    // Duplicate reference means it was already booked (race condition) — not an error
    if (saleError.code === '23505' || String(saleError.message || '').includes('duplicate')) {
      return { transactionId: null, webhookQueued: false }
    }
    console.error(`[inbox] Failed to auto-book charge ${ev.resource_id}:`, saleError)
    return { transactionId: null, webhookQueued: false }
  }

  const saleRow = Array.isArray(saleResult) ? saleResult[0] : saleResult
  const txId = saleRow?.out_transaction_id || null

  if (txId) {
    console.log(`[inbox] Auto-booked charge ${ev.resource_id} → sale tx=${txId}`)
    await queueWebhook(supabase, ledgerId, 'checkout.completed', {
      payment_id: ev.resource_id,
      reference_id: referenceId,
      amount: amountCents / 100,
      creator_id: creatorId,
      auto_booked: true,
      occurred_at: ev.occurred_at,
    })
    return { transactionId: txId, webhookQueued: true }
  }

  return { transactionId: null, webhookQueued: false }
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
    return json(req, { success: true, dry_run: dryRun, results: { claimed: 0, processed: 0, failed: 0, skipped: 0, webhooks_queued: 0 } }, 200)
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

      // Resolve ledger_id (and creator_id) from linked transfer if missing.
      // This handles Finix disputes/reversals that reference the original charge
      // but don't carry Soledgic tags themselves.
      if (!ev.ledger_id && ev.tags._linked_transfer_id) {
        const resolved = await resolveFromLinkedTransfer(supabase, ev.tags._linked_transfer_id)
        if (resolved.ledger_id) {
          (ev as { ledger_id: string | null }).ledger_id = resolved.ledger_id
        }
        if (resolved.creator_id && !ev.tags.creator_id) {
          ev.tags.creator_id = resolved.creator_id
        }
      }

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

      // ====================================================================
      // CHARGE HANDLER: Auto-book charges that have no matching ledger sale.
      // This catches direct charges from checkout-sessions (payment_method_id
      // flow) where ledger booking was skipped or failed.
      // ====================================================================
      if (!dryRun && ev.kind === 'charge' && ev.status === 'completed') {
        const chargeResult = await handleChargeCompleted(supabase, ev)
        if (chargeResult.transactionId) linkedTxId = chargeResult.transactionId
        if (chargeResult.webhookQueued) results.webhooks_queued++
      }

      // Book transfers are recorded in processor_transactions for reconciliation
      // visibility (via upsertProcessorTransaction above) but NOT auto-booked to
      // the ledger. Auto-booking requires manual review to determine semantic
      // intent and avoid double-counting. A future phase can add auto-booking
      // rules once the mapping is established.

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
