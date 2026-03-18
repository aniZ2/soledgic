import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { recordRefundResponse } from '../refund-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  organization_id: 'org_test_1',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// Helper: supabase mock that returns a valid original sale
function makeSaleFoundSupabase(saleAmount: number, existingRefunds: any[] = []) {
  return {
    from(table: string) {
      if (table === 'transactions') {
        return {
          select() { return this },
          eq() { return this },
          not() { return this },
          in() { return this },
          single() {
            return Promise.resolve({
              data: {
                id: 'txn_original',
                amount: saleAmount, // major units (dollars)
                currency: 'USD',
                status: 'completed',
                reference_id: 'sale_ref_1',
                metadata: { creator_id: 'creator1' },
                reversed_by: null,
              },
              error: null,
            })
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null })
          },
          then(resolve: any) {
            resolve({ data: existingRefunds, error: null })
            return { catch() {} }
          },
        }
      }
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        gte() { return chain },
        neq() { return chain },
        single() { return Promise.resolve({ data: null, error: null }) },
        insert() { return Promise.resolve({ error: null }) },
      }
      return chain
    },
    rpc(fn: string) {
      if (fn === 'record_refund_atomic_v2') {
        return Promise.resolve({
          data: {
            out_transaction_id: 'txn_refund_1',
            out_refunded_cents: 5000,
            out_from_creator_cents: 4000,
            out_from_platform_cents: 1000,
            out_is_full_refund: true,
            out_status: 'created',
          },
          error: null,
        })
      }
      if (fn === 'queue_webhook') {
        return Promise.resolve({ error: null })
      }
      if (fn === 'update_creator_risk_score') {
        return Promise.resolve({ error: null })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any
}

// ==========================================================================
// REFUND SERVICE — input validation and partial refund logic
// ==========================================================================

Deno.test('refund: rejects missing original_sale_reference', async () => {
  const result = await recordRefundResponse(req, {} as any, ledger, {
    original_sale_reference: '',
    reason: 'customer request',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_original_sale_reference')
})

Deno.test('refund: rejects missing reason', async () => {
  const result = await recordRefundResponse(req, {} as any, ledger, {
    original_sale_reference: 'sale_ref_1',
    reason: '',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_reason')
})

Deno.test('refund: rejects zero amount', async () => {
  const result = await recordRefundResponse(req, {} as any, ledger, {
    original_sale_reference: 'sale_ref_1',
    reason: 'customer request',
    amount: 0,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('refund: rejects negative amount', async () => {
  const result = await recordRefundResponse(req, {} as any, ledger, {
    original_sale_reference: 'sale_ref_1',
    reason: 'customer request',
    amount: -500,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('refund: rejects invalid refund_from value', async () => {
  const supabase = makeSaleFoundSupabase(50)
  const result = await recordRefundResponse(req, supabase, ledger, {
    original_sale_reference: 'sale_ref_1',
    reason: 'customer request',
    refund_from: 'invalid_option' as any,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_refund_from')
})

Deno.test('refund: rejects invalid mode value', async () => {
  const supabase = makeSaleFoundSupabase(50)
  const result = await recordRefundResponse(req, supabase, ledger, {
    original_sale_reference: 'sale_ref_1',
    reason: 'customer request',
    mode: 'invalid_mode' as any,
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_mode')
})

Deno.test('refund: returns 404 when original sale not found', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        return {
          select() { return this },
          eq() { return this },
          not() { return this },
          single() {
            return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'not found' } })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await recordRefundResponse(req, supabase, ledger, {
    original_sale_reference: 'nonexistent_sale',
    reason: 'customer request',
  }, requestId)

  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'original_sale_not_found')
})

Deno.test('refund: partial refund exceeding remaining amount returns 409', async () => {
  // Sale is $50.00 (5000 cents), already refunded $30.00 (3000 cents)
  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        let callCount = 0
        return {
          select() { return this },
          eq() { return this },
          not() { return this },
          in() { return this },
          single() {
            // First call: find original sale
            return Promise.resolve({
              data: {
                id: 'txn_original',
                amount: 50, // $50.00 in major units
                currency: 'USD',
                status: 'completed',
                reference_id: 'sale_ref_1',
                metadata: {},
                reversed_by: null,
              },
              error: null,
            })
          },
          then(resolve: any) {
            callCount++
            if (callCount === 1) {
              // Existing refunds: one $30 refund
              resolve({
                data: [{ id: 'txn_refund_existing', amount: 30 }],
                error: null,
              })
            } else {
              // No reversals of the existing refund
              resolve({ data: [], error: null })
            }
            return { catch() {} }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  // Try to refund $25.00 (2500 cents) but only $20.00 (2000 cents) remains
  const result = await recordRefundResponse(req, supabase, ledger, {
    original_sale_reference: 'sale_ref_1',
    reason: 'customer request',
    amount: 2500, // $25.00 in cents
  }, requestId)

  assertEquals(result.status, 409)
  assertEquals(result.body.error_code, 'refund_amount_exceeds_remaining')
})
