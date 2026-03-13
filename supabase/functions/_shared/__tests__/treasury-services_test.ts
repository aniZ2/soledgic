import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { createCheckoutResponse } from '../checkout-service.ts'
import { releaseHeldFundsResponse } from '../holds-service.ts'
import { processPayoutResponse } from '../payout-service.ts'
import { listRefundsResponse, recordRefundResponse } from '../refund-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

Deno.test('createCheckoutResponse: returns structured invalid_participant_id error', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: 5000,
    participant_id: 'not valid',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('processPayoutResponse: returns structured invalid_reference_id error', async () => {
  const result = await processPayoutResponse(req, {} as any, ledger, {
    participant_id: 'participant_1',
    amount: 5000,
    reference_id: 'not valid',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_reference_id')
})

Deno.test('releaseHeldFundsResponse: returns structured invalid_hold_id error', async () => {
  const result = await releaseHeldFundsResponse(req, {} as any, ledger, {
    entry_id: 'hold_123',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_hold_id')
})

Deno.test('recordRefundResponse: returns structured invalid_original_sale_reference error', async () => {
  const result = await recordRefundResponse(req, {} as any, ledger, {
    original_sale_reference: 'bad ref',
    reason: 'Returned',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_original_sale_reference')
})

Deno.test('listRefundsResponse: maps refunds and supports sale filters', async () => {
  let queryState: Record<string, unknown> = {}

  const supabase = {
    from(table: string) {
      assertEquals(table, 'transactions')
      return {
        select() {
          return this
        },
        eq(column: string, value: unknown) {
          queryState[column] = value
          return this
        },
        order() {
          return this
        },
        limit(value: number) {
          queryState.limit = value
          return Promise.resolve({
            data: [
              {
                id: 'txn_refund_1',
                reference_id: 'refund_1',
                amount: 12.34,
                currency: 'USD',
                status: 'completed',
                description: 'Refund for order_1',
                metadata: {
                  original_sale_reference: 'order_1',
                  reason: 'Customer requested refund',
                  refund_from: 'both',
                  breakdown: {
                    from_creator: 10,
                    from_platform: 2.34,
                  },
                },
                created_at: '2026-03-13T12:00:00Z',
              },
            ],
            error: null,
          })
        },
      }
    },
  } as any

  const result = await listRefundsResponse(req, supabase, ledger, {
    sale_reference: 'order_1',
    limit: 5,
  }, requestId)
  const body = result.body as {
    count: number
    refunds: Array<{
      sale_reference: string
      breakdown: { from_platform: number }
    }>
  }

  assertEquals(result.status, 200)
  assertEquals(queryState['metadata->>original_sale_reference'], 'order_1')
  assertEquals(queryState.limit, 5)
  assertEquals(body.count, 1)
  assertEquals(body.refunds[0].sale_reference, 'order_1')
  assertEquals(body.refunds[0].breakdown.from_platform, 2.34)
})
