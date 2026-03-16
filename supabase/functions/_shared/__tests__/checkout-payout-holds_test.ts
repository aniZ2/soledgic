import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { createCheckoutResponse } from '../checkout-service.ts'
import { processPayoutResponse } from '../payout-service.ts'
import { releaseHeldFundsResponse, listHeldFundsResponse } from '../holds-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// CHECKOUT SERVICE — split calculation logic
// ==========================================================================

Deno.test('checkout: split uses default 80/20 when no overrides exist', async () => {
  let insertedSession: Record<string, unknown> = {}

  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
          },
        }
      }
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'acct_1', is_active: true, metadata: {} },
              error: null,
            })
          },
          single() {
            return Promise.resolve({
              data: { metadata: {} },
              error: null,
            })
          },
        }
      }
      if (table === 'checkout_sessions') {
        return {
          insert(row: Record<string, unknown>) {
            insertedSession = row
            return {
              select() { return this },
              single() {
                return Promise.resolve({
                  data: { id: 'sess_1', expires_at: '2026-01-01T01:00:00Z' },
                  error: null,
                })
              },
            }
          },
        }
      }
      if (table === 'audit_log') {
        return { insert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 10000,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  // Default split: 80% creator, 20% platform
  assertEquals(body.checkout_session.breakdown.creator_percent, 80)
  assertEquals(body.checkout_session.breakdown.creator_amount, 80) // 10000 * 0.80 / 100
  assertEquals(body.checkout_session.breakdown.platform_amount, 20) // 10000 * 0.20 / 100

  // Verify the session was created with correct split amounts
  assertEquals(insertedSession['creator_percent'], 80)
  assertEquals(insertedSession['creator_amount'], 8000) // in cents
  assertEquals(insertedSession['platform_amount'], 2000) // in cents
})

Deno.test('checkout: split uses product_splits override when available', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { creator_percent: 70 },
              error: null,
            })
          },
        }
      }
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'acct_1', is_active: true, metadata: {} },
              error: null,
            })
          },
        }
      }
      if (table === 'checkout_sessions') {
        return {
          insert() {
            return {
              select() { return this },
              single() {
                return Promise.resolve({
                  data: { id: 'sess_2', expires_at: '2026-01-01T01:00:00Z' },
                  error: null,
                })
              },
            }
          },
        }
      }
      if (table === 'audit_log') {
        return { insert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 10000,
    participant_id: 'creator1',
    product_id: 'prod_1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.checkout_session.breakdown.creator_percent, 70)
  assertEquals(body.checkout_session.breakdown.creator_amount, 70) // 10000 * 0.70 / 100
  assertEquals(body.checkout_session.breakdown.platform_amount, 30) // 10000 * 0.30 / 100
})

Deno.test('checkout: split uses ledger default_split_percent setting', async () => {
  const customLedger = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    business_name: 'Test Platform',
    settings: { default_split_percent: 90 },
  } as any

  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
          },
        }
      }
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'acct_1', is_active: true, metadata: {} },
              error: null,
            })
          },
          single() {
            return Promise.resolve({
              data: { metadata: {} },
              error: null,
            })
          },
        }
      }
      if (table === 'checkout_sessions') {
        return {
          insert() {
            return {
              select() { return this },
              single() {
                return Promise.resolve({
                  data: { id: 'sess_3', expires_at: '2026-01-01T01:00:00Z' },
                  error: null,
                })
              },
            }
          },
        }
      }
      if (table === 'audit_log') {
        return { insert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, customLedger, {
    amount: 10000,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.checkout_session.breakdown.creator_percent, 90)
  assertEquals(body.checkout_session.breakdown.creator_amount, 90)
  assertEquals(body.checkout_session.breakdown.platform_amount, 10)
})

Deno.test('checkout: rejects amount below minimum 50 cents', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: 25,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'amount_below_minimum')
})

Deno.test('checkout: rejects invalid currency', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'acct_1', is_active: true },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 5000,
    participant_id: 'creator1',
    currency: 'XYZ',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_currency')
})

Deno.test('checkout: rejects deleted participant', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'acct_1', is_active: false },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 5000,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 410)
  assertEquals(result.body.error_code, 'participant_deleted')
})

Deno.test('checkout: rejects merchant_id override', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
          },
        }
      }
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: { id: 'acct_1', is_active: true, metadata: {} },
              error: null,
            })
          },
          single() {
            return Promise.resolve({
              data: { metadata: {} },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 5000,
    participant_id: 'creator1',
    payment_method_id: 'pm_123',
    merchant_id: 'merch_evil',
  } as any, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'merchant_override_not_allowed')
})

// ==========================================================================
// PAYOUT SERVICE — idempotency conflict, retry exhaustion, error mapping
// ==========================================================================

Deno.test('payout: returns 409 on idempotency conflict', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: 'Idempotency conflict: reference_id already used',
            details: null,
          },
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
    from() {
      return { insert() { return Promise.resolve({ error: null }) } }
    },
  } as any

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_dup',
  }, requestId)

  assertEquals(result.status, 409)
  assertEquals(result.body.error_code, 'idempotency_conflict')
})

Deno.test('payout: exhausts retries on persistent transient errors', async () => {
  let rpcCalls = 0

  const supabase = {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        rpcCalls++
        return Promise.resolve({
          data: null,
          error: {
            code: '40001',
            message: 'could not serialize access',
            details: null,
          },
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
    from() {
      return { insert() { return Promise.resolve({ error: null }) } }
    },
  } as any

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_retry_exhaust',
  }, requestId)

  // Should have tried 3 times
  assertEquals(rpcCalls, 3)
  assertEquals(result.status, 500)
  assertEquals(result.body.error_code, 'payout_processing_failed')
})

Deno.test('payout: maps insufficient_balance status to 400 with details', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        return Promise.resolve({
          data: {
            status: 'insufficient_balance',
            ledger_balance: 30,
            held_amount: 10,
            available: 20,
            requested: 50,
          },
          error: null,
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
    from() {
      return { insert() { return Promise.resolve({ error: null }) } }
    },
  } as any

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_insuf',
  }, requestId)

  assertEquals(result.status, 400)
  const body = result.body as any
  assertEquals(body.error_code, 'insufficient_balance')
  assertEquals(body.details.available, 20)
  assertEquals(body.details.held_amount, 10)
})

Deno.test('payout: maps duplicate reference_id to 409', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        return Promise.resolve({
          data: {
            status: 'duplicate',
            transaction_id: 'txn_existing',
          },
          error: null,
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
    from() {
      return {
        insert() { return Promise.resolve({ error: null }) },
      }
    },
  } as any

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_dup_ref',
  }, requestId)

  assertEquals(result.status, 409)
  const body = result.body as any
  assertEquals(body.error_code, 'duplicate_reference_id')
  assertEquals(body.transaction_id, 'txn_existing')
})

Deno.test('payout: rejects invalid fees_paid_by value', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_badfees',
    fees_paid_by: 'customer' as any,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_fees_paid_by')
})

Deno.test('payout: maps creator_not_found RPC status to 404', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        return Promise.resolve({
          data: {
            status: 'error',
            error: 'creator_not_found',
          },
          error: null,
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
    from() {
      return { insert() { return Promise.resolve({ error: null }) } }
    },
  } as any

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'nonexistent',
    amount: 5000,
    reference_id: 'payout_notfound',
  }, requestId)

  assertEquals(result.status, 404)
})

// ==========================================================================
// HOLDS SERVICE — release flow validation, error classification
// ==========================================================================

Deno.test('holds release: rejects non-UUID entry_id', async () => {
  const result = await releaseHeldFundsResponse(req, {} as any, ledger, {
    entry_id: 'not-a-uuid-at-all',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_hold_id')
})

Deno.test('holds release: rejects missing entry_id', async () => {
  const result = await releaseHeldFundsResponse(req, {} as any, ledger, {
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_hold_id')
})

Deno.test('holds release: classifies "not found" errors as 409 conflict', async () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440001'
  const supabase = {
    rpc() {
      return Promise.resolve({
        data: null,
        error: { message: 'Entry not found or not held', code: 'P0001' },
      })
    },
  } as any

  const result = await releaseHeldFundsResponse(req, supabase, ledger, {
    entry_id: validUuid,
  }, requestId)

  assertEquals(result.status, 409)
  assertEquals(result.body.error_code, 'hold_release_conflict')
})

Deno.test('holds release: classifies "already released" errors as 409 conflict', async () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440002'
  const supabase = {
    rpc() {
      return Promise.resolve({
        data: null,
        error: { message: 'Entry already released', code: 'P0001' },
      })
    },
  } as any

  const result = await releaseHeldFundsResponse(req, supabase, ledger, {
    entry_id: validUuid,
  }, requestId)

  assertEquals(result.status, 409)
  assertEquals(result.body.error_code, 'hold_release_conflict')
})

Deno.test('holds list: rejects invalid venture_id', async () => {
  const result = await listHeldFundsResponse(req, {} as any, ledger, {
    venture_id: 'bad venture id!',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_venture_id')
})

Deno.test('holds list: rejects invalid participant_id', async () => {
  const result = await listHeldFundsResponse(req, {} as any, ledger, {
    participant_id: 'bad participant!',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})
