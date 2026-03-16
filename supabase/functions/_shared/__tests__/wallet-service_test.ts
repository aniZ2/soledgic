import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  listWalletsResponse,
  createWalletResponse,
  getWalletByIdResponse,
  getWalletBalanceResponse,
  depositToWalletResponse,
  withdrawFromWalletResponse,
  topUpWalletByIdResponse,
  withdrawFromWalletByIdResponse,
  transferWalletFundsResponse,
} from '../wallet-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// Input validation — createWalletResponse
// ==========================================================================

Deno.test('create wallet: rejects invalid wallet_type', async () => {
  const supabase = {} as any
  const result = await createWalletResponse(req, supabase, ledger, {
    wallet_type: 'invalid_type',
    owner_id: 'owner_1',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_wallet_type')
})

Deno.test('create wallet: rejects missing owner_id', async () => {
  const supabase = {} as any
  const result = await createWalletResponse(req, supabase, ledger, {
    wallet_type: 'consumer_credit',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_owner_id')
})

Deno.test('create wallet: creator_earnings requires existing participant', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          in() { return this },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await createWalletResponse(req, supabase, ledger, {
    wallet_type: 'creator_earnings',
    owner_id: 'creator1',
  }, requestId)
  assertEquals(result.status, 409)
  assertEquals(result.body.error_code, 'creator_earnings_requires_participant')
})

// ==========================================================================
// getWalletByIdResponse — validation
// ==========================================================================

Deno.test('get wallet by id: rejects non-UUID', async () => {
  const supabase = {} as any
  const result = await getWalletByIdResponse(req, supabase, ledger, 'not-a-uuid', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_wallet_id')
})

Deno.test('get wallet by id: returns 404 when not found', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        in() { return this },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  const result = await getWalletByIdResponse(
    req, supabase, ledger,
    '550e8400-e29b-41d4-a716-446655440099',
    requestId,
  )
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'wallet_not_found')
})

// ==========================================================================
// listWalletsResponse — validation
// ==========================================================================

Deno.test('list wallets: rejects invalid owner_id', async () => {
  const supabase = {} as any
  const result = await listWalletsResponse(req, supabase, ledger, {
    owner_id: 'bad id!@#$',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_owner_id')
})

Deno.test('list wallets: rejects invalid wallet_type', async () => {
  const supabase = {} as any
  const result = await listWalletsResponse(req, supabase, ledger, {
    wallet_type: 'bad_type',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_wallet_type')
})

// ==========================================================================
// getWalletBalanceResponse — validation
// ==========================================================================

Deno.test('get wallet balance: rejects invalid participant_id', async () => {
  const supabase = {} as any
  const result = await getWalletBalanceResponse(req, supabase, ledger, {
    participant_id: '',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('get wallet balance: returns zero balance when wallet does not exist', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  const result = await getWalletBalanceResponse(req, supabase, ledger, {
    participant_id: 'owner_1',
  }, requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  const wallet = result.body.wallet as Record<string, unknown>
  assertEquals(wallet.balance, 0)
  assertEquals(wallet.wallet_exists, false)
})

// ==========================================================================
// depositToWalletResponse — validation
// ==========================================================================

Deno.test('deposit to wallet: rejects invalid participant_id', async () => {
  const supabase = {} as any
  const result = await depositToWalletResponse(req, supabase, ledger, {
    participant_id: '',
    amount: 1000,
    reference_id: 'ref_1',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

// ==========================================================================
// withdrawFromWalletResponse — validation
// ==========================================================================

Deno.test('withdraw from wallet: rejects invalid participant_id', async () => {
  const supabase = {} as any
  const result = await withdrawFromWalletResponse(req, supabase, ledger, {
    participant_id: '',
    amount: 500,
    reference_id: 'ref_2',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

// ==========================================================================
// topUpWalletByIdResponse — validation
// ==========================================================================

Deno.test('topup wallet by id: rejects non-UUID', async () => {
  const supabase = {} as any
  const result = await topUpWalletByIdResponse(req, supabase, ledger, 'not-a-uuid', {
    amount: 1000,
    reference_id: 'ref_3',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_wallet_id')
})

// ==========================================================================
// withdrawFromWalletByIdResponse — validation
// ==========================================================================

Deno.test('withdraw from wallet by id: rejects non-UUID', async () => {
  const supabase = {} as any
  const result = await withdrawFromWalletByIdResponse(req, supabase, ledger, 'not-a-uuid', {
    amount: 500,
    reference_id: 'ref_4',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_wallet_id')
})

// ==========================================================================
// transferWalletFundsResponse — validation
// ==========================================================================

Deno.test('transfer wallet funds: rejects invalid from_participant_id', async () => {
  const supabase = {} as any
  const result = await transferWalletFundsResponse(req, supabase, ledger, {
    from_participant_id: '',
    to_participant_id: 'p2',
    amount: 500,
    reference_id: 'ref_5',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_from_participant_id')
})

Deno.test('transfer wallet funds: rejects invalid to_participant_id', async () => {
  const supabase = {} as any
  const result = await transferWalletFundsResponse(req, supabase, ledger, {
    from_participant_id: 'p1',
    to_participant_id: '',
    amount: 500,
    reference_id: 'ref_6',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_to_participant_id')
})

Deno.test('transfer wallet funds: rejects invalid amount', async () => {
  const supabase = {} as any
  const result = await transferWalletFundsResponse(req, supabase, ledger, {
    from_participant_id: 'p1',
    to_participant_id: 'p2',
    amount: -100,
    reference_id: 'ref_7',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('transfer wallet funds: rejects missing reference_id', async () => {
  const supabase = {} as any
  const result = await transferWalletFundsResponse(req, supabase, ledger, {
    from_participant_id: 'p1',
    to_participant_id: 'p2',
    amount: 500,
    reference_id: '',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_reference_id')
})

Deno.test('transfer wallet funds: rejects when only one wallet UUID provided', async () => {
  const supabase = {} as any
  const result = await transferWalletFundsResponse(req, supabase, ledger, {
    from_wallet_id: '550e8400-e29b-41d4-a716-446655440001',
    to_wallet_id: 'not-a-uuid',
    amount: 500,
    reference_id: 'ref_8',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_wallet_id')
})

// ==========================================================================
// buildWalletResource — tested indirectly through getWalletBalanceResponse
// ==========================================================================

Deno.test('wallet balance: returns existing wallet with balance', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({
            data: {
              id: 'acct_w1',
              account_type: 'user_wallet',
              entity_id: 'customer_1',
              entity_type: 'customer',
              name: 'Customer Wallet',
              balance: 42.50,
              currency: 'USD',
              metadata: { wallet_type: 'consumer_credit' },
              is_active: true,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          })
        },
      }
    },
  } as any

  const result = await getWalletBalanceResponse(req, supabase, ledger, {
    participant_id: 'customer_1',
  }, requestId)
  assertEquals(result.status, 200)
  const wallet = result.body.wallet as Record<string, unknown>
  assertEquals(wallet.balance, 42.50)
  assertEquals(wallet.wallet_exists, true)
  assertEquals((wallet.account as any).name, 'Customer Wallet')
})
