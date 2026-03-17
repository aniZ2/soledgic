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

Deno.test('processPayoutResponse: retries transient RPC failures before succeeding', async () => {
  let payoutRpcCalls = 0

  const supabase = {
    rpc(fn: string) {
      if (fn === 'process_payout_atomic') {
        payoutRpcCalls++

        if (payoutRpcCalls === 1) {
          return Promise.resolve({
            data: null,
            error: {
              code: '40P01',
              message: 'deadlock detected',
              details: 'Process blocked while waiting on another transaction',
            },
          })
        }

        return Promise.resolve({
          data: {
            status: 'created',
            transaction_id: 'txn_payout_1',
            gross_payout: 50,
            fees: 0,
            net_to_creator: 50,
            previous_balance: 240,
            new_balance: 190,
          },
          error: null,
        })
      }

      if (fn === 'queue_webhook') {
        return Promise.resolve({ data: null, error: null })
      }

      throw new Error(`Unexpected RPC in payout retry test: ${fn}`)
    },
    from() {
      return {
        insert() {
          return Promise.resolve({ error: null })
        },
      }
    },
  } as any

  const result = await processPayoutResponse(req, supabase, ledger, {
    participant_id: 'participant_1',
    amount: 5000,
    reference_id: 'payout_1',
  }, requestId)
  const body = result.body as {
    success: boolean
    payout: { id: string; gross_amount: number; new_balance: number }
  }

  assertEquals(payoutRpcCalls, 2)
  assertEquals(result.status, 200)
  assertEquals(body.success, true)
  assertEquals(body.payout.id, 'txn_payout_1')
  assertEquals(body.payout.gross_amount, 50)
  assertEquals(body.payout.new_balance, 190)
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

Deno.test('recordRefundResponse: allows refunding remaining balance after a reversed refund', async () => {
  let transactionCall = 0
  let reversalLookupCall = 0
  let refundRpcArgs: Record<string, unknown> | null = null

  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        transactionCall++

        if (transactionCall === 1) {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            single() {
              return Promise.resolve({
                data: {
                  id: 'sale_txn_1',
                  amount: 100,
                  currency: 'USD',
                  status: 'reversed',
                  reference_id: 'sale_1',
                  metadata: {},
                  reversed_by: 'refund_txn_1',
                },
                error: null,
              })
            },
          }
        }

        if (transactionCall === 2) {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            maybeSingle() {
              reversalLookupCall++
              return Promise.resolve({
                data: {
                  transaction_type: 'refund',
                },
                error: null,
              })
            },
          }
        }

        if (transactionCall === 3) {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            not() {
              return Promise.resolve({
                data: [
                  {
                    id: 'refund_txn_1',
                    amount: 100,
                  },
                ],
                error: null,
              })
            },
          }
        }

        if (transactionCall === 4) {
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
            not() {
              return Promise.resolve({
                data: [
                  {
                    reverses: 'refund_txn_1',
                    amount: 100,
                  },
                ],
                error: null,
              })
            },
          }
        }
      }

      if (table === 'audit_log' || table === 'transaction_links') {
        return {
          insert() { return Promise.resolve({ error: null }) },
          upsert() { return Promise.resolve({ error: null }) },
        }
      }

      throw new Error(`Unexpected table access in refund-reversal test: ${table}#${transactionCall}`)
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name === 'record_refund_atomic_v2') {
        refundRpcArgs = args
        return Promise.resolve({
          data: {
            out_transaction_id: 'refund_txn_2',
            out_refunded_cents: 2000,
            out_from_creator_cents: 1600,
            out_from_platform_cents: 400,
            out_is_full_refund: false,
            out_status: 'created',
          },
          error: null,
        })
      }

      if (name === 'queue_webhook') {
        return Promise.resolve({ data: null, error: null })
      }

      throw new Error(`Unexpected RPC call in refund-reversal test: ${name}`)
    },
  } as any

  const result = await recordRefundResponse(req, supabase, ledger, {
    original_sale_reference: 'sale_1',
    amount: 2000,
    reason: 'Retry refund after reversal',
    mode: 'ledger_only',
  }, requestId)
  const body = result.body as {
    success: boolean
    refund: {
      transaction_id: string
      refunded_amount: number
    }
  }

  assertEquals(result.status, 200)
  assertEquals(body.success, true)
  assertEquals(body.refund.transaction_id, 'refund_txn_2')
  assertEquals(body.refund.refunded_amount, 20)
  assertEquals(reversalLookupCall, 1)
  assertEquals(refundRpcArgs?.['p_original_tx_id'], 'sale_txn_1')
  assertEquals(refundRpcArgs?.['p_refund_amount'], 2000)
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

      if (table === 'transaction_links') {
        return { upsert() { return Promise.resolve({ error: null }) } }
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

      if (table === 'transaction_links') {
        return { upsert() { return Promise.resolve({ error: null }) } }
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

Deno.test('recordRefundResponse: requires processor_payment_id for processor refunds', async () => {
  let transactionCall = 0
  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        transactionCall++
        if (transactionCall === 1) {
          return {
            select() { return this },
            eq() { return this },
            single() {
              return Promise.resolve({
                data: {
                  id: 'sale_txn_1', amount: 100, currency: 'USD',
                  status: 'completed', reference_id: 'sale_1',
                  metadata: {}, reversed_by: null,
                },
                error: null,
              })
            },
          }
        }
        if (transactionCall === 2) {
          return {
            select() { return this },
            eq() { return this },
            not() { return Promise.resolve({ data: [], error: null }) },
          }
        }
      }
      if (table === 'transaction_links') {
        return { upsert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table access: ${table}`)
    },
    rpc() { throw new Error('Should not reach RPC') },
  } as any

  const result = await recordRefundResponse(req, supabase, ledger, {
    original_sale_reference: 'sale_1',
    amount: 3000,
    reason: 'Customer request',
    mode: 'processor_refund',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'missing_processor_payment_id')
})

Deno.test('recordRefundResponse: voids reserved ledger entry when processor refund fails', async () => {
  const originalFetch = globalThis.fetch
  let voidedTxId: string | null = null

  Deno.env.set('PROCESSOR_BASE_URL', 'https://processor.example.com')
  Deno.env.set('PROCESSOR_USERNAME', 'processor_user')
  Deno.env.set('PROCESSOR_PASSWORD', 'processor_pass')
  Deno.env.set('PROCESSOR_MERCHANT_ID', 'merchant_123')
  Deno.env.set('PROCESSOR_ENV', 'sandbox')

  globalThis.fetch = ((() =>
    Promise.resolve({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'insufficient_funds' }),
      text: () => Promise.resolve('{"error":"insufficient_funds"}'),
    })) as unknown) as typeof fetch

  try {
    let transactionCall = 0
    const supabase = {
      from(table: string) {
        if (table === 'transactions') {
          transactionCall++
          if (transactionCall === 1) {
            return {
              select() { return this },
              eq() { return this },
              single() {
                return Promise.resolve({
                  data: {
                    id: 'sale_txn_1', amount: 100, currency: 'USD',
                    status: 'completed', reference_id: 'sale_1',
                    metadata: {}, reversed_by: null,
                  },
                  error: null,
                })
              },
            }
          }
          if (transactionCall === 2) {
            return {
              select() { return this },
              eq() { return this },
              not() { return Promise.resolve({ data: [], error: null }) },
            }
          }
        }
        if (table === 'audit_log') {
          return { insert() { return Promise.resolve({ error: null }) } }
        }
        throw new Error(`Unexpected table: ${table}#${transactionCall}`)
      },
      rpc(name: string, args: Record<string, unknown>) {
        if (name === 'record_refund_atomic_v2') {
          return Promise.resolve({
            data: {
              out_transaction_id: 'refund_reserved_1',
              out_refunded_cents: 3000,
              out_from_creator_cents: 2400,
              out_from_platform_cents: 600,
              out_is_full_refund: false,
              out_status: 'created',
            },
            error: null,
          })
        }
        if (name === 'void_transaction_atomic') {
          voidedTxId = args.p_transaction_id as string
          return Promise.resolve({ data: args.p_transaction_id, error: null })
        }
        throw new Error(`Unexpected RPC: ${name}`)
      },
    } as any

    // Import getPaymentProvider to pass an actual provider instance
    const { getPaymentProvider } = await import('../payment-provider.ts')
    const provider = getPaymentProvider('card')

    const result = await recordRefundResponse(req, supabase, ledger, {
      original_sale_reference: 'sale_1',
      amount: 3000,
      reason: 'Customer request',
      mode: 'processor_refund',
      processor_payment_id: 'pi_123',
    }, requestId, provider)

    assertEquals(result.status, 502)
    assertEquals(result.body.error_code, 'processor_refund_failed')
    assertEquals(voidedTxId, 'refund_reserved_1')
  } finally {
    globalThis.fetch = originalFetch
    Deno.env.delete('PROCESSOR_BASE_URL')
    Deno.env.delete('PROCESSOR_USERNAME')
    Deno.env.delete('PROCESSOR_PASSWORD')
    Deno.env.delete('PROCESSOR_MERCHANT_ID')
    Deno.env.delete('PROCESSOR_ENV')
  }
})
