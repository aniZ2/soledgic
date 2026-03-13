import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  LedgerContext,
  sanitizeForAudit,
  validateDate,
  validateId,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

export interface ReconciliationMatchInput {
  transaction_id?: string
  bank_transaction_id?: string
}

export interface ReconciliationSnapshotInput {
  period_id?: string
  as_of_date?: string
}

export interface ReconciliationUnmatchedInput {
  limit?: number
}

export interface ReconciliationAutoMatchInput {
  bank_aggregator_transaction_id?: string
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value as number)) return fallback
  return Math.max(1, Math.min(Math.trunc(Number(value)), max))
}

async function generateHash(data: unknown): Promise<string> {
  const json = JSON.stringify(data, Object.keys((data && typeof data === 'object') ? (data as Record<string, unknown>) : {}).sort())
  const buffer = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createReconciliationMatchResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: ReconciliationMatchInput,
  requestId: string,
): Promise<ResourceResult> {
  const transactionId = validateId(body.transaction_id, 100)
  if (!transactionId) {
    return resourceError('transaction_id is required', 400, {}, 'invalid_transaction_id')
  }

  const bankTransactionId = validateId(body.bank_transaction_id, 100)
  if (!bankTransactionId) {
    return resourceError('bank_transaction_id is required', 400, {}, 'invalid_bank_transaction_id')
  }

  const { data: transaction } = await supabase
    .from('transactions')
    .select('id, created_at, status, metadata')
    .eq('id', transactionId)
    .eq('ledger_id', ledger.id)
    .maybeSingle()

  if (!transaction?.id) {
    return resourceError('Transaction not found', 404, {}, 'transaction_not_found')
  }

  const transactionDate = String(transaction.created_at || '').split('T')[0]
  const { data: lockedPeriod } = await supabase
    .from('accounting_periods')
    .select('id, status')
    .eq('ledger_id', ledger.id)
    .in('status', ['closed', 'locked'])
    .lte('period_start', transactionDate)
    .gte('period_end', transactionDate)
    .maybeSingle()

  if (lockedPeriod?.id) {
    return resourceError(
      'Cannot reconcile transaction in a locked period',
      403,
      { period_id: lockedPeriod.id },
      'locked_period',
    )
  }

  const { data: match, error: matchError } = await supabase
    .from('bank_matches')
    .upsert({
      ledger_id: ledger.id,
      transaction_id: transactionId,
      bank_transaction_id: bankTransactionId,
      matched_at: new Date().toISOString(),
      status: 'matched',
    }, { onConflict: 'transaction_id' })
    .select('id, matched_at, status')
    .single()

  if (matchError || !match?.id) {
    console.error('createReconciliationMatchResponse match error:', matchError)
    return resourceError('Failed to create reconciliation match', 500, {}, 'reconciliation_match_failed')
  }

  await supabase
    .from('transactions')
    .update({
      status: 'reconciled',
      metadata: {
        ...(transaction.metadata || {}),
        reconciled: true,
        bank_match_id: match.id,
        reconciled_at: match.matched_at,
      },
    })
    .eq('id', transactionId)

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'reconcile_match',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      transaction_id: transactionId,
      bank_transaction_id: bankTransactionId,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    match: {
      id: match.id,
      transaction_id: transactionId,
      bank_transaction_id: bankTransactionId,
      status: 'matched',
      matched_at: match.matched_at,
    },
  }, 201)
}

export async function deleteReconciliationMatchResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  transactionIdRaw: string,
  requestId: string,
): Promise<ResourceResult> {
  const transactionId = validateId(transactionIdRaw, 100)
  if (!transactionId) {
    return resourceError('transaction_id is required', 400, {}, 'invalid_transaction_id')
  }

  const { data: transaction } = await supabase
    .from('transactions')
    .select('id, created_at, metadata')
    .eq('id', transactionId)
    .eq('ledger_id', ledger.id)
    .maybeSingle()

  if (!transaction?.id) {
    return resourceError('Transaction not found', 404, {}, 'transaction_not_found')
  }

  const transactionDate = String(transaction.created_at || '').split('T')[0]
  const { data: lockedPeriod } = await supabase
    .from('accounting_periods')
    .select('id')
    .eq('ledger_id', ledger.id)
    .in('status', ['closed', 'locked'])
    .lte('period_start', transactionDate)
    .gte('period_end', transactionDate)
    .maybeSingle()

  if (lockedPeriod?.id) {
    return resourceError(
      'Cannot unmatch transaction in a locked period',
      403,
      { period_id: lockedPeriod.id },
      'locked_period',
    )
  }

  await supabase.from('bank_matches').delete().eq('transaction_id', transactionId)

  const nextMetadata = { ...(transaction.metadata || {}) }
  delete nextMetadata.reconciled
  delete nextMetadata.bank_match_id
  delete nextMetadata.reconciled_at

  await supabase
    .from('transactions')
    .update({
      status: 'completed',
      metadata: nextMetadata,
    })
    .eq('id', transactionId)

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'reconcile_unmatch',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      transaction_id: transactionId,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    deleted: true,
    transaction_id: transactionId,
  })
}

export async function listUnmatchedTransactionsResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  options: ReconciliationUnmatchedInput,
  _requestId: string,
): Promise<ResourceResult> {
  const limit = clampLimit(options.limit, 100, 500)

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('id, reference_id, description, amount, currency, created_at, status, metadata')
    .eq('ledger_id', ledger.id)
    .not('status', 'in', '("voided","reversed","reconciled")')
    .is('metadata->reconciled', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('listUnmatchedTransactionsResponse error:', error)
    return resourceError('Failed to list unmatched transactions', 500, {}, 'reconciliation_query_failed')
  }

  return resourceOk({
    success: true,
    unmatched_count: transactions?.length || 0,
    transactions: (transactions || []).map((transaction) => ({
      id: transaction.id,
      reference_id: transaction.reference_id,
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency || 'USD',
      created_at: transaction.created_at,
      status: transaction.status,
      metadata: transaction.metadata || {},
    })),
  })
}

export async function createReconciliationSnapshotResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: ReconciliationSnapshotInput,
  _requestId: string,
): Promise<ResourceResult> {
  if (!body.period_id && !body.as_of_date) {
    return resourceError('period_id or as_of_date is required', 400, {}, 'missing_snapshot_scope')
  }

  let periodStart: string
  let periodEnd: string
  let periodId: string | null = null

  if (body.period_id) {
    const periodIdValue = validateId(body.period_id, 100)
    if (!periodIdValue) {
      return resourceError('period_id is invalid', 400, {}, 'invalid_period_id')
    }

    const { data: period } = await supabase
      .from('accounting_periods')
      .select('id, period_start, period_end')
      .eq('id', periodIdValue)
      .eq('ledger_id', ledger.id)
      .maybeSingle()

    if (!period?.id) {
      return resourceError('Period not found', 404, {}, 'period_not_found')
    }

    periodId = period.id
    periodStart = period.period_start
    periodEnd = period.period_end
  } else {
    const validatedDate = validateDate(body.as_of_date)
    if (!validatedDate) {
      return resourceError('as_of_date must be a valid ISO date', 400, {}, 'invalid_as_of_date')
    }

    periodStart = '1900-01-01'
    periodEnd = validatedDate.slice(0, 10)
  }

  const { data: matches } = await supabase
    .from('bank_matches')
    .select('id, transaction_id, bank_transaction_id, matched_at, transactions!inner(id, amount, description, created_at, reference_id)')
    .eq('ledger_id', ledger.id)
    .eq('status', 'matched')
    .gte('transactions.created_at', `${periodStart}T00:00:00`)
    .lte('transactions.created_at', `${periodEnd}T23:59:59`)

  const { data: allTransactions } = await supabase
    .from('transactions')
    .select('id, amount, currency, description, created_at, reference_id, status, metadata')
    .eq('ledger_id', ledger.id)
    .not('status', 'in', '("voided","reversed")')
    .gte('created_at', `${periodStart}T00:00:00`)
    .lte('created_at', `${periodEnd}T23:59:59`)

  const matchedIds = new Set((matches || []).map((match: any) => String(match.transaction_id)))
  const unmatchedTransactions = (allTransactions || []).filter((transaction: any) =>
    !matchedIds.has(String(transaction.id)) && transaction.metadata?.reconciled !== true,
  )

  const matchedTotal = (matches || []).reduce((sum: number, match: any) => sum + Number(match.transactions?.amount || 0), 0)
  const unmatchedTotal = unmatchedTransactions.reduce((sum: number, transaction: any) => sum + Number(transaction.amount || 0), 0)

  const snapshotData = {
    period_start: periodStart,
    period_end: periodEnd,
    created_at: new Date().toISOString(),
    matched_transactions: (matches || []).map((match: any) => ({
      transaction_id: match.transaction_id,
      bank_transaction_id: match.bank_transaction_id,
      amount: Number(match.transactions?.amount || 0),
      currency: match.transactions?.currency || 'USD',
      reference: match.transactions?.reference_id || null,
      matched_at: match.matched_at,
    })),
    unmatched_transactions: unmatchedTransactions.map((transaction: any) => ({
      transaction_id: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency || 'USD',
      reference: transaction.reference_id,
      date: transaction.created_at,
    })),
    summary: {
      total_matched: matches?.length || 0,
      total_unmatched: unmatchedTransactions.length,
      matched_amount: matchedTotal,
      unmatched_amount: unmatchedTotal,
    },
  }

  const integrityHash = await generateHash(snapshotData)

  const { data: snapshot, error } = await supabase
    .from('reconciliation_snapshots')
    .insert({
      ledger_id: ledger.id,
      period_id: periodId,
      period_start: periodStart,
      period_end: periodEnd,
      snapshot_data: snapshotData,
      integrity_hash: integrityHash,
      matched_count: matches?.length || 0,
      unmatched_count: unmatchedTransactions.length,
      matched_total: matchedTotal,
      unmatched_total: unmatchedTotal,
    })
    .select('id, created_at')
    .single()

  if (error || !snapshot?.id) {
    console.error('createReconciliationSnapshotResponse error:', error)
    return resourceError('Failed to create snapshot', 500, {}, 'snapshot_create_failed')
  }

  return resourceOk({
    success: true,
    snapshot: {
      id: snapshot.id,
      period_id: periodId,
      period_start: periodStart,
      period_end: periodEnd,
      created_at: snapshot.created_at,
      integrity_hash: integrityHash,
      summary: snapshotData.summary,
    },
  }, 201)
}

export async function getReconciliationSnapshotResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  periodIdRaw: string,
  _requestId: string,
): Promise<ResourceResult> {
  const periodId = validateId(periodIdRaw, 100)
  if (!periodId) {
    return resourceError('period_id is invalid', 400, {}, 'invalid_period_id')
  }

  const { data: snapshot } = await supabase
    .from('reconciliation_snapshots')
    .select('id, period_id, period_start, period_end, created_at, integrity_hash, snapshot_data')
    .eq('ledger_id', ledger.id)
    .eq('period_id', periodId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!snapshot?.id) {
    return resourceError('No snapshot found for this period', 404, {}, 'snapshot_not_found')
  }

  const integrityHash = await generateHash(snapshot.snapshot_data)
  const integrityValid = integrityHash === snapshot.integrity_hash

  return resourceOk({
    success: true,
    snapshot: {
      id: snapshot.id,
      period_id: snapshot.period_id,
      period_start: snapshot.period_start,
      period_end: snapshot.period_end,
      created_at: snapshot.created_at,
      integrity_hash: snapshot.integrity_hash,
      integrity_valid: integrityValid,
      summary: snapshot.snapshot_data?.summary || {
        total_matched: 0,
        total_unmatched: 0,
        matched_amount: 0,
        unmatched_amount: 0,
      },
    },
  })
}

export async function autoMatchReconciliationResponse(
  _req: Request,
  supabase: SupabaseClient,
  _ledger: LedgerContext,
  body: ReconciliationAutoMatchInput,
  _requestId: string,
): Promise<ResourceResult> {
  const bankAggregatorTransactionId = validateId(body.bank_aggregator_transaction_id, 36)
  if (!bankAggregatorTransactionId) {
    return resourceError(
      'bank_aggregator_transaction_id is required',
      400,
      {},
      'invalid_bank_aggregator_transaction_id',
    )
  }

  const { data, error } = await supabase.rpc('auto_match_bank_aggregator_transaction', {
    p_bank_aggregator_txn_id: bankAggregatorTransactionId,
  })

  if (error) {
    console.error('autoMatchReconciliationResponse error:', error)
    return resourceError(`Auto-match failed: ${error.message}`, 500, {}, 'auto_match_failed')
  }

  const result = Array.isArray(data) ? data[0] : data

  return resourceOk({
    success: true,
    result: {
      matched: Boolean(result?.matched),
      match_type: result?.match_type || null,
      matched_transaction_id: result?.matched_transaction_id || null,
      bank_aggregator_transaction_id: bankAggregatorTransactionId,
    },
  })
}
