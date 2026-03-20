import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { createCheckoutResponse } from '../checkout-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// CHECKOUT SERVICE — input validation
// (split calculation tests are in checkout-payout-holds_test.ts — NOT duplicated)
// ==========================================================================

Deno.test('checkout: rejects zero amount', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: 0,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('checkout: rejects negative amount', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: -100,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('checkout: rejects amount of 49 cents (below minimum)', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: 49,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'amount_below_minimum')
})

Deno.test('checkout: accepts exactly 50 cents (boundary)', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() { return Promise.resolve({ data: null, error: { code: 'PGRST116' } }) },
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
            return Promise.resolve({ data: { metadata: {} }, error: null })
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
                  data: { id: 'sess_50', expires_at: '2026-01-01T01:00:00Z' },
                  error: null,
                })
              },
            }
          },
        }
      }
      if (table === 'audit_log') {
        const chain: any = { select() { return chain }, eq() { return chain }, gte() { return chain }, neq() { return chain }, single() { return Promise.resolve({ data: null, error: null }) }, insert() { return Promise.resolve({ error: null }) } }
        return chain
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 50,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  assertEquals(body.checkout_session.amount, 50)
})

Deno.test('checkout: adds Maryland digital goods tax from explicit address fields', async () => {
  let insertedSession: Record<string, unknown> | null = null
  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() { return Promise.resolve({ data: null, error: { code: 'PGRST116' } }) },
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
            return Promise.resolve({ data: { metadata: {} }, error: null })
          },
        }
      }
      if (table === 'checkout_sessions') {
        return {
          insert(payload: Record<string, unknown>) {
            insertedSession = payload
            return {
              select() { return this },
              single() {
                return Promise.resolve({
                  data: { id: 'sess_tax', expires_at: '2026-01-01T01:00:00Z' },
                  error: null,
                })
              },
            }
          },
        }
      }
      if (table === 'audit_log') {
        const chain: any = { select() { return chain }, eq() { return chain }, gte() { return chain }, neq() { return chain }, single() { return Promise.resolve({ data: null, error: null }) }, insert() { return Promise.resolve({ error: null }) } }
        return chain
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 1000,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
    collect_sales_tax: true,
    tax_category: 'digital_goods',
    customer_country: 'US',
    customer_state: 'MD',
  }, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.checkout_session.amount, 1060)
  assertEquals(body.checkout_session.breakdown.subtotal_amount, 10)
  assertEquals(body.checkout_session.breakdown.sales_tax_amount, 0.6)
  assertEquals(insertedSession?.sales_tax_amount, 60)
  assertEquals(insertedSession?.metadata?.customer_tax_source, 'request_address')
})

Deno.test('checkout: ignores metadata state when collecting sales tax', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() { return Promise.resolve({ data: null, error: { code: 'PGRST116' } }) },
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
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 1000,
    participant_id: 'creator1',
    success_url: 'https://example.com/success',
    collect_sales_tax: true,
    tax_category: 'digital_goods',
    metadata: {
      customer_state: 'MD',
    },
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'missing_customer_state')
})

Deno.test('checkout: rejects missing participant_id (empty string)', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: 5000,
    participant_id: '',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('checkout: rejects participant_id with special characters', async () => {
  const result = await createCheckoutResponse(req, {} as any, ledger, {
    amount: 5000,
    participant_id: "admin'; DROP TABLE--",
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('checkout: requires success_url when no payment_method_id', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() { return Promise.resolve({ data: null, error: { code: 'PGRST116' } }) },
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
            return Promise.resolve({ data: { metadata: {} }, error: null })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const result = await createCheckoutResponse(req, supabase, ledger, {
    amount: 5000,
    participant_id: 'creator1',
    // no success_url, no payment_method_id
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_success_url')
})

Deno.test('checkout: rejects invalid idempotency_key', async () => {
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
    currency: 'USD',
    idempotency_key: 'has spaces and bad chars!@#',
    success_url: 'https://example.com/success',
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_idempotency_key')
})

Deno.test('checkout: split calculation with default_platform_fee_percent', async () => {
  // When default_platform_fee_percent is set, creator gets (100 - fee)%
  const customLedger = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    business_name: 'Test Platform',
    settings: { default_platform_fee_percent: 15 },
  } as any

  const supabase = {
    from(table: string) {
      if (table === 'product_splits') {
        return {
          select() { return this },
          eq() { return this },
          single() { return Promise.resolve({ data: null, error: { code: 'PGRST116' } }) },
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
            return Promise.resolve({ data: { metadata: {} }, error: null })
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
                  data: { id: 'sess_fee', expires_at: '2026-01-01T01:00:00Z' },
                  error: null,
                })
              },
            }
          },
        }
      }
      if (table === 'audit_log') {
        const chain: any = { select() { return chain }, eq() { return chain }, gte() { return chain }, neq() { return chain }, single() { return Promise.resolve({ data: null, error: null }) }, insert() { return Promise.resolve({ error: null }) } }
        return chain
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
  // 100 - 15 = 85% creator
  // fee=350, net=9650, creator=floor(9650*0.85)=8202, platform=1448
  assertEquals(body.checkout_session.breakdown.creator_percent, 85)
  assertEquals(body.checkout_session.breakdown.creator_amount, 82.02) // 8202 / 100
  assertEquals(body.checkout_session.breakdown.platform_amount, 14.48) // 1448 / 100
  assertEquals(body.checkout_session.breakdown.soledgic_fee, 3.5) // 350 / 100
})
