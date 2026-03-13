import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { createCheckoutResponse } from '../checkout-service.ts'
import { releaseHeldFundsResponse } from '../holds-service.ts'
import { processPayoutResponse } from '../payout-service.ts'
import { createParticipantResponse } from '../participants-service.ts'
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

Deno.test('createParticipantResponse: returns structured invalid_user_id error', async () => {
  const result = await createParticipantResponse(req, {} as any, ledger, {
    participant_id: 'participant_1',
    user_id: 'not-a-uuid',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_user_id')
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
  let transactionCalls = 0

  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        transactionCalls++

        if (transactionCalls === 1) {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              return Promise.resolve({
                data: { id: 'sale_txn_1' },
                error: null,
              })
            },
          }
        }

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
      }

      if (table === 'pending_processor_refunds') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          in() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({ data: [], error: null })
          },
        }
      }

      throw new Error(`Unexpected table access in test: ${table}`)
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

Deno.test('listRefundsResponse: includes pending processor refunds in the public refund feed', async () => {
  const tableCalls: Record<string, number> = {}

  const supabase = {
    from(table: string) {
      tableCalls[table] = (tableCalls[table] || 0) + 1

      if (table === 'transactions' && tableCalls[table] === 1) {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          order() {
            return this
          },
          limit() {
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
                  },
                  created_at: '2026-03-13T12:00:00Z',
                },
              ],
              error: null,
            })
          },
        }
      }

      if (table === 'pending_processor_refunds') {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          in() {
            return this
          },
          order() {
            return this
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'pending_1',
                  reference_id: 'refund_pending_1',
                  original_transaction_id: 'sale_txn_1',
                  refund_amount: 4500,
                  reason: 'Processor succeeded, ledger pending',
                  refund_from: 'creator_only',
                  external_refund_id: 'rf_123',
                  status: 'pending',
                  error_message: 'temporary ledger error',
                  created_at: '2026-03-13T12:30:00Z',
                },
              ],
              error: null,
            })
          },
        }
      }

      if (table === 'transactions' && tableCalls[table] === 2) {
        return {
          select() {
            return this
          },
          in() {
            return Promise.resolve({
              data: [
                {
                  id: 'sale_txn_1',
                  reference_id: 'order_pending_1',
                  currency: 'USD',
                },
              ],
              error: null,
            })
          },
        }
      }

      throw new Error(`Unexpected table access in test: ${table}#${tableCalls[table]}`)
    },
  } as any

  const result = await listRefundsResponse(req, supabase, ledger, {
    limit: 10,
  }, requestId)
  const body = result.body as {
    count: number
    refunds: Array<{
      reference_id: string | null
      sale_reference: string | null
      status: string
      repair_pending?: boolean
      last_error?: string | null
    }>
  }

  assertEquals(result.status, 200)
  assertEquals(body.count, 2)
  assertEquals(body.refunds[0].reference_id, 'refund_pending_1')
  assertEquals(body.refunds[0].sale_reference, 'order_pending_1')
  assertEquals(body.refunds[0].status, 'pending_repair')
  assertEquals(body.refunds[0].repair_pending, true)
  assertEquals(body.refunds[0].last_error, 'temporary ledger error')
})

Deno.test('recordRefundResponse: returns a pending repair refund when processor refund succeeds but ledger write fails', async () => {
  const originalFetch = globalThis.fetch
  let pendingUpsertPayload: { reference_id?: string; status?: string } | null = null

  Deno.env.set('PROCESSOR_BASE_URL', 'https://processor.example.com')
  Deno.env.set('PROCESSOR_USERNAME', 'processor_user')
  Deno.env.set('PROCESSOR_PASSWORD', 'processor_pass')
  Deno.env.set('PROCESSOR_MERCHANT_ID', 'merchant_123')
  Deno.env.set('PROCESSOR_ENV', 'sandbox')

  globalThis.fetch = ((() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'rf_live_123', state: 'SUCCEEDED', amount: 3000 }),
    })) as unknown) as typeof fetch

  try {
    const supabase = {
      from(table: string) {
        if (table === 'transactions') {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            in() {
              return Promise.resolve({ data: [], error: null })
            },
            single() {
              return Promise.resolve({
                data: {
                  id: 'sale_txn_1',
                  amount: 100,
                  currency: 'USD',
                  status: 'completed',
                  reference_id: 'sale_1',
                  metadata: {},
                },
                error: null,
              })
            },
          }
        }

        if (table === 'pending_processor_refunds') {
          return {
            upsert(payload: { reference_id?: string; status?: string }) {
              pendingUpsertPayload = payload
              return Promise.resolve({ error: null })
            },
          }
        }

        if (table === 'audit_log') {
          return {
            insert() {
              return Promise.resolve({ error: null })
            },
          }
        }

        throw new Error(`Unexpected table access: ${table}`)
      },
      rpc(name: string) {
        if (name === 'record_refund_atomic_v2') {
          return Promise.resolve({
            data: null,
            error: { message: 'ledger write failed after processor success' },
          })
        }

        throw new Error(`Unexpected RPC call: ${name}`)
      },
    } as any

    const result = await recordRefundResponse(req, supabase, ledger, {
      original_sale_reference: 'sale_1',
      amount: 3000,
      reason: 'Customer request',
      mode: 'processor_refund',
      processor_payment_id: 'pi_123',
    }, requestId)

    const body = result.body as {
      success: boolean
      warning_code: string
      refund: {
        transaction_id: string | null
        reference_id: string | null
        sale_reference: string | null
        status: string
        repair_pending: boolean
        external_refund_id: string | null
      }
    }

    assertEquals(result.status, 202)
    assertEquals(body.success, true)
    assertEquals(body.warning_code, 'processor_refund_pending_repair')
    assertEquals(body.refund.transaction_id, null)
    assertEquals(body.refund.sale_reference, 'sale_1')
    assertEquals(body.refund.status, 'pending_repair')
    assertEquals(body.refund.repair_pending, true)
    assertEquals(body.refund.external_refund_id, 'rf_live_123')
    const upsertPayload = pendingUpsertPayload as { reference_id?: string; status?: string } | null
    assertEquals(upsertPayload?.reference_id, 'rf_live_123')
    assertEquals(upsertPayload?.status, 'pending')
  } finally {
    globalThis.fetch = originalFetch
    Deno.env.delete('PROCESSOR_BASE_URL')
    Deno.env.delete('PROCESSOR_USERNAME')
    Deno.env.delete('PROCESSOR_PASSWORD')
    Deno.env.delete('PROCESSOR_MERCHANT_ID')
    Deno.env.delete('PROCESSOR_ENV')
  }
})
