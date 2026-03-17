// SERVICE_ID: SVC_PROCESSOR_RECONCILIATION
//
// Compares Soledgic ledger transactions against processor_events (Stripe)
// to find mismatches: missing on either side, amount differences, status disagreements.
//
// Auth: x-cron-secret OR service_role Bearer token.
// Called by admin dashboard or scheduled cron.

import { createHandler, LedgerContext } from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ReconciliationRequest {
  ledger_id: string
  period_start: string  // ISO date
  period_end: string    // ISO date
}

interface Mismatch {
  type: 'ledger_only' | 'processor_only' | 'amount_mismatch' | 'status_mismatch'
  ledger_transaction_id?: string
  processor_event_id?: string
  ledger_amount_cents?: number
  processor_amount_cents?: number
  ledger_status?: string
  processor_status?: string
  reference_id?: string
  details?: Record<string, unknown>
}

async function runReconciliation(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: ReconciliationRequest,
  requestId: string,
) {
  const { period_start, period_end } = body

  // 1. Get all ledger transactions in period (excluding manual entries like adjustments)
  const { data: ledgerTxns, error: ledgerError } = await supabase
    .from('transactions')
    .select('id, reference_id, amount, status, transaction_type, created_at, metadata')
    .eq('ledger_id', ledger.id)
    .gte('created_at', period_start)
    .lte('created_at', period_end)
    .in('transaction_type', ['sale', 'deposit', 'withdrawal', 'refund', 'payout'])
    .order('created_at', { ascending: true })

  if (ledgerError) {
    throw new Error(`Failed to query ledger transactions: ${ledgerError.message}`)
  }

  // 2. Get all processor events in period
  const { data: processorEvents, error: processorError } = await supabase
    .from('processor_events')
    .select('id, processor_event_id, event_type, status, raw_data, transaction_id, created_at')
    .eq('ledger_id', ledger.id)
    .gte('created_at', period_start)
    .lte('created_at', period_end)
    .order('created_at', { ascending: true })

  if (processorError) {
    throw new Error(`Failed to query processor events: ${processorError.message}`)
  }

  const txns = ledgerTxns || []
  const events = processorEvents || []

  // 3. Build lookup maps
  const txnByRefId = new Map<string, typeof txns[0]>()
  const txnById = new Map<string, typeof txns[0]>()
  for (const txn of txns) {
    if (txn.reference_id) txnByRefId.set(txn.reference_id, txn)
    txnById.set(txn.id, txn)
  }

  const matchedTxnIds = new Set<string>()
  const matchedEventIds = new Set<string>()
  const mismatches: Mismatch[] = []

  // 4. Match processor events to ledger transactions
  for (const event of events) {
    const linkedTxn = event.transaction_id ? txnById.get(event.transaction_id) : null

    if (linkedTxn) {
      matchedTxnIds.add(linkedTxn.id)
      matchedEventIds.add(event.id)

      // Compare amounts (processor stores in raw_data, ledger stores in amount)
      const rawData = event.raw_data as Record<string, unknown> | null
      const processorAmountCents = extractAmountCents(rawData)
      const ledgerAmountCents = Math.round(Number(linkedTxn.amount) * 100)

      if (processorAmountCents !== null && processorAmountCents !== ledgerAmountCents) {
        mismatches.push({
          type: 'amount_mismatch',
          ledger_transaction_id: linkedTxn.id,
          processor_event_id: event.processor_event_id,
          ledger_amount_cents: ledgerAmountCents,
          processor_amount_cents: processorAmountCents,
          reference_id: linkedTxn.reference_id || undefined,
        })
      }

      // Compare statuses
      const processorStatus = normalizeProcessorStatus(event.status)
      if (processorStatus && linkedTxn.status !== processorStatus) {
        mismatches.push({
          type: 'status_mismatch',
          ledger_transaction_id: linkedTxn.id,
          processor_event_id: event.processor_event_id,
          ledger_status: linkedTxn.status,
          processor_status: event.status,
          reference_id: linkedTxn.reference_id || undefined,
        })
      }
    } else {
      // Processor event with no matching ledger transaction
      matchedEventIds.add(event.id)
      mismatches.push({
        type: 'processor_only',
        processor_event_id: event.processor_event_id,
        processor_amount_cents: extractAmountCents(event.raw_data as Record<string, unknown> | null) || undefined,
        details: { event_type: event.event_type, status: event.status },
      })
    }
  }

  // 5. Find ledger transactions with no processor event
  // Only flag non-manual transactions (those with reference_type = 'wallet' or metadata.payment_source)
  for (const txn of txns) {
    if (matchedTxnIds.has(txn.id)) continue

    const meta = txn.metadata as Record<string, unknown> | null
    const isProcessorOrigin = meta?.payment_source || meta?.stripe_payment_intent || meta?.processor_event_id
    const isWalletOp = txn.transaction_type === 'deposit' || txn.transaction_type === 'withdrawal'

    // Only flag if this looks like it should have a processor event
    if (isProcessorOrigin && !isWalletOp) {
      mismatches.push({
        type: 'ledger_only',
        ledger_transaction_id: txn.id,
        ledger_amount_cents: Math.round(Number(txn.amount) * 100),
        reference_id: txn.reference_id || undefined,
        details: { transaction_type: txn.transaction_type, status: txn.status },
      })
    }
  }

  // 6. Calculate totals
  const ledgerTotalCents = txns.reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0)
  const processorTotalCents = events.reduce((sum, e) => {
    const amt = extractAmountCents(e.raw_data as Record<string, unknown> | null)
    return sum + (amt || 0)
  }, 0)

  const matchedCount = matchedTxnIds.size
  const ledgerOnlyCount = mismatches.filter(m => m.type === 'ledger_only').length
  const processorOnlyCount = mismatches.filter(m => m.type === 'processor_only').length
  const amountMismatchCount = mismatches.filter(m => m.type === 'amount_mismatch').length

  // 7. Store reconciliation run
  const { data: run, error: insertError } = await supabase
    .from('processor_reconciliation_runs')
    .insert({
      ledger_id: ledger.id,
      period_start,
      period_end,
      ledger_count: txns.length,
      processor_count: events.length,
      matched_count: matchedCount,
      ledger_only_count: ledgerOnlyCount,
      processor_only_count: processorOnlyCount,
      amount_mismatch_count: amountMismatchCount,
      ledger_total_cents: ledgerTotalCents,
      processor_total_cents: processorTotalCents,
      discrepancy_cents: Math.abs(ledgerTotalCents - processorTotalCents),
      status: 'completed',
      details: { mismatches: mismatches.slice(0, 500) }, // cap detail size
    })
    .select('id')
    .single()

  if (insertError) {
    console.error(`[${requestId}] Failed to store reconciliation run:`, insertError)
  }

  return {
    run_id: run?.id || null,
    period: { start: period_start, end: period_end },
    summary: {
      ledger_transactions: txns.length,
      processor_events: events.length,
      matched: matchedCount,
      ledger_only: ledgerOnlyCount,
      processor_only: processorOnlyCount,
      amount_mismatches: amountMismatchCount,
      ledger_total_cents: ledgerTotalCents,
      processor_total_cents: processorTotalCents,
      discrepancy_cents: Math.abs(ledgerTotalCents - processorTotalCents),
    },
    mismatches: mismatches.slice(0, 100), // return top 100 in response
  }
}

function extractAmountCents(rawData: Record<string, unknown> | null): number | null {
  if (!rawData) return null
  // Stripe stores amount in minor units
  if (typeof rawData.amount === 'number') return rawData.amount
  if (typeof rawData.amount_minor_units === 'number') return rawData.amount_minor_units
  // Nested in data object
  const data = rawData.data as Record<string, unknown> | undefined
  if (data && typeof data.amount === 'number') return data.amount
  return null
}

function normalizeProcessorStatus(status: string | null): string | null {
  if (!status) return null
  switch (status) {
    case 'completed':
    case 'succeeded':
      return 'completed'
    case 'pending':
    case 'processing':
      return 'pending'
    case 'failed':
    case 'canceled':
      return 'voided'
    default:
      return null // don't compare unknown statuses
  }
}

export default createHandler(async (req, supabase, ledger, _body, requestId) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (!ledger?.id) {
    return new Response(JSON.stringify({ error: 'Ledger context required' }), { status: 401 })
  }

  const body = _body as ReconciliationRequest

  if (!body.period_start || !body.period_end) {
    return new Response(
      JSON.stringify({ error: 'period_start and period_end are required (ISO dates)' }),
      { status: 400 },
    )
  }

  const result = await runReconciliation(supabase, ledger, body, requestId)

  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
