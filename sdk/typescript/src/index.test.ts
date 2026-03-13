import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Soledgic, SoledgicError } from './index'

const BASE_URL = 'https://test.supabase.co/functions/v1'
const API_KEY = 'test_api_key_for_unit_tests'

function mockFetch(body: any, status = 200, contentType = 'application/json') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Map([['Content-Type', contentType]]),
  })
}

function createClient(fetchFn: any, config: Partial<{ apiVersion: string }> = {}): Soledgic {
  vi.stubGlobal('fetch', fetchFn)
  return new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL, ...config })
}

async function buildWebhookSignature(payload: string, secret: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const hex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `t=${timestamp},v1=${hex}`
}

describe('Soledgic SDK', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // === CONSTRUCTOR VALIDATION ===

  it('throws if apiKey is missing', () => {
    expect(() => new Soledgic({ apiKey: '', baseUrl: BASE_URL })).toThrow('apiKey is required')
  })

  it('throws if baseUrl is missing', () => {
    expect(() => new Soledgic({ apiKey: API_KEY, baseUrl: '' })).toThrow('baseUrl is required')
    expect(() => new Soledgic({ apiKey: API_KEY } as any)).toThrow('baseUrl is required')
  })

  it('strips trailing slash from baseUrl', async () => {
    const fn = mockFetch({ success: true, periods: [] })
    vi.stubGlobal('fetch', fn)
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL + '/' })
    await sdk.listPeriods()
    const [url] = fn.mock.calls[0]
    // Should not have double slash between baseUrl and endpoint
    expect(url).toBe(`${BASE_URL}/close-period`)
  })

  // === AUTH & REQUEST PLUMBING ===

  it('sends API key in x-api-key header', async () => {
    const fn = mockFetch({ success: true, periods: [] })
    const sdk = createClient(fn)
    await sdk.listPeriods()

    expect(fn).toHaveBeenCalledOnce()
    const [url, opts] = fn.mock.calls[0]
    expect(opts.headers['x-api-key']).toBe(API_KEY)
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('sends the default Soledgic-Version header', async () => {
    const fn = mockFetch({ success: true, periods: [] })
    const sdk = createClient(fn)
    await sdk.listPeriods()

    const [, opts] = fn.mock.calls[0]
    expect(opts.headers['Soledgic-Version']).toBe('2026-03-01')
  })

  it('uses a configured Soledgic-Version header when provided', async () => {
    const fn = mockFetch({ success: true, periods: [] })
    const sdk = createClient(fn, { apiVersion: '2026-06-01' })
    await sdk.listPeriods()

    const [, opts] = fn.mock.calls[0]
    expect(opts.headers['Soledgic-Version']).toBe('2026-06-01')
  })

  it('throws SoledgicError on non-OK response', async () => {
    const fn = mockFetch({ error: 'Unauthorized' }, 401)
    const sdk = createClient(fn)
    try {
      await sdk.listPeriods()
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SoledgicError)
      expect((err as SoledgicError).message).toBe('Unauthorized')
      expect((err as SoledgicError).status).toBe(401)
      expect((err as SoledgicError).details).toEqual({ error: 'Unauthorized' })
    }
  })

  it('includes status and details on error', async () => {
    const fn = mockFetch({ error: 'Not found', code: 'RESOURCE_NOT_FOUND' }, 404)
    const sdk = createClient(fn)
    try {
      await sdk.getAPAging('2026-01-01')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SoledgicError)
      expect((err as SoledgicError).status).toBe(404)
    }
  })

  it('exposes API error_code on thrown errors', async () => {
    const fn = mockFetch({ error: 'Invalid participant_id', error_code: 'invalid_participant_id' }, 400)
    const sdk = createClient(fn)

    try {
      await sdk.createParticipant({ participantId: 'bad id' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SoledgicError)
      expect((err as SoledgicError).code).toBe('invalid_participant_id')
    }
  })

  // === RECORD SALE ===

  it('recordSale sends snake_case body', async () => {
    const fn = mockFetch({
      success: true,
      transactionId: 'txn_1',
      breakdown: {
        grossAmount: 100, processingFee: 3, netAmount: 97,
        creatorAmount: 80, platformAmount: 17,
        creatorPercent: 80, platformPercent: 20,
        withheldAmount: 0, availableAmount: 80, withholdings: [],
      },
    })
    const sdk = createClient(fn)
    await sdk.recordSale({
      referenceId: 'order_1',
      creatorId: 'c_1',
      amount: 10000,
      processingFeePaidBy: 'platform',
      metadata: { source: 'test' },
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.reference_id).toBe('order_1')
    expect(body.creator_id).toBe('c_1')
    expect(body.amount).toBe(10000)
    expect(body.processing_fee_paid_by).toBe('platform')
    expect(body.metadata).toEqual({ source: 'test' })
  })

  // === RECORD INCOME / EXPENSE / BILL ===

  it('recordIncome maps to snake_case', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_1' })
    const sdk = createClient(fn)
    await sdk.recordIncome({
      referenceId: 'inv_1',
      amount: 5000,
      category: 'consulting',
      customerName: 'Acme Corp',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.reference_id).toBe('inv_1')
    expect(body.customer_name).toBe('Acme Corp')
    expect(fn.mock.calls[0][0]).toContain('/record-income')
  })

  it('recordExpense maps to snake_case', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_1' })
    const sdk = createClient(fn)
    await sdk.recordExpense({
      referenceId: 'exp_1',
      amount: 3000,
      vendorName: 'AWS',
      taxDeductible: true,
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.reference_id).toBe('exp_1')
    expect(body.vendor_name).toBe('AWS')
    expect(body.tax_deductible).toBe(true)
    expect(fn.mock.calls[0][0]).toContain('/record-expense')
  })

  it('recordBill maps to snake_case', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_1', bill_id: 'bill_1' })
    const sdk = createClient(fn)
    await sdk.recordBill({
      amount: 10000,
      description: 'Hosting',
      vendorName: 'AWS',
      dueDate: '2026-02-01',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.vendor_name).toBe('AWS')
    expect(body.due_date).toBe('2026-02-01')
    expect(fn.mock.calls[0][0]).toContain('/record-bill')
  })

  // === CHECKOUT ===

  it('createCheckoutSession rejects when neither paymentMethodId nor successUrl provided', async () => {
    const fn = mockFetch({})
    const sdk = createClient(fn)
    await expect(
      sdk.createCheckoutSession({ amount: 1000, participantId: 'c_1' } as any)
    ).rejects.toThrow('Either paymentMethodId/sourceId or successUrl is required')
    expect(fn).not.toHaveBeenCalled()
  })

  it('createCheckoutSession maps session response', async () => {
    const fn = mockFetch({
      success: true,
      checkout_session: {
        id: 'sess_1',
        mode: 'session',
        checkout_url: 'https://pay.example.com',
        expires_at: '2026-01-01T00:00:00Z',
        breakdown: { gross_amount: 100, creator_amount: 80, platform_amount: 20, creator_percent: 80 },
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.createCheckoutSession({
      amount: 10000,
      participantId: 'c_1',
      successUrl: 'https://example.com/success',
    })

    expect(result.checkoutSession).toMatchObject({
      id: 'sess_1',
      mode: 'session',
      checkoutUrl: 'https://pay.example.com',
    })
  })

  // === REFUNDS ===

  it('createRefund maps snake_case response to camelCase', async () => {
    const fn = mockFetch({
      success: true,
      refund: {
        id: 'refund_1',
        transaction_id: 'txn_r1',
        reference_id: 'refund_1',
        sale_reference: 'order_1',
        refunded_amount: 5000,
        currency: 'USD',
        status: 'completed',
        breakdown: { from_creator: 4000, from_platform: 1000 },
        is_full_refund: true,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.createRefund({
      saleReference: 'order_1',
      reason: 'Returned',
    })

    expect(result.refund.transactionId).toBe('txn_r1')
    expect(result.refund.refundedAmount).toBe(5000)
    expect(result.refund.breakdown?.fromCreator).toBe(4000)
    expect(result.refund.breakdown?.fromPlatform).toBe(1000)
    expect(result.refund.isFullRefund).toBe(true)
  })

  it('createRefund surfaces pending repair refunds without dropping the refund object', async () => {
    const fn = mockFetch({
      success: true,
      warning: 'Processor refund succeeded but ledger booking failed. This will be automatically repaired.',
      warning_code: 'processor_refund_pending_repair',
      refund: {
        id: 'refund_pending_1',
        transaction_id: null,
        reference_id: 'refund_pending_1',
        sale_reference: 'order_1',
        refunded_amount: 30,
        currency: 'USD',
        status: 'pending_repair',
        reason: 'Returned',
        refund_from: 'both',
        external_refund_id: 'rf_ext_1',
        created_at: '2026-03-13T12:00:00Z',
        breakdown: null,
        is_full_refund: null,
        repair_pending: true,
      },
    }, 202)
    const sdk = createClient(fn)
    const result = await sdk.createRefund({
      saleReference: 'order_1',
      amount: 3000,
      reason: 'Returned',
      mode: 'processor_refund',
    })

    expect(result.success).toBe(true)
    expect(result.refund.transactionId).toBeNull()
    expect(result.refund.referenceId).toBe('refund_pending_1')
    expect(result.refund.saleReference).toBe('order_1')
    expect(result.refund.status).toBe('pending_repair')
    expect(result.refund.repairPending).toBe(true)
    expect(result.warningCode).toBe('processor_refund_pending_repair')
  })

  it('listRefunds uses GET with sale_reference query params and maps response', async () => {
    const fn = mockFetch({
      success: true,
      count: 1,
      refunds: [
        {
          id: 'txn_r1',
          transaction_id: 'txn_r1',
          reference_id: 'refund_1',
          sale_reference: 'order_1',
          refunded_amount: 5000,
          currency: 'USD',
          status: 'completed',
          reason: 'Returned',
          refund_from: 'both',
          external_refund_id: 'rf_ext_1',
          created_at: '2026-03-13T12:00:00Z',
          breakdown: { from_creator: 4000, from_platform: 1000 },
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.listRefunds({ saleReference: 'order_1', limit: 5 })

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/refunds')
    expect(String(url)).toContain('sale_reference=order_1')
    expect(String(url)).toContain('limit=5')
    expect(result.count).toBe(1)
    expect(result.refunds[0].saleReference).toBe('order_1')
    expect(result.refunds[0].breakdown?.fromPlatform).toBe(1000)
  })

  it('listRefunds preserves pending repair metadata', async () => {
    const fn = mockFetch({
      success: true,
      count: 1,
      refunds: [
        {
          id: 'refund_pending_1',
          transaction_id: null,
          reference_id: 'refund_pending_1',
          sale_reference: 'order_1',
          refunded_amount: 30,
          currency: 'USD',
          status: 'pending_repair',
          reason: 'Returned',
          refund_from: 'both',
          external_refund_id: 'rf_ext_1',
          created_at: '2026-03-13T12:00:00Z',
          breakdown: null,
          repair_pending: true,
          last_error: 'temporary ledger error',
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.listRefunds({ saleReference: 'order_1' })

    expect(result.refunds[0].transactionId).toBeNull()
    expect(result.refunds[0].status).toBe('pending_repair')
    expect(result.refunds[0].repairPending).toBe(true)
    expect(result.refunds[0].lastError).toBe('temporary ledger error')
  })

  // === PAYOUT ===

  it('createPayout maps to snake_case', async () => {
    const fn = mockFetch({
      success: true,
      payout: {
        id: 'payout_1',
        transaction_id: 'txn_p1',
        gross_amount: 5000,
        fees: 0,
        net_amount: 5000,
        new_balance: 1000,
      },
    })
    const sdk = createClient(fn)
    await sdk.createPayout({
      participantId: 'c_1',
      referenceId: 'payout_1',
      amount: 5000,
      feesPaidBy: 'platform',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.participant_id).toBe('c_1')
    expect(body.reference_id).toBe('payout_1')
    expect(body.fees_paid_by).toBe('platform')
    expect(fn.mock.calls[0][0]).toContain('/payouts')
  })

  it('checkPayoutEligibility uses GET query parameters', async () => {
    const fn = mockFetch({ success: true, eligible: true, creator_id: 'c_1', available_balance: 50 })
    const sdk = createClient(fn)
    await sdk.checkPayoutEligibility('c_1')

    const [url, opts] = fn.mock.calls[0]
    expect(String(url)).toContain('/participants/c_1/payout-eligibility')
    expect(opts.method).toBe('GET')
  })

  // === WALLET OBJECTS ===

  it('listWallets uses GET query params and maps wallet objects', async () => {
    const fn = mockFetch({
      success: true,
      wallets: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          object: 'wallet',
          wallet_type: 'consumer_credit',
          scope_type: 'customer',
          owner_id: 'reader_1',
          owner_type: 'customer',
          participant_id: null,
          account_type: 'user_wallet',
          name: 'Reader Credits',
          currency: 'USD',
          status: 'active',
          balance: 2500,
          held_amount: 0,
          available_balance: 2500,
          redeemable: false,
          transferable: false,
          topup_supported: true,
          payout_supported: false,
          created_at: '2026-03-13T12:00:00Z',
          metadata: { wallet_type: 'consumer_credit' },
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    })
    const sdk = createClient(fn)
    const result = await sdk.listWallets({ ownerId: 'reader_1', walletType: 'consumer_credit', limit: 10 })

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/wallets')
    expect(String(url)).toContain('owner_id=reader_1')
    expect(String(url)).toContain('wallet_type=consumer_credit')
    expect(result.wallets[0].walletType).toBe('consumer_credit')
    expect(result.wallets[0].ownerId).toBe('reader_1')
  })

  it('createWallet maps camelCase request to wallet resource response', async () => {
    const fn = mockFetch({
      success: true,
      created: true,
      wallet: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        object: 'wallet',
        wallet_type: 'consumer_credit',
        scope_type: 'customer',
        owner_id: 'reader_1',
        owner_type: 'customer',
        participant_id: null,
        account_type: 'user_wallet',
        name: 'Reader Credits',
        currency: 'USD',
        status: 'active',
        balance: 0,
        held_amount: 0,
        available_balance: 0,
        redeemable: false,
        transferable: false,
        topup_supported: true,
        payout_supported: false,
        created_at: '2026-03-13T12:00:00Z',
        metadata: { wallet_type: 'consumer_credit' },
      },
    }, 201)
    const sdk = createClient(fn)
    const result = await sdk.createWallet({
      ownerId: 'reader_1',
      walletType: 'consumer_credit',
      name: 'Reader Credits',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.owner_id).toBe('reader_1')
    expect(body.wallet_type).toBe('consumer_credit')
    expect(result.created).toBe(true)
    expect(result.wallet.walletType).toBe('consumer_credit')
  })

  it('getWalletEntries uses wallet ids and maps entry responses', async () => {
    const fn = mockFetch({
      success: true,
      wallet: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        object: 'wallet',
        wallet_type: 'consumer_credit',
        scope_type: 'customer',
        owner_id: 'reader_1',
        owner_type: 'customer',
        participant_id: null,
        account_type: 'user_wallet',
        name: 'Reader Credits',
        currency: 'USD',
        status: 'active',
        balance: 2500,
        held_amount: 0,
        available_balance: 2500,
        redeemable: false,
        transferable: false,
        topup_supported: true,
        payout_supported: false,
        created_at: '2026-03-13T12:00:00Z',
        metadata: {},
      },
      entries: [
        {
          entry_id: 'entry_1',
          entry_type: 'credit',
          amount: 2500,
          transaction_id: 'txn_1',
          reference_id: 'topup_1',
          transaction_type: 'deposit',
          description: 'Initial topup',
          status: 'completed',
          metadata: {},
          created_at: '2026-03-13T12:00:00Z',
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    })
    const sdk = createClient(fn)
    const result = await sdk.getWalletEntries('550e8400-e29b-41d4-a716-446655440000')

    expect(String(fn.mock.calls[0][0])).toContain('/wallets/550e8400-e29b-41d4-a716-446655440000/entries')
    expect(result.wallet?.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.entries[0].referenceId).toBe('topup_1')
  })

  it('topUpWallet uses the wallet topups endpoint', async () => {
    const fn = mockFetch({
      success: true,
      topup: {
        wallet_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: 'reader_1',
        transaction_id: 'txn_topup_1',
        balance: 5000,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.topUpWallet({
      walletId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 5000,
      referenceId: 'topup_1',
    })

    expect(String(fn.mock.calls[0][0])).toContain('/wallets/550e8400-e29b-41d4-a716-446655440000/topups')
    expect(result.walletId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.transactionId).toBe('txn_topup_1')
  })

  it('createPayout forwards wallet_id when provided', async () => {
    const fn = mockFetch({
      success: true,
      payout: {
        id: 'payout_1',
        transaction_id: 'txn_p1',
        gross_amount: 5000,
        fees: 0,
        net_amount: 5000,
        new_balance: 1000,
      },
    })
    const sdk = createClient(fn)
    await sdk.createPayout({
      participantId: 'c_1',
      walletId: '550e8400-e29b-41d4-a716-446655440000',
      referenceId: 'payout_1',
      amount: 5000,
      feesPaidBy: 'platform',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.wallet_id).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('withdrawFromWallet uses wallet withdrawals endpoint', async () => {
    const fn = mockFetch({
      success: true,
      withdrawal: {
        wallet_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_id: 'reader_1',
        transaction_id: 'txn_w1',
        balance: 1800,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.withdrawFromWallet({
      walletId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 2000,
      referenceId: 'withdrawal_1',
    })

    expect(String(fn.mock.calls[0][0])).toContain('/wallets/550e8400-e29b-41d4-a716-446655440000/withdrawals')
    expect(result.walletId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.transactionId).toBe('txn_w1')
  })

  // === TRANSFER ===

  it('recordTransfer maps to snake_case', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_t1', transfer_id: 'xfr_1' })
    const sdk = createClient(fn)
    await sdk.recordTransfer({
      fromAccountType: 'cash',
      toAccountType: 'tax_reserve',
      amount: 2000,
      transferType: 'tax_reserve',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.from_account_type).toBe('cash')
    expect(body.to_account_type).toBe('tax_reserve')
    expect(body.transfer_type).toBe('tax_reserve')
    expect(fn.mock.calls[0][0]).toContain('/record-transfer')
  })

  // === OPENING BALANCE ===

  it('recordOpeningBalance maps balances to snake_case', async () => {
    const fn = mockFetch({ success: true, opening_balance_id: 'ob_1', transaction_id: 'txn_ob1' })
    const sdk = createClient(fn)
    await sdk.recordOpeningBalance({
      asOfDate: '2026-01-01',
      source: 'manual',
      balances: [
        { accountType: 'cash', balance: 50000 },
        { accountType: 'revenue', balance: 30000 },
      ],
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.as_of_date).toBe('2026-01-01')
    expect(body.balances[0].account_type).toBe('cash')
    expect(fn.mock.calls[0][0]).toContain('/record-opening-balance')
  })

  // === PERIOD MANAGEMENT ===

  it('closePeriod sends year and month', async () => {
    const fn = mockFetch({ success: true })
    const sdk = createClient(fn)
    await sdk.closePeriod(2026, 1)

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.year).toBe(2026)
    expect(body.month).toBe(1)
    expect(fn.mock.calls[0][0]).toContain('/close-period')
  })

  it('listPeriods sends correct action', async () => {
    const fn = mockFetch({ success: true, periods: [] })
    const sdk = createClient(fn)
    await sdk.listPeriods()

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.action).toBe('list')
  })

  // === GET ENDPOINTS (requestGet) ===

  it('getAPAging uses GET with query params', async () => {
    const fn = mockFetch({ success: true, as_of_date: '2026-01-01', summary: {} })
    const sdk = createClient(fn)
    await sdk.getAPAging('2026-01-01')

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(url).toContain('/ap-aging')
    expect(url).toContain('as_of_date=2026-01-01')
    expect(opts.body).toBeUndefined()
  })

  it('getRunway uses GET with no params', async () => {
    const fn = mockFetch({ success: true, snapshot_date: '2026-01-01', actuals: {} })
    const sdk = createClient(fn)
    await sdk.getRunway()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(url).toContain('/get-runway')
  })

  it('getBalanceSheet uses GET', async () => {
    const fn = mockFetch({ success: true, report: {} })
    const sdk = createClient(fn)
    await sdk.getBalanceSheet('2026-01-01')

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(url).toContain('/balance-sheet')
    expect(url).toContain('as_of_date=2026-01-01')
  })

  // === CREATE CREATOR ===

  it('createCreator maps nested snake_case correctly', async () => {
    const fn = mockFetch({
      success: true,
      participant: {
        id: 'creator_1',
        account_id: 'acc_1',
        display_name: 'Test',
        email: 'test@example.com',
        default_split_percent: 80,
        payout_preferences: { schedule: 'monthly' },
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.createCreator({
      creatorId: 'creator_1',
      displayName: 'Test',
      email: 'test@example.com',
      payoutPreferences: { schedule: 'monthly', minimumAmount: 5000 },
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.participant_id).toBe('creator_1')
    expect(body.payout_preferences.minimum_amount).toBe(5000)

    expect(result.creator.accountId).toBe('acc_1')
    expect(result.creator.defaultSplitPercent).toBe(80)
  })

  it('createParticipant wraps creator onboarding in participant vocabulary', async () => {
    const fn = mockFetch({
      success: true,
      participant: {
        id: 'p_1',
        account_id: 'acct_1',
        linked_user_id: '550e8400-e29b-41d4-a716-446655440000',
        display_name: 'Alice',
        email: 'alice@example.com',
        default_split_percent: 80,
        payout_preferences: { schedule: 'manual' },
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.createParticipant({
      participantId: 'p_1',
      userId: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Alice',
      email: 'alice@example.com',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.participant_id).toBe('p_1')
    expect(body.user_id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.participant.accountId).toBe('acct_1')
    expect(result.participant.linkedUserId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.participant.displayName).toBe('Alice')
  })

  it('webhooks.verifySignature validates timestamped signatures', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const payload = JSON.stringify({
      event: 'payout.executed',
      data: { payout_id: 'po_1' },
    })
    const timestamp = 1_762_000_000
    const header = await buildWebhookSignature(payload, 'whsec_test', timestamp)

    const isValid = await sdk.webhooks.verifySignature(payload, header, 'whsec_test', {
      toleranceSeconds: 300,
      now: timestamp,
    })

    expect(isValid).toBe(true)
  })

  it('webhooks.parseEvent normalizes event payloads', () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const event = sdk.webhooks.parseEvent<{ payout_id: string }>(JSON.stringify({
      event: 'payout.executed',
      data: { payout_id: 'po_1' },
    }))

    expect(event.type).toBe('payout.executed')
    expect(event.data?.payout_id).toBe('po_1')
  })

  it('listWebhookEndpoints maps webhook endpoints to camelCase', async () => {
    const fn = mockFetch({
      success: true,
      data: [
        {
          id: 'wh_1',
          url: 'https://example.com/webhooks',
          description: 'Primary endpoint',
          events: ['payout.executed'],
          is_active: true,
          created_at: '2026-03-13T12:00:00Z',
          secret_rotated_at: '2026-03-13T13:00:00Z',
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.listWebhookEndpoints()

    expect(result.data[0]).toEqual({
      id: 'wh_1',
      url: 'https://example.com/webhooks',
      description: 'Primary endpoint',
      events: ['payout.executed'],
      isActive: true,
      createdAt: '2026-03-13T12:00:00Z',
      secretRotatedAt: '2026-03-13T13:00:00Z',
    })
  })

  it('getWebhookDeliveries maps delivery details and endpoint url', async () => {
    const fn = mockFetch({
      success: true,
      data: [
        {
          id: 'wd_1',
          endpoint_id: 'wh_1',
          endpoint_url: 'https://example.com/webhooks',
          event_type: 'refund.created',
          status: 'failed',
          attempts: 3,
          max_attempts: 5,
          response_status: 500,
          response_body: 'upstream error',
          response_time_ms: 890,
          created_at: '2026-03-13T12:00:00Z',
          delivered_at: null,
          next_retry_at: '2026-03-13T12:05:00Z',
          payload: { event: 'refund.created' },
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.getWebhookDeliveries('wh_1', 25)

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.endpoint_id).toBe('wh_1')
    expect(body.limit).toBe(25)
    expect(result.data[0]).toEqual({
      id: 'wd_1',
      endpointId: 'wh_1',
      endpointUrl: 'https://example.com/webhooks',
      eventType: 'refund.created',
      status: 'failed',
      attempts: 3,
      maxAttempts: 5,
      responseStatus: 500,
      responseBody: 'upstream error',
      responseTimeMs: 890,
      createdAt: '2026-03-13T12:00:00Z',
      deliveredAt: null,
      nextRetryAt: '2026-03-13T12:05:00Z',
      payload: { event: 'refund.created' },
    })
  })

  it('rotateWebhookSecret returns the newly-issued secret', async () => {
    const fn = mockFetch({
      success: true,
      data: { secret: 'whsec_next' },
      message: 'Secret rotated. Previous secret valid for 24 hours.',
    })
    const sdk = createClient(fn)
    const result = await sdk.rotateWebhookSecret('wh_1')

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.action).toBe('rotate_secret')
    expect(body.endpoint_id).toBe('wh_1')
    expect(result.data.secret).toBe('whsec_next')
    expect(result.message).toContain('Previous secret valid for 24 hours')
  })

  it('listParticipants maps creator balances to participant summaries', async () => {
    const fn = mockFetch({
      success: true,
      participants: [
        {
          id: 'p_1',
          linked_user_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Alice',
          tier: 'starter',
          ledger_balance: 120,
          held_amount: 20,
          available_balance: 100,
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.listParticipants()

    expect(result.participants[0]).toEqual({
      id: 'p_1',
      linkedUserId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Alice',
      tier: 'starter',
      ledgerBalance: 120,
      heldAmount: 20,
      availableBalance: 100,
    })
  })

  it('getWallet maps wallet objects directly', async () => {
    const fn = mockFetch({
      success: true,
      wallet: {
        id: 'wallet_1',
        object: 'wallet',
        wallet_type: 'creator_earnings',
        scope_type: 'participant',
        owner_id: 'p_1',
        owner_type: 'participant',
        participant_id: 'p_1',
        account_type: 'creator_balance',
        name: 'Creator Earnings',
        currency: 'USD',
        status: 'active',
        balance: 75,
        held_amount: 5,
        available_balance: 70,
        redeemable: true,
        transferable: false,
        topup_supported: false,
        payout_supported: true,
        created_at: '2026-01-01T00:00:00Z',
        metadata: {},
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.getWallet('wallet_1')

    expect(result.wallet.id).toBe('wallet_1')
    expect(result.wallet.ownerId).toBe('p_1')
    expect(result.wallet.availableBalance).toBe(70)
  })

  it('getParticipant maps linked user ids into participant details', async () => {
    const fn = mockFetch({
      success: true,
      participant: {
        id: 'p_1',
        linked_user_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Alice',
        tier: 'starter',
        custom_split_percent: 90,
        ledger_balance: 120,
        held_amount: 20,
        available_balance: 100,
        holds: [],
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.getParticipant('p_1')

    expect(result.participant.linkedUserId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.participant.customSplitPercent).toBe(90)
  })

  it('createTransfer maps participant transfer vocabulary to wallet transfer', async () => {
    const fn = mockFetch({
      success: true,
      transfer: {
        transaction_id: 'txn_transfer_1',
        from_participant_id: 'p_1',
        to_participant_id: 'p_2',
        from_balance: 50,
        to_balance: 150,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.createTransfer({
      fromParticipantId: 'p_1',
      toParticipantId: 'p_2',
      amount: 5000,
      referenceId: 'xfer_1',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.from_participant_id).toBe('p_1')
    expect(body.to_participant_id).toBe('p_2')
    expect(result.transfer.transactionId).toBe('txn_transfer_1')
    expect(result.transfer.fromBalance).toBe(50)
  })

  it('listHolds maps held-funds rows to treasury hold objects', async () => {
    const fn = mockFetch({
      success: true,
      count: 1,
      holds: [
        {
          id: 'hold_1',
          participant_id: 'p_1',
          participant_name: 'Alice',
          amount: 25,
          currency: 'USD',
          held_since: '2026-01-01T00:00:00Z',
          days_held: 5,
          hold_reason: 'dispute',
          hold_until: '2026-01-10T00:00:00Z',
          ready_for_release: false,
          release_status: 'held',
          transaction_reference: 'order_1',
          product_name: 'Book',
          venture_id: 'venture_1',
          connected_account_ready: true,
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.listHolds({ participantId: 'p_1', readyOnly: false })

    const [url, opts] = fn.mock.calls[0]
    expect(String(url)).toContain('/holds?participant_id=p_1')
    expect(opts.method).toBe('GET')
    expect(result.holds[0].id).toBe('hold_1')
    expect(result.holds[0].participantId).toBe('p_1')
    expect(result.holds[0].connectedAccountReady).toBe(true)
  })

  // === CREATE LEDGER ===

  it('createLedger maps response with warning', async () => {
    const fn = mockFetch({
      success: true,
      ledger: {
        id: 'led_1',
        business_name: 'Acme',
        ledger_mode: 'standard',
        api_key: 'slk_example_key_for_tests',
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
      },
      warning: 'Save your API key securely - it cannot be retrieved again!',
    })
    const sdk = createClient(fn)
    const result = await sdk.createLedger({
      businessName: 'Acme',
      ownerEmail: 'admin@acme.com',
    })

    expect(result.ledger.apiKey).toBe('slk_example_key_for_tests')
    expect(result.warning).toContain('cannot be retrieved')
  })

  // === RISK EVALUATION ===

  it('evaluateFraud maps nested response', async () => {
    const fn = mockFetch({
      success: true,
      cached: false,
      evaluation: {
        id: 'eval_1',
        signal: 'elevated_risk',
        risk_factors: [
          { policy_id: 'p1', policy_type: 'budget_cap', severity: 'soft', indicator: 'Over budget' },
        ],
        valid_until: '2026-01-02T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        acknowledged_at: null,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.evaluateFraud({
      idempotencyKey: 'eval_key_1',
      amount: 50000,
    })

    expect(result.evaluation.signal).toBe('elevated_risk')
    expect(result.evaluation.riskFactors[0].policyId).toBe('p1')
    expect(result.evaluation.acknowledgedAt).toBeNull()
  })

  // === SEND BREACH ALERT (no configs case) ===

  it('sendBreachAlert handles no-configs response gracefully', async () => {
    const fn = mockFetch({
      success: true,
      message: 'No active alert configurations found for breach_risk',
      alerts_sent: 0,
    })
    const sdk = createClient(fn)
    const result = await sdk.sendBreachAlert({
      cashBalance: 10000,
      pendingTotal: 50000,
      triggeredBy: 'manual',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('No active')
    expect(result.alertsSent).toBe(0)
    expect(result.alertsFailed).toBeUndefined()
    expect(result.results).toBeUndefined()
  })

  // === EXPORT REPORT CSV ===

  it('exportReport with csv format returns raw text', async () => {
    const csvData = 'id,amount,date\ntxn_1,10000,2026-01-01'
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(csvData),
      headers: new Headers({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="transaction_detail_2026-01-01.csv"',
      }),
    })
    const sdk = createClient(fn)
    const result = await sdk.exportReport({
      reportType: 'transaction_detail',
      format: 'csv',
    })

    expect(result).toEqual({
      csv: csvData,
      filename: 'transaction_detail_2026-01-01.csv',
    })
  })

  it('exportReport with json format returns parsed data', async () => {
    const fn = mockFetch({
      success: true,
      report_type: 'transaction_detail',
      generated_at: '2026-01-01T00:00:00Z',
      row_count: 1,
      data: [{ id: 'txn_1' }],
    })
    const sdk = createClient(fn)
    const result = await sdk.exportReport({
      reportType: 'transaction_detail',
      format: 'json',
    })

    expect(result).toMatchObject({ success: true, row_count: 1 })
  })

  // === RECORD ADJUSTMENT ===

  it('recordAdjustment maps entries to snake_case', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_1', adjustment_id: 'adj_1', entries_created: 2 })
    const sdk = createClient(fn)
    await sdk.recordAdjustment({
      adjustmentType: 'correction',
      entries: [
        { accountType: 'cash', entryType: 'debit', amount: 1000 },
        { accountType: 'revenue', entryType: 'credit', amount: 1000 },
      ],
      reason: 'Fix misclassification',
      preparedBy: 'admin',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.adjustment_type).toBe('correction')
    expect(body.entries[0].account_type).toBe('cash')
    expect(body.entries[0].entry_type).toBe('debit')
    expect(body.prepared_by).toBe('admin')
  })

  // === FRAUD / TAX / COMPLIANCE ROUTING ===

  it('listFraudPolicies uses fraud policies GET route', async () => {
    const fn = mockFetch({ success: true, policies: [] })
    const sdk = createClient(fn)
    await sdk.listFraudPolicies()

    expect(fn.mock.calls[0][1].method).toBe('GET')
    expect(fn.mock.calls[0][0]).toContain('/fraud/policies')
  })

  it('calculateTaxForParticipant uses tax calculations GET route', async () => {
    const fn = mockFetch({
      success: true,
      calculation: {
        participant_id: 'creator_1',
        tax_year: 2025,
        gross_payments: 1200,
        transaction_count: 3,
        requires_1099: true,
        monthly_totals: {},
        threshold: 600,
        linked_user_id: null,
        shared_tax_profile: null,
      },
    })
    const sdk = createClient(fn)
    await sdk.calculateTaxForParticipant('creator_1', 2025)

    expect(fn.mock.calls[0][1].method).toBe('GET')
    expect(fn.mock.calls[0][0]).toContain('/tax/calculations/creator_1')
    expect(fn.mock.calls[0][0]).toContain('tax_year=2025')
  })

  it('getComplianceOverview uses compliance overview GET route', async () => {
    const fn = mockFetch({
      success: true,
      overview: {
        window_days: 30,
        access_window_hours: 24,
        total_events: 10,
        unique_ips: 2,
        unique_actors: 1,
        high_risk_events: 1,
        critical_risk_events: 0,
        failed_auth_events: 0,
        payouts_failed: 0,
        refunds_recorded: 1,
        dispute_events: 0,
      },
      note: 'monitoring note',
    })
    const sdk = createClient(fn)
    const result = await sdk.getComplianceOverview({ days: 30, hours: 24 })

    expect(fn.mock.calls[0][1].method).toBe('GET')
    expect(fn.mock.calls[0][0]).toContain('/compliance/overview')
    expect(result.overview.windowDays).toBe(30)
  })

  // === UPLOAD RECEIPT ===

  it('uploadReceipt maps all fields to snake_case', async () => {
    const fn = mockFetch({ success: true, receipt_id: 'rcpt_1', status: 'uploaded', linked_transaction_id: null })
    const sdk = createClient(fn)
    await sdk.uploadReceipt({
      fileUrl: 'https://storage.example.com/receipt.pdf',
      fileName: 'receipt.pdf',
      mimeType: 'application/pdf',
      merchantName: 'Office Depot',
      totalAmount: 4599,
      transactionId: 'txn_1',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.file_url).toBe('https://storage.example.com/receipt.pdf')
    expect(body.mime_type).toBe('application/pdf')
    expect(body.merchant_name).toBe('Office Depot')
    expect(body.total_amount).toBe(4599)
    expect(body.transaction_id).toBe('txn_1')
  })

  // === RECEIVE PAYMENT ===

  it('receivePayment maps to snake_case', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_rp1', amount: 5000 })
    const sdk = createClient(fn)
    await sdk.receivePayment({
      amount: 5000,
      customerName: 'John Doe',
      paymentMethod: 'card',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.customer_name).toBe('John Doe')
    expect(body.payment_method).toBe('card')
    expect(fn.mock.calls[0][0]).toContain('/receive-payment')
  })

  // === REVERSE TRANSACTION ===

  it('reverseTransaction maps to snake_case', async () => {
    const fn = mockFetch({ success: true, reversal_id: 'rev_1' })
    const sdk = createClient(fn)
    await sdk.reverseTransaction({
      transactionId: 'txn_1',
      reason: 'Duplicate',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.transaction_id).toBe('txn_1')
    expect(body.reason).toBe('Duplicate')
    expect(fn.mock.calls[0][0]).toContain('/reverse-transaction')
  })
})
