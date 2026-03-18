import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { processPayoutResponse } from '../payout-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  organization_id: 'org_test_1',
  livemode: false,
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// Helper: mock supabase that passes capabilities and daily total checks
function makeCapPassingSupabase(overrides: Record<string, any> = {}) {
  return {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        return Promise.resolve(overrides.rpcResult || { data: null, error: null })
      }
      // queue_webhook, update_creator_risk_score, apply_payout_hold, etc.
      return Promise.resolve({ error: null })
    },
    from(table: string) {
      if (table === 'organizations') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { capabilities: { can_payout: true } },
              error: null,
            })
          },
        }
      }
      if (table === 'ledgers') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { organization_id: 'org_test_1' },
              error: null,
            })
          },
        }
      }
      if (table === 'transactions') {
        return {
          select() { return this },
          eq() { return this },
          in() { return this },
          gte() { return this },
          then(resolve: any) { resolve({ data: [], error: null }); return { catch() {} } },
        }
      }
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        gte() { return chain },
        neq() { return chain },
        single() { return Promise.resolve({ data: null, error: null }) },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        insert() { return Promise.resolve({ error: null }) },
      }
      return chain
    },
  } as any
}

// ==========================================================================
// PAYOUT SERVICE — fees, description, metadata validation
// (idempotency, retry, insufficient_balance, duplicate, fees_paid_by, and
//  error mapping tests are in checkout-payout-holds_test.ts — NOT duplicated)
// ==========================================================================

Deno.test('payout: rejects negative fees', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_negfees',
    fees: -100,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_fees')
})

Deno.test('payout: rejects non-numeric fees', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_nanfees',
    fees: 'abc' as any,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_fees')
})

Deno.test('payout: accepts zero fees', async () => {
  const supabase = makeCapPassingSupabase({
    rpcResult: {
      data: {
        status: 'success',
        transaction_id: 'txn_zerofees',
        gross_payout: 5000,
        fees: 0,
        net_to_creator: 5000,
        previous_balance: 10000,
        new_balance: 5000,
      },
      error: null,
    },
  })

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_zerofees',
    fees: 0,
  }, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  assertEquals(body.payout.fees, 0)
})

Deno.test('payout: rejects zero amount', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'creator1',
    amount: 0,
    reference_id: 'payout_zero',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('payout: rejects negative amount', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'creator1',
    amount: -500,
    reference_id: 'payout_neg',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('payout: sanitizes metadata — strips unknown keys, keeps external_id and notes', async () => {
  let rpcArgs: Record<string, unknown> = {}

  const supabase = {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'process_payout_atomic') {
        rpcArgs = args
        return Promise.resolve({
          data: {
            status: 'success',
            transaction_id: 'txn_meta',
            gross_payout: 5000,
            fees: 0,
            net_to_creator: 5000,
            previous_balance: 10000,
            new_balance: 5000,
          },
          error: null,
        })
      }
      // queue_webhook, update_creator_risk_score, etc.
      return Promise.resolve({ error: null })
    },
    from(table: string) {
      if (table === 'organizations') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { capabilities: { can_payout: true } },
              error: null,
            })
          },
        }
      }
      if (table === 'ledgers') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { organization_id: 'org_test_1' },
              error: null,
            })
          },
        }
      }
      if (table === 'transactions') {
        return {
          select() { return this },
          eq() { return this },
          in() { return this },
          gte() { return this },
          then(resolve: any) { resolve({ data: [], error: null }); return { catch() {} } },
        }
      }
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        gte() { return chain },
        neq() { return chain },
        single() { return Promise.resolve({ data: null, error: null }) },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        insert() { return Promise.resolve({ error: null }) },
      }
      return chain
    },
  } as any

  await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: 'payout_meta',
    metadata: {
      external_id: 'ext_123',
      notes: 'Valid note',
      evil_script: '<script>alert(1)</script>',
      random_field: 'should be stripped',
    },
  }, requestId)

  const passedMeta = rpcArgs.p_metadata as Record<string, any>
  assertEquals(passedMeta.external_id, 'ext_123')
  assertEquals(typeof passedMeta.notes, 'string')
  // Unknown keys should NOT be present
  assertEquals(passedMeta.evil_script, undefined)
  assertEquals(passedMeta.random_field, undefined)
})

Deno.test('payout: rejects empty participant_id', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: '',
    amount: 5000,
    reference_id: 'payout_nopid',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('payout: rejects empty reference_id', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'creator1',
    amount: 5000,
    reference_id: '',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_reference_id')
})
