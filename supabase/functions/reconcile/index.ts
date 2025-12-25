// Soledgic Edge Function: Reconciliation
// POST /reconcile
// Handles bank reconciliation with snapshot freezing per period
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  getClientIp,
  validateId,
  LedgerContext
} from '../_shared/utils.ts'

type Action = 'match' | 'unmatch' | 'create_snapshot' | 'get_snapshot' | 'list_unmatched' | 'auto_match'

interface ReconcileRequest {
  action: Action
  transaction_id?: string
  bank_transaction_id?: string
  period_id?: string
  as_of_date?: string
  matches?: Array<{ transaction_id: string; bank_transaction_id: string }>
}

async function generateHash(data: any): Promise<string> {
  const json = JSON.stringify(data, Object.keys(data).sort())
  const buffer = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

const handler = createHandler(
  { endpoint: 'reconcile', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: ReconcileRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    switch (body.action) {
      case 'match': {
        if (!body.transaction_id || !body.bank_transaction_id) {
          return errorResponse('transaction_id and bank_transaction_id required', 400, req, requestId)
        }

        const txId = validateId(body.transaction_id, 100)
        const bankTxId = validateId(body.bank_transaction_id, 100)
        if (!txId || !bankTxId) {
          return errorResponse('Invalid transaction IDs', 400, req, requestId)
        }

        const { data: tx } = await supabase
          .from('transactions')
          .select('id, created_at, status, metadata')
          .eq('id', txId)
          .eq('ledger_id', ledger.id)
          .single()

        if (!tx) {
          return errorResponse('Transaction not found', 404, req, requestId)
        }

        const txDate = tx.created_at?.split('T')[0]
        const { data: lockedPeriod } = await supabase
          .from('accounting_periods')
          .select('id, status')
          .eq('ledger_id', ledger.id)
          .in('status', ['closed', 'locked'])
          .lte('period_start', txDate)
          .gte('period_end', txDate)
          .single()

        if (lockedPeriod) {
          return jsonResponse({ 
            success: false, 
            error: 'Cannot reconcile transaction in a locked period',
            period_id: lockedPeriod.id
          }, 403, req, requestId)
        }

        const { data: match, error: matchError } = await supabase
          .from('bank_matches')
          .upsert({
            ledger_id: ledger.id,
            transaction_id: txId,
            bank_transaction_id: bankTxId,
            matched_at: new Date().toISOString(),
            status: 'matched'
          }, { onConflict: 'transaction_id' })
          .select()
          .single()

        if (matchError) {
          console.error('Match error:', matchError)
          return errorResponse('Failed to create match', 500, req, requestId)
        }

        await supabase
          .from('transactions')
          .update({
            status: 'reconciled',
            metadata: { ...tx.metadata, reconciled: true, bank_match_id: match.id, reconciled_at: new Date().toISOString() }
          })
          .eq('id', txId)

        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'reconcile_match',
          entity_type: 'transaction',
          entity_id: txId,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_id: requestId,
        })

        return jsonResponse({
          success: true,
          match_id: match.id,
          transaction_id: txId,
          bank_transaction_id: bankTxId
        }, 200, req, requestId)
      }

      case 'unmatch': {
        if (!body.transaction_id) {
          return errorResponse('transaction_id required', 400, req, requestId)
        }

        const txId = validateId(body.transaction_id, 100)
        if (!txId) {
          return errorResponse('Invalid transaction_id', 400, req, requestId)
        }

        const { data: tx } = await supabase
          .from('transactions')
          .select('id, created_at, metadata')
          .eq('id', txId)
          .eq('ledger_id', ledger.id)
          .single()

        if (!tx) {
          return errorResponse('Transaction not found', 404, req, requestId)
        }

        const txDate = tx.created_at?.split('T')[0]
        const { data: lockedPeriod } = await supabase
          .from('accounting_periods')
          .select('id')
          .eq('ledger_id', ledger.id)
          .in('status', ['closed', 'locked'])
          .lte('period_start', txDate)
          .gte('period_end', txDate)
          .single()

        if (lockedPeriod) {
          return errorResponse('Cannot unmatch transaction in a locked period', 403, req, requestId)
        }

        await supabase.from('bank_matches').delete().eq('transaction_id', txId)

        const newMetadata = { ...tx.metadata }
        delete newMetadata.reconciled
        delete newMetadata.bank_match_id
        delete newMetadata.reconciled_at

        await supabase
          .from('transactions')
          .update({ status: 'completed', metadata: newMetadata })
          .eq('id', txId)

        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'reconcile_unmatch',
          entity_type: 'transaction',
          entity_id: txId,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_id: requestId,
        })

        return jsonResponse({ success: true, transaction_id: txId }, 200, req, requestId)
      }

      case 'create_snapshot': {
        if (!body.period_id && !body.as_of_date) {
          return errorResponse('period_id or as_of_date required', 400, req, requestId)
        }

        let periodStart: string, periodEnd: string, periodId: string | null = body.period_id || null

        if (body.period_id) {
          const { data: period } = await supabase
            .from('accounting_periods')
            .select('*')
            .eq('id', body.period_id)
            .eq('ledger_id', ledger.id)
            .single()

          if (!period) {
            return errorResponse('Period not found', 404, req, requestId)
          }
          periodStart = period.period_start
          periodEnd = period.period_end
        } else {
          periodEnd = body.as_of_date!
          periodStart = '1900-01-01'
        }

        const { data: matches } = await supabase
          .from('bank_matches')
          .select(`id, transaction_id, bank_transaction_id, matched_at, transactions!inner(id, amount, description, created_at, reference_id)`)
          .eq('ledger_id', ledger.id)
          .eq('status', 'matched')
          .gte('transactions.created_at', periodStart)
          .lte('transactions.created_at', periodEnd + 'T23:59:59')

        const { data: allTx } = await supabase
          .from('transactions')
          .select('id, amount, description, created_at, reference_id, status, metadata')
          .eq('ledger_id', ledger.id)
          .not('status', 'in', '("voided","reversed")')
          .gte('created_at', periodStart)
          .lte('created_at', periodEnd + 'T23:59:59')

        const matchedIds = new Set((matches || []).map(m => m.transaction_id))
        const unmatchedTx = (allTx || []).filter(t => !matchedIds.has(t.id) && t.metadata?.reconciled !== true)

        const matchedTotal = (matches || []).reduce((sum, m) => sum + Number((m as any).transactions?.amount || 0), 0)
        const unmatchedTotal = unmatchedTx.reduce((sum, t) => sum + Number(t.amount || 0), 0)

        const snapshotData = {
          period_start: periodStart,
          period_end: periodEnd,
          created_at: new Date().toISOString(),
          matched_transactions: (matches || []).map(m => ({
            transaction_id: m.transaction_id,
            bank_transaction_id: m.bank_transaction_id,
            amount: (m as any).transactions?.amount,
            reference: (m as any).transactions?.reference_id,
            matched_at: m.matched_at
          })),
          unmatched_transactions: unmatchedTx.map(t => ({
            transaction_id: t.id,
            amount: t.amount,
            reference: t.reference_id,
            date: t.created_at
          })),
          summary: {
            total_matched: matches?.length || 0,
            total_unmatched: unmatchedTx.length,
            matched_amount: matchedTotal,
            unmatched_amount: unmatchedTotal
          }
        }

        const snapshotHash = await generateHash(snapshotData)

        const { data: snapshot, error: snapshotError } = await supabase
          .from('reconciliation_snapshots')
          .insert({
            ledger_id: ledger.id,
            period_id: periodId,
            period_start: periodStart,
            period_end: periodEnd,
            snapshot_data: snapshotData,
            integrity_hash: snapshotHash,
            matched_count: matches?.length || 0,
            unmatched_count: unmatchedTx.length,
            matched_total: matchedTotal,
            unmatched_total: unmatchedTotal
          })
          .select('id')
          .single()

        if (snapshotError) {
          console.error('Snapshot error:', snapshotError)
          return errorResponse('Failed to create snapshot', 500, req, requestId)
        }

        return jsonResponse({
          success: true,
          snapshot_id: snapshot.id,
          integrity_hash: snapshotHash,
          summary: snapshotData.summary
        }, 200, req, requestId)
      }

      case 'get_snapshot': {
        if (!body.period_id) {
          return errorResponse('period_id required', 400, req, requestId)
        }

        const { data: snapshot } = await supabase
          .from('reconciliation_snapshots')
          .select('*')
          .eq('ledger_id', ledger.id)
          .eq('period_id', body.period_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!snapshot) {
          return errorResponse('No snapshot found for this period', 404, req, requestId)
        }

        const currentHash = await generateHash(snapshot.snapshot_data)
        const integrityValid = currentHash === snapshot.integrity_hash

        return jsonResponse({
          success: true,
          snapshot: {
            id: snapshot.id,
            period_start: snapshot.period_start,
            period_end: snapshot.period_end,
            created_at: snapshot.created_at,
            integrity_hash: snapshot.integrity_hash,
            integrity_valid: integrityValid,
            summary: snapshot.snapshot_data.summary
          }
        }, 200, req, requestId)
      }

      case 'list_unmatched': {
        const { data: transactions } = await supabase
          .from('transactions')
          .select('id, reference_id, description, amount, created_at, status, metadata')
          .eq('ledger_id', ledger.id)
          .not('status', 'in', '("voided","reversed","reconciled")')
          .is('metadata->reconciled', null)
          .order('created_at', { ascending: false })
          .limit(100)

        return jsonResponse({
          success: true,
          unmatched_count: transactions?.length || 0,
          transactions: transactions || []
        }, 200, req, requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
