import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  createReconciliationMatchResponse,
  deleteReconciliationMatchResponse,
  listUnmatchedTransactionsResponse,
  createReconciliationSnapshotResponse,
  getReconciliationSnapshotResponse,
  autoMatchReconciliationResponse,
} from '../reconciliations-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// createReconciliationMatchResponse — input validation
// ==========================================================================

Deno.test('reconciliation match: rejects missing transaction_id', async () => {
  const supabase = {} as any
  const result = await createReconciliationMatchResponse(req, supabase, ledger, {
    bank_transaction_id: 'bank_tx_1',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_transaction_id')
})

Deno.test('reconciliation match: rejects missing bank_transaction_id', async () => {
  const supabase = {} as any
  const result = await createReconciliationMatchResponse(req, supabase, ledger, {
    transaction_id: 'tx_1',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_bank_transaction_id')
})

Deno.test('reconciliation match: returns 404 when transaction not found', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await createReconciliationMatchResponse(req, supabase, ledger, {
    transaction_id: 'tx_not_found',
    bank_transaction_id: 'bank_tx_1',
  }, requestId)
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'transaction_not_found')
})

Deno.test('reconciliation match: rejects when in locked period', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'tx_1', created_at: '2026-03-01T10:00:00Z', status: 'completed', metadata: {} },
              error: null,
            })
          },
        }
      }
      if (table === 'accounting_periods') {
        return {
          select() { return this },
          eq() { return this },
          in() { return this },
          lte() { return this },
          gte() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'period_1', status: 'locked' },
              error: null,
            })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await createReconciliationMatchResponse(req, supabase, ledger, {
    transaction_id: 'tx_1',
    bank_transaction_id: 'bank_tx_1',
  }, requestId)
  assertEquals(result.status, 403)
  assertEquals(result.body.error_code, 'locked_period')
})

// ==========================================================================
// deleteReconciliationMatchResponse — validation
// ==========================================================================

Deno.test('reconciliation unmatch: rejects invalid transaction_id', async () => {
  const supabase = {} as any
  const result = await deleteReconciliationMatchResponse(req, supabase, ledger, '', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_transaction_id')
})

// ==========================================================================
// listUnmatchedTransactionsResponse
// ==========================================================================

Deno.test('list unmatched transactions: returns empty list on no data', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        not() { return this },
        is() { return this },
        order() { return this },
        limit() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any

  const result = await listUnmatchedTransactionsResponse(req, supabase, ledger, {}, requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  assertEquals(result.body.unmatched_count, 0)
})

// ==========================================================================
// createReconciliationSnapshotResponse — validation
// ==========================================================================

Deno.test('reconciliation snapshot: requires period_id or as_of_date', async () => {
  const supabase = {} as any
  const result = await createReconciliationSnapshotResponse(req, supabase, ledger, {}, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'missing_snapshot_scope')
})

Deno.test('reconciliation snapshot: rejects invalid as_of_date', async () => {
  const supabase = {} as any
  const result = await createReconciliationSnapshotResponse(req, supabase, ledger, {
    as_of_date: 'not-a-date',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_as_of_date')
})

Deno.test('reconciliation snapshot: returns 404 for unknown period_id', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'accounting_periods') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await createReconciliationSnapshotResponse(req, supabase, ledger, {
    period_id: 'period_unknown',
  }, requestId)
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'period_not_found')
})

// ==========================================================================
// getReconciliationSnapshotResponse — validation
// ==========================================================================

Deno.test('get reconciliation snapshot: rejects invalid period_id', async () => {
  const supabase = {} as any
  const result = await getReconciliationSnapshotResponse(req, supabase, ledger, '', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_period_id')
})

// ==========================================================================
// autoMatchReconciliationResponse — validation
// ==========================================================================

Deno.test('auto match: rejects missing bank_aggregator_transaction_id', async () => {
  const supabase = {} as any
  const result = await autoMatchReconciliationResponse(req, supabase, ledger, {}, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_bank_aggregator_transaction_id')
})

Deno.test('auto match: returns result from RPC', async () => {
  const supabase = {
    rpc(_name: string, _params: any) {
      return Promise.resolve({
        data: [{ matched: true, match_type: 'amount_date', matched_transaction_id: 'tx_42' }],
        error: null,
      })
    },
  } as any

  const result = await autoMatchReconciliationResponse(req, supabase, ledger, {
    bank_aggregator_transaction_id: 'bat_123',
  }, requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  const res = result.body.result as Record<string, unknown>
  assertEquals(res.matched, true)
  assertEquals(res.match_type, 'amount_date')
  assertEquals(res.matched_transaction_id, 'tx_42')
})
