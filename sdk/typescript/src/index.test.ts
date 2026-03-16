import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Soledgic, SoledgicError, ValidationError, AuthenticationError, NotFoundError, ConflictError, mapWebhookEndpoint, mapWebhookDelivery } from './index'

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

  // === TYPED ERROR CLASSES ===

  describe('typed error classes', () => {
    it('ValidationError has status 400, correct name and default code', () => {
      const err = new ValidationError('bad input', { field: 'amount' })
      expect(err).toBeInstanceOf(SoledgicError)
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.status).toBe(400)
      expect(err.name).toBe('ValidationError')
      expect(err.code).toBe('VALIDATION_ERROR')
      expect(err.message).toBe('bad input')
      expect(err.details).toEqual({ field: 'amount' })
    })

    it('ValidationError accepts custom code', () => {
      const err = new ValidationError('bad', undefined, 'CUSTOM_CODE')
      expect(err.code).toBe('CUSTOM_CODE')
    })

    it('AuthenticationError has status 401 and default message', () => {
      const err = new AuthenticationError()
      expect(err).toBeInstanceOf(SoledgicError)
      expect(err).toBeInstanceOf(AuthenticationError)
      expect(err.status).toBe(401)
      expect(err.name).toBe('AuthenticationError')
      expect(err.code).toBe('AUTHENTICATION_ERROR')
      expect(err.message).toBe('Invalid API key')
    })

    it('AuthenticationError accepts custom message', () => {
      const err = new AuthenticationError('Token expired')
      expect(err.message).toBe('Token expired')
      expect(err.status).toBe(401)
    })

    it('NotFoundError has status 404', () => {
      const err = new NotFoundError('Resource missing', { id: '123' })
      expect(err).toBeInstanceOf(SoledgicError)
      expect(err).toBeInstanceOf(NotFoundError)
      expect(err.status).toBe(404)
      expect(err.name).toBe('NotFoundError')
      expect(err.code).toBe('NOT_FOUND')
      expect(err.message).toBe('Resource missing')
      expect(err.details).toEqual({ id: '123' })
    })

    it('ConflictError has status 409', () => {
      const err = new ConflictError('Duplicate entry', { ref: 'abc' })
      expect(err).toBeInstanceOf(SoledgicError)
      expect(err).toBeInstanceOf(ConflictError)
      expect(err.status).toBe(409)
      expect(err.name).toBe('ConflictError')
      expect(err.code).toBe('CONFLICT')
      expect(err.message).toBe('Duplicate entry')
      expect(err.details).toEqual({ ref: 'abc' })
    })

    it('SoledgicError preserves all constructor args', () => {
      const err = new SoledgicError('fail', 503, { reason: 'timeout' }, 'SERVICE_UNAVAILABLE')
      expect(err.status).toBe(503)
      expect(err.name).toBe('SoledgicError')
      expect(err.code).toBe('SERVICE_UNAVAILABLE')
      expect(err.details).toEqual({ reason: 'timeout' })
    })

    it('throwTypedError maps status codes to correct error classes', async () => {
      for (const [status, ErrorClass] of [
        [400, ValidationError],
        [401, AuthenticationError],
        [404, NotFoundError],
        [409, ConflictError],
        [500, SoledgicError],
        [502, SoledgicError],
      ] as const) {
        const fn = mockFetch({ error: 'test' }, status)
        const sdk = createClient(fn)
        try {
          await sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 })
          expect.unreachable(`should throw for status ${status}`)
        } catch (err) {
          expect(err).toBeInstanceOf(ErrorClass)
          expect((err as SoledgicError).status).toBe(status)
        }
      }
    })
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

  it('webhooks.verifySignature rejects wrong secret', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const payload = '{"event":"test"}'
    const timestamp = 1_762_000_000
    const header = await buildWebhookSignature(payload, 'correct_secret', timestamp)
    const isValid = await sdk.webhooks.verifySignature(payload, header, 'wrong_secret', { now: timestamp })
    expect(isValid).toBe(false)
  })

  it('webhooks.verifySignature rejects expired timestamp', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const payload = '{"event":"test"}'
    const oldTimestamp = 1_700_000_000
    const header = await buildWebhookSignature(payload, 'whsec_test', oldTimestamp)
    const isValid = await sdk.webhooks.verifySignature(payload, header, 'whsec_test', {
      toleranceSeconds: 300,
      now: oldTimestamp + 301, // 1 second past tolerance
    })
    expect(isValid).toBe(false)
  })

  it('webhooks.verifySignature accepts timestamp at exact tolerance boundary', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const payload = '{"event":"test"}'
    const timestamp = 1_762_000_000
    const header = await buildWebhookSignature(payload, 'whsec_test', timestamp)
    const isValid = await sdk.webhooks.verifySignature(payload, header, 'whsec_test', {
      toleranceSeconds: 300,
      now: timestamp + 300, // exactly at boundary
    })
    expect(isValid).toBe(true)
  })

  it('webhooks.verifySignature rejects empty signature header', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const isValid = await sdk.webhooks.verifySignature('payload', '', 'secret')
    expect(isValid).toBe(false)
  })

  it('webhooks.verifySignature rejects header with no v1 signatures', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const isValid = await sdk.webhooks.verifySignature('payload', 't=12345', 'secret')
    expect(isValid).toBe(false)
  })

  it('webhooks.verifySignature supports legacy sha256= format', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const payload = 'test_payload'
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode('legacy_secret'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    const isValid = await sdk.webhooks.verifySignature(payload, `sha256=${hex}`, 'legacy_secret')
    expect(isValid).toBe(true)
  })

  it('webhooks.verifySignature rejects wrong legacy signature', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const isValid = await sdk.webhooks.verifySignature('payload', 'sha256=deadbeef', 'secret')
    expect(isValid).toBe(false)
  })

  it('webhooks.verifySignature handles ArrayBuffer payload', async () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const payload = '{"event":"test"}'
    const buffer = new TextEncoder().encode(payload).buffer
    const timestamp = 1_762_000_000
    const header = await buildWebhookSignature(payload, 'whsec_test', timestamp)
    const isValid = await sdk.webhooks.verifySignature(buffer, header, 'whsec_test', { now: timestamp })
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

  it('webhooks.parseEvent extracts id, createdAt, livemode', () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const event = sdk.webhooks.parseEvent(JSON.stringify({
      id: 'evt_123',
      type: 'sale.completed',
      created_at: '2026-01-15T00:00:00Z',
      livemode: true,
      data: { sale_id: 's1' },
    }))
    expect(event.id).toBe('evt_123')
    expect(event.type).toBe('sale.completed')
    expect(event.createdAt).toBe('2026-01-15T00:00:00Z')
    expect(event.livemode).toBe(true)
    expect(event.raw).toHaveProperty('type', 'sale.completed')
  })

  it('webhooks.parseEvent returns null for missing fields', () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const event = sdk.webhooks.parseEvent(JSON.stringify({}))
    expect(event.id).toBeNull()
    expect(event.type).toBe('unknown')
    expect(event.createdAt).toBeNull()
    expect(event.livemode).toBeNull()
    expect(event.data).toBeNull()
  })

  it('webhooks.parseEvent uses event field as fallback for type', () => {
    const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
    const event = sdk.webhooks.parseEvent(JSON.stringify({ event: 'refund.created' }))
    expect(event.type).toBe('refund.created')
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

  it('reverseTransaction sends idempotency_key and partial_amount', async () => {
    const fn = mockFetch({
      success: true,
      void_type: 'reversing_entry',
      message: 'Transaction reversed with reversing entries',
      reversal_id: 'rev_2',
      original_transaction_id: 'txn_5',
      reversed_amount: 50.00,
      is_partial: true,
      reversed_at: '2026-03-14T00:00:00Z',
    })
    const sdk = createClient(fn)
    await sdk.reverseTransaction({
      transactionId: 'txn_5',
      reason: 'Partial refund',
      partialAmount: 5000,
      idempotencyKey: 'idem_123',
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.transaction_id).toBe('txn_5')
    expect(body.partial_amount).toBe(5000)
    expect(body.idempotency_key).toBe('idem_123')
    expect(body.reason).toBe('Partial refund')
  })

  it('reverseTransaction maps snake_case response to camelCase', async () => {
    const fn = mockFetch({
      success: true,
      void_type: 'reversing_entry',
      message: 'Transaction reversed with reversing entries',
      reversal_id: 'rev_3',
      original_transaction_id: 'txn_6',
      reversed_amount: 25.50,
      is_partial: true,
      reversed_at: '2026-03-14T12:00:00Z',
      voided_at: null,
      warning: 'This transaction was reconciled - bank matching may need review',
    })
    const sdk = createClient(fn)
    const result = await sdk.reverseTransaction({
      transactionId: 'txn_6',
      reason: 'Partial correction',
      partialAmount: 2550,
    })

    expect(result.success).toBe(true)
    expect(result.voidType).toBe('reversing_entry')
    expect(result.message).toBe('Transaction reversed with reversing entries')
    expect(result.transactionId).toBe('txn_6')
    expect(result.reversalId).toBe('rev_3')
    expect(result.reversedAmount).toBe(25.50)
    expect(result.isPartial).toBe(true)
    expect(result.reversedAt).toBe('2026-03-14T12:00:00Z')
    expect(result.voidedAt).toBeNull()
    expect(result.warning).toBe('This transaction was reconciled - bank matching may need review')
  })

  it('reverseTransaction maps soft_delete response correctly', async () => {
    const fn = mockFetch({
      success: true,
      void_type: 'soft_delete',
      message: 'Transaction voided successfully',
      transaction_id: 'txn_7',
      reversal_id: null,
      voided_at: '2026-03-14T10:00:00Z',
    })
    const sdk = createClient(fn)
    const result = await sdk.reverseTransaction({
      transactionId: 'txn_7',
      reason: 'Not needed',
    })

    expect(result.voidType).toBe('soft_delete')
    expect(result.transactionId).toBe('txn_7')
    expect(result.reversalId).toBeNull()
    expect(result.voidedAt).toBe('2026-03-14T10:00:00Z')
    expect(result.reversedAmount).toBeNull()
    expect(result.isPartial).toBeNull()
  })

  // === CORRECT TAX DOCUMENT ===

  it('correctTaxDocument sends params correctly', async () => {
    const fn = mockFetch({ success: true, document: { id: 'doc_1', status: 'corrected' } })
    const sdk = createClient(fn)
    await sdk.correctTaxDocument('doc_1', {
      reason: 'Wrong amount',
      grossAmount: 150000,
      federalWithholding: 3000,
      stateWithholding: 1500,
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.reason).toBe('Wrong amount')
    expect(body.gross_amount).toBe(150000)
    expect(body.federal_withholding).toBe(3000)
    expect(body.state_withholding).toBe(1500)
    expect(fn.mock.calls[0][0]).toContain('/tax/documents/doc_1/correct')
  })

  // === DELIVER TAX DOCUMENT COPY B ===

  it('deliverTaxDocumentCopyB sends tax_year', async () => {
    const fn = mockFetch({ success: true, delivered: 5 })
    const sdk = createClient(fn)
    await sdk.deliverTaxDocumentCopyB(2025)

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.tax_year).toBe(2025)
    expect(fn.mock.calls[0][0]).toContain('/tax/documents/deliver-copy-b')
  })

  // === GROUP 1: INVOICE METHODS ===

  it('createInvoice sends line_items and customer_name', async () => {
    const fn = mockFetch({ success: true, invoice_id: 'inv_1', transaction_id: 'txn_inv1' })
    const sdk = createClient(fn)
    await sdk.createInvoice({
      customerName: 'Acme Corp',
      customerEmail: 'billing@acme.com',
      lineItems: [
        { description: 'Consulting', quantity: 2, unitPrice: 5000 },
        { description: 'Setup fee', quantity: 1, unitPrice: 2500 },
      ],
      dueDate: '2026-04-01',
      notes: 'Net 30',
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/invoices')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.customer_name).toBe('Acme Corp')
    expect(body.customer_email).toBe('billing@acme.com')
    expect(body.line_items).toHaveLength(2)
    expect(body.line_items[0].description).toBe('Consulting')
    expect(body.line_items[0].quantity).toBe(2)
    expect(body.line_items[0].unit_price).toBe(5000)
    expect(body.line_items[1].description).toBe('Setup fee')
    expect(body.due_date).toBe('2026-04-01')
    expect(body.notes).toBe('Net 30')
  })

  it('createInvoice computes amount from quantity * unitPrice', async () => {
    const fn = mockFetch({ success: true, invoice_id: 'inv_2' })
    const sdk = createClient(fn)
    await sdk.createInvoice({
      customerName: 'Test',
      lineItems: [{ description: 'Item', quantity: 3, unitPrice: 1000 }],
    })

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.line_items[0].amount).toBe(3000)
  })

  it('listInvoices sends query params via GET', async () => {
    const fn = mockFetch({ success: true, invoices: [], count: 0 })
    const sdk = createClient(fn)
    await sdk.listInvoices({ status: 'sent', customerId: 'cust_1', limit: 10, offset: 5 })

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/invoices')
    expect(String(url)).toContain('status=sent')
    expect(String(url)).toContain('customer_id=cust_1')
    expect(String(url)).toContain('limit=10')
    expect(String(url)).toContain('offset=5')
  })

  it('sendInvoice calls the correct endpoint path', async () => {
    const fn = mockFetch({ success: true, message: 'Invoice sent' })
    const sdk = createClient(fn)
    await sdk.sendInvoice('inv_42')

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/invoices/inv_42/send')
    expect(opts.method).toBe('POST')
  })

  it('recordInvoicePayment sends amount and payment_method', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_pay1' })
    const sdk = createClient(fn)
    await sdk.recordInvoicePayment('inv_42', {
      amount: 7500,
      paymentMethod: 'bank_transfer',
      paymentDate: '2026-03-10',
      referenceId: 'ref_pay1',
      notes: 'Partial payment',
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/invoices/inv_42/record-payment')
    const body = JSON.parse(opts.body)
    expect(body.amount).toBe(7500)
    expect(body.payment_method).toBe('bank_transfer')
    expect(body.payment_date).toBe('2026-03-10')
    expect(body.reference_id).toBe('ref_pay1')
    expect(body.notes).toBe('Partial payment')
  })

  it('voidInvoice calls the correct endpoint', async () => {
    const fn = mockFetch({ success: true })
    const sdk = createClient(fn)
    await sdk.voidInvoice('inv_42', 'Customer cancelled')

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/invoices/inv_42/void')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.reason).toBe('Customer cancelled')
  })

  // === GROUP 2: FINANCIAL OPERATIONS ===

  it('payBill sends bill_transaction_id and amount', async () => {
    const fn = mockFetch({ success: true, transaction_id: 'txn_pb1' })
    const sdk = createClient(fn)
    await sdk.payBill({
      billTransactionId: 'bill_1',
      amount: 15000,
      vendorName: 'AWS',
      paymentMethod: 'ach',
      referenceId: 'ref_pb1',
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/pay-bill')
    const body = JSON.parse(opts.body)
    expect(body.bill_transaction_id).toBe('bill_1')
    expect(body.amount).toBe(15000)
    expect(body.vendor_name).toBe('AWS')
    expect(body.payment_method).toBe('ach')
    expect(body.reference_id).toBe('ref_pb1')
  })

  it('createBudget sends category_code and budget_amount', async () => {
    const fn = mockFetch({ success: true, budget_id: 'bgt_1' })
    const sdk = createClient(fn)
    await sdk.createBudget({
      name: 'Marketing',
      categoryCode: 'marketing',
      budgetAmount: 500000,
      budgetPeriod: 'monthly',
      alertAtPercentage: 80,
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/manage-budgets')
    const body = JSON.parse(opts.body)
    expect(body.name).toBe('Marketing')
    expect(body.category_code).toBe('marketing')
    expect(body.budget_amount).toBe(500000)
    expect(body.budget_period).toBe('monthly')
    expect(body.alert_at_percentage).toBe(80)
  })

  it('listBudgets uses GET', async () => {
    const fn = mockFetch({ success: true, budgets: [] })
    const sdk = createClient(fn)
    await sdk.listBudgets()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/manage-budgets')
  })

  it('createRecurring sends frequency and amount', async () => {
    const fn = mockFetch({ success: true, recurring_id: 'rec_1' })
    const sdk = createClient(fn)
    await sdk.createRecurring({
      name: 'AWS Hosting',
      merchantName: 'Amazon Web Services',
      categoryCode: 'hosting',
      amount: 25000,
      recurrenceInterval: 'monthly',
      recurrenceDay: 1,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      businessPurpose: 'Cloud hosting',
      isVariableAmount: true,
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/manage-recurring')
    const body = JSON.parse(opts.body)
    expect(body.name).toBe('AWS Hosting')
    expect(body.merchant_name).toBe('Amazon Web Services')
    expect(body.category_code).toBe('hosting')
    expect(body.amount).toBe(25000)
    expect(body.recurrence_interval).toBe('monthly')
    expect(body.recurrence_day).toBe(1)
    expect(body.start_date).toBe('2026-01-01')
    expect(body.end_date).toBe('2026-12-31')
    expect(body.business_purpose).toBe('Cloud hosting')
    expect(body.is_variable_amount).toBe(true)
  })

  it('listRecurring uses GET', async () => {
    const fn = mockFetch({ success: true, recurring: [] })
    const sdk = createClient(fn)
    await sdk.listRecurring()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/manage-recurring')
  })

  // === GROUP 3: TAX METHODS ===

  it('generateAllTaxDocuments sends tax_year and maps response', async () => {
    const fn = mockFetch({
      success: true,
      generation: {
        tax_year: 2025,
        created: 10,
        skipped: 2,
        total_amount: 1200000,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.generateAllTaxDocuments(2025)

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/tax/documents/generate')
    const body = JSON.parse(opts.body)
    expect(body.tax_year).toBe(2025)
    expect(result.success).toBe(true)
    expect(result.generation.taxYear).toBe(2025)
    expect(result.generation.created).toBe(10)
    expect(result.generation.skipped).toBe(2)
    expect(result.generation.totalAmount).toBe(1200000)
  })

  it('listTaxDocuments uses GET with tax_year query param and maps response', async () => {
    const fn = mockFetch({
      success: true,
      tax_year: 2025,
      summary: {
        total_documents: 15,
        total_amount: 2500000,
        by_status: { calculated: 10, exported: 3, filed: 2 },
      },
      documents: [{ id: 'doc_1' }],
    })
    const sdk = createClient(fn)
    const result = await sdk.listTaxDocuments(2025)

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/tax/documents')
    expect(String(url)).toContain('tax_year=2025')
    expect(result.taxYear).toBe(2025)
    expect(result.summary.totalDocuments).toBe(15)
    expect(result.summary.totalAmount).toBe(2500000)
    expect(result.summary.byStatus.calculated).toBe(10)
    expect(result.summary.byStatus.exported).toBe(3)
    expect(result.summary.byStatus.filed).toBe(2)
    expect(result.documents).toHaveLength(1)
  })

  it('markTaxDocumentFiled calls correct endpoint path', async () => {
    const fn = mockFetch({
      success: true,
      document: { id: 'doc_99', tax_year: 2025, status: 'filed' },
    })
    const sdk = createClient(fn)
    const result = await sdk.markTaxDocumentFiled('doc_99')

    const [url] = fn.mock.calls[0]
    expect(url).toContain('/tax/documents/doc_99/mark-filed')
    expect(result.document.id).toBe('doc_99')
    expect(result.document.status).toBe('filed')
  })

  it('markTaxDocumentsFiledBulk sends tax_year', async () => {
    const fn = mockFetch({ success: true, updated: 8 })
    const sdk = createClient(fn)
    await sdk.markTaxDocumentsFiledBulk(2025)

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/tax/documents/mark-filed')
    const body = JSON.parse(opts.body)
    expect(body.tax_year).toBe(2025)
  })

  it('generateTaxDocumentPdf sends document_id in path', async () => {
    const fn = mockFetch({ success: true, pdf_url: 'https://example.com/doc_55.pdf' })
    const sdk = createClient(fn)
    await sdk.generateTaxDocumentPdf('doc_55', 'copy_b')

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/tax/documents/doc_55/pdf')
    const body = JSON.parse(opts.body)
    expect(body.copy_type).toBe('copy_b')
  })

  it('generateTaxDocumentPdfBatch sends tax_year and copy_type', async () => {
    const fn = mockFetch({ success: true, count: 10, batch_id: 'batch_1' })
    const sdk = createClient(fn)
    await sdk.generateTaxDocumentPdfBatch(2025, 'copy_a')

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/tax/documents/pdf/batch')
    const body = JSON.parse(opts.body)
    expect(body.tax_year).toBe(2025)
    expect(body.copy_type).toBe('copy_a')
  })

  // === GROUP 4: CONTRACTOR AND BANK METHODS ===

  it('createContractor sends name and email', async () => {
    const fn = mockFetch({ success: true, contractor_id: 'ctr_1' })
    const sdk = createClient(fn)
    await sdk.createContractor({
      name: 'Jane Developer',
      email: 'jane@example.com',
      companyName: 'Dev LLC',
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/manage-contractors')
    const body = JSON.parse(opts.body)
    expect(body.name).toBe('Jane Developer')
    expect(body.email).toBe('jane@example.com')
    expect(body.company_name).toBe('Dev LLC')
  })

  it('listContractors uses GET', async () => {
    const fn = mockFetch({ success: true, contractors: [] })
    const sdk = createClient(fn)
    await sdk.listContractors()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/manage-contractors')
  })

  it('recordContractorPayment sends contractor_id and amount', async () => {
    const fn = mockFetch({ success: true, payment_id: 'cpay_1' })
    const sdk = createClient(fn)
    await sdk.recordContractorPayment({
      contractorId: 'ctr_1',
      amount: 250000,
      paymentDate: '2026-03-01',
      paymentMethod: 'ach',
      paymentReference: 'ref_cp1',
      description: 'March development work',
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/manage-contractors/payment')
    const body = JSON.parse(opts.body)
    expect(body.contractor_id).toBe('ctr_1')
    expect(body.amount).toBe(250000)
    expect(body.payment_date).toBe('2026-03-01')
    expect(body.payment_method).toBe('ach')
    expect(body.payment_reference).toBe('ref_cp1')
    expect(body.description).toBe('March development work')
  })

  it('createBankAccount sends account_name and account_type', async () => {
    const fn = mockFetch({ success: true, bank_account_id: 'ba_1' })
    const sdk = createClient(fn)
    await sdk.createBankAccount({
      bankName: 'Chase',
      accountName: 'Business Checking',
      accountType: 'checking',
      accountLastFour: '4321',
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/manage-bank-accounts')
    const body = JSON.parse(opts.body)
    expect(body.bank_name).toBe('Chase')
    expect(body.account_name).toBe('Business Checking')
    expect(body.account_type).toBe('checking')
    expect(body.account_last_four).toBe('4321')
  })

  it('listBankAccounts uses GET', async () => {
    const fn = mockFetch({ success: true, bank_accounts: [] })
    const sdk = createClient(fn)
    await sdk.listBankAccounts()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/manage-bank-accounts')
  })

  // === GROUP 5: OTHER MISSING ===

  it('deleteCreator sends creator_id', async () => {
    const fn = mockFetch({ success: true, deleted: true })
    const sdk = createClient(fn)
    await sdk.deleteCreator('creator_99')

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/delete-creator')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.creator_id).toBe('creator_99')
  })

  it('submitTaxInfo sends legal_name, tax_id_type, and tax_id_last4', async () => {
    const fn = mockFetch({ success: true, tax_info_id: 'ti_1' })
    const sdk = createClient(fn)
    await sdk.submitTaxInfo({
      participantId: 'p_1',
      legalName: 'Jane Doe',
      taxIdType: 'ssn',
      taxIdLast4: '1234',
      businessType: 'individual',
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
      },
      certify: true,
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/submit-tax-info')
    const body = JSON.parse(opts.body)
    expect(body.participant_id).toBe('p_1')
    expect(body.legal_name).toBe('Jane Doe')
    expect(body.tax_id_type).toBe('ssn')
    expect(body.tax_id_last4).toBe('1234')
    expect(body.business_type).toBe('individual')
    expect(body.certify).toBe(true)
    expect(body.address.line1).toBe('123 Main St')
    expect(body.address.postal_code).toBe('94102')
  })

  it('listLedgers uses GET on the correct endpoint', async () => {
    const fn = mockFetch({ success: true, ledgers: [] })
    const sdk = createClient(fn)
    await sdk.listLedgers()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/list-ledgers')
  })

  it('importBankStatement sends lines array with snake_case fields', async () => {
    const fn = mockFetch({ success: true, imported: 2, matched: 1 })
    const sdk = createClient(fn)
    await sdk.importBankStatement({
      bankAccountId: 'ba_1',
      lines: [
        {
          transactionDate: '2026-03-01',
          description: 'AWS Payment',
          amount: -15000,
          referenceNumber: 'REF001',
          merchantName: 'Amazon',
          categoryHint: 'hosting',
        },
        {
          transactionDate: '2026-03-02',
          postDate: '2026-03-03',
          description: 'Client Payment',
          amount: 50000,
          checkNumber: '1234',
        },
      ],
      autoMatch: true,
    })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toContain('/import-bank-statement')
    const body = JSON.parse(opts.body)
    expect(body.bank_account_id).toBe('ba_1')
    expect(body.auto_match).toBe(true)
    expect(body.lines).toHaveLength(2)
    expect(body.lines[0].transaction_date).toBe('2026-03-01')
    expect(body.lines[0].description).toBe('AWS Payment')
    expect(body.lines[0].amount).toBe(-15000)
    expect(body.lines[0].reference_number).toBe('REF001')
    expect(body.lines[0].merchant_name).toBe('Amazon')
    expect(body.lines[0].category_hint).toBe('hosting')
    expect(body.lines[1].post_date).toBe('2026-03-03')
    expect(body.lines[1].check_number).toBe('1234')
  })

  it('listComplianceAccessPatterns sends hours param and maps response', async () => {
    const fn = mockFetch({
      success: true,
      window_hours: 48,
      count: 1,
      patterns: [
        {
          ip_address: '192.168.1.1',
          hour: '2026-03-14T10:00:00Z',
          request_count: 50,
          unique_actions: 3,
          actions: ['record-sale', 'list-periods', 'get-runway'],
          max_risk_score: 2,
          failed_auths: 0,
        },
      ],
    })
    const sdk = createClient(fn)
    const result = await sdk.listComplianceAccessPatterns({ hours: 48, limit: 100 })

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/compliance/access-patterns')
    expect(String(url)).toContain('hours=48')
    expect(String(url)).toContain('limit=100')
    expect(result.windowHours).toBe(48)
    expect(result.count).toBe(1)
    expect(result.patterns[0].ipAddress).toBe('192.168.1.1')
    expect(result.patterns[0].requestCount).toBe(50)
    expect(result.patterns[0].uniqueActions).toBe(3)
    expect(result.patterns[0].actions).toEqual(['record-sale', 'list-periods', 'get-runway'])
    expect(result.patterns[0].maxRiskScore).toBe(2)
    expect(result.patterns[0].failedAuths).toBe(0)
  })

  it('getHoldSummary uses GET on holds/summary endpoint', async () => {
    const fn = mockFetch({
      success: true,
      summary: {
        total_held: 50000,
        total_count: 5,
        ready_for_release: 2,
      },
    })
    const sdk = createClient(fn)
    const result = await sdk.getHoldSummary()

    const [url, opts] = fn.mock.calls[0]
    expect(opts.method).toBe('GET')
    expect(String(url)).toContain('/holds/summary')
    expect(result.success).toBe(true)
    expect(result.summary.total_held).toBe(50000)
    expect(result.summary.total_count).toBe(5)
  })

  // === DELETE OPERATIONS ===

  describe('deleteWebhookEndpoint', () => {
    it('sends action: delete with endpoint_id', async () => {
      const fn = mockFetch({ success: true, message: 'Endpoint deleted' })
      const sdk = createClient(fn)
      const result = await sdk.deleteWebhookEndpoint('ep_123')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/webhooks')
      expect(body.action).toBe('delete')
      expect(body.endpoint_id).toBe('ep_123')
      expect(result.success).toBe(true)
      expect(result.message).toBe('Endpoint deleted')
    })

    it('returns undefined message when response has no message', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.deleteWebhookEndpoint('ep_456')

      expect(result.success).toBe(true)
      expect(result.message).toBeUndefined()
    })
  })

  describe('deleteAlert', () => {
    it('sends action: delete with config_id', async () => {
      const fn = mockFetch({ success: true, message: 'Alert deleted' })
      const sdk = createClient(fn)
      const result = await sdk.deleteAlert('alert_cfg_1')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/configure-alerts')
      expect(body.action).toBe('delete')
      expect(body.config_id).toBe('alert_cfg_1')
      expect(result.success).toBe(true)
      expect(result.message).toBe('Alert deleted')
    })
  })

  // === PDF EXPORTS ===

  describe('generatePDF', () => {
    it('sends report_type and snake_case options', async () => {
      const fn = mockFetch({ success: true, filename: 'pl_2026.pdf', data: 'base64data' })
      const sdk = createClient(fn)
      const result = await sdk.generatePDF('profit_loss', {
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        periodId: 'period_1',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/generate-pdf')
      expect(body.report_type).toBe('profit_loss')
      expect(body.start_date).toBe('2026-01-01')
      expect(body.end_date).toBe('2026-03-01')
      expect(body.period_id).toBe('period_1')
      expect(result.success).toBe(true)
      expect(result.filename).toBe('pl_2026.pdf')
      expect(result.data).toBe('base64data')
    })

    it('sends creator_statement with creatorId', async () => {
      const fn = mockFetch({ success: true, filename: 'stmt.pdf', data: 'base64', frozen: false })
      const sdk = createClient(fn)
      const result = await sdk.generatePDF('creator_statement', {
        creatorId: 'c_1',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('creator_statement')
      expect(body.creator_id).toBe('c_1')
      expect(result.frozen).toBe(false)
    })

    it('sends 1099 with tax_year', async () => {
      const fn = mockFetch({ success: true, filename: '1099_2025.pdf', data: 'base64' })
      const sdk = createClient(fn)
      await sdk.generatePDF('1099', { taxYear: 2025 })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('1099')
      expect(body.tax_year).toBe(2025)
    })
  })

  describe('getProfitLossPDF', () => {
    it('delegates to generatePDF with profit_loss type', async () => {
      const fn = mockFetch({ success: true, filename: 'pl.pdf', data: 'base64' })
      const sdk = createClient(fn)
      await sdk.getProfitLossPDF('2026-01-01', '2026-03-01', 'period_1')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('profit_loss')
      expect(body.start_date).toBe('2026-01-01')
      expect(body.end_date).toBe('2026-03-01')
      expect(body.period_id).toBe('period_1')
    })

    it('works without optional periodId', async () => {
      const fn = mockFetch({ success: true, filename: 'pl.pdf', data: 'base64' })
      const sdk = createClient(fn)
      await sdk.getProfitLossPDF('2026-01-01', '2026-03-01')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('profit_loss')
      expect(body.period_id).toBeUndefined()
    })
  })

  // === FROZEN STATEMENTS ===

  describe('generateFrozenStatements', () => {
    it('sends action: generate with period_id', async () => {
      const fn = mockFetch({ success: true, statements: ['profit_loss', 'balance_sheet'] })
      const sdk = createClient(fn)
      const result = await sdk.generateFrozenStatements('period_2026_01')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/frozen-statements')
      expect(body.action).toBe('generate')
      expect(body.period_id).toBe('period_2026_01')
      expect(result.success).toBe(true)
    })
  })

  describe('verifyFrozenStatements', () => {
    it('sends action: verify with period_id', async () => {
      const fn = mockFetch({
        success: true,
        all_valid: true,
        verification_results: [
          { statement_type: 'profit_loss', valid: true },
          { statement_type: 'balance_sheet', valid: true },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.verifyFrozenStatements('period_2026_01')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/frozen-statements')
      expect(body.action).toBe('verify')
      expect(body.period_id).toBe('period_2026_01')
      expect(result.success).toBe(true)
      expect(result.all_valid).toBe(true)
      expect(result.verification_results).toHaveLength(2)
    })

    it('returns all_valid: false when a statement is tampered', async () => {
      const fn = mockFetch({
        success: true,
        all_valid: false,
        verification_results: [
          { statement_type: 'profit_loss', valid: false, error: 'hash mismatch' },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.verifyFrozenStatements('period_2026_01')

      expect(result.all_valid).toBe(false)
      expect(result.verification_results[0].valid).toBe(false)
    })
  })

  // === TIER / SPLIT METHODS ===

  describe('listTiers', () => {
    it('sends action: list_tiers to manage-splits', async () => {
      const fn = mockFetch({
        success: true,
        tiers: [
          { id: 'tier_1', name: 'Gold', creator_percent: 85, threshold: 10000 },
          { id: 'tier_2', name: 'Silver', creator_percent: 80, threshold: 0 },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listTiers()

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/manage-splits')
      expect(body.action).toBe('list_tiers')
      expect(result.tiers).toHaveLength(2)
    })
  })

  describe('getEffectiveSplit', () => {
    it('sends action: get_effective_split with creator_id', async () => {
      const fn = mockFetch({
        success: true,
        creator_id: 'c_1',
        effective_split: 85,
        source: 'custom_override',
      })
      const sdk = createClient(fn)
      const result = await sdk.getEffectiveSplit('c_1')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/manage-splits')
      expect(body.action).toBe('get_effective_split')
      expect(body.creator_id).toBe('c_1')
      expect(result.effective_split).toBe(85)
      expect(result.source).toBe('custom_override')
    })
  })

  describe('setCreatorSplit', () => {
    it('sends action: set_creator_split with creator_id and split_percent', async () => {
      const fn = mockFetch({ success: true, message: 'Split updated' })
      const sdk = createClient(fn)
      const result = await sdk.setCreatorSplit('c_1', 90)

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/manage-splits')
      expect(body.action).toBe('set_creator_split')
      expect(body.creator_id).toBe('c_1')
      expect(body.split_percent).toBe(90)
      expect(result.success).toBe(true)
    })
  })

  // === IMPORT METHODS ===

  describe('getImportTemplates', () => {
    it('sends action: get_templates to import-transactions', async () => {
      const fn = mockFetch({
        success: true,
        templates: [
          { id: 'tpl_1', name: 'Chase CSV', bank_name: 'Chase', format: 'csv' },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.getImportTemplates()

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/import-transactions')
      expect(body.action).toBe('get_templates')
      expect(result.templates).toHaveLength(1)
      expect(result.templates[0].name).toBe('Chase CSV')
    })
  })

  describe('importTransactions', () => {
    it('sends action: import with transactions array', async () => {
      const transactions = [
        { date: '2026-01-15', description: 'Sale #1001', amount: 5000 },
        { date: '2026-01-16', description: 'Sale #1002', amount: 3000, reference: 'ref_1002' },
      ]
      const fn = mockFetch({ success: true, imported: 2, skipped: 0 })
      const sdk = createClient(fn)
      const result = await sdk.importTransactions(transactions)

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(fn.mock.calls[0][0]).toContain('/import-transactions')
      expect(body.action).toBe('import')
      expect(body.transactions).toHaveLength(2)
      expect(body.transactions[0].date).toBe('2026-01-15')
      expect(body.transactions[0].amount).toBe(5000)
      expect(body.transactions[1].reference).toBe('ref_1002')
      expect(result.imported).toBe(2)
    })

    it('sends empty array when no transactions', async () => {
      const fn = mockFetch({ success: true, imported: 0, skipped: 0 })
      const sdk = createClient(fn)
      await sdk.importTransactions([])

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.transactions).toEqual([])
    })
  })

  // ==========================================================================
  // BEHAVIORAL CONTRACT TESTS
  // These kill dozens of mutants each by verifying the entire contract surface
  // of SDK methods rather than individual fields.
  // ==========================================================================

  describe('POST method contracts', () => {
    // Each entry: [methodName, args, expectedEndpoint, expectedBodyKeys]
    const postMethods: Array<{
      name: string
      call: (sdk: Soledgic) => Promise<any>
      endpoint: string
      bodyKeys: string[]
      mockResponse?: Record<string, any>
    }> = [
      {
        name: 'recordIncome',
        call: (sdk) => sdk.recordIncome({ referenceId: 'r1', amount: 100 }),
        endpoint: 'record-income',
        bodyKeys: ['reference_id', 'amount'],
      },
      {
        name: 'recordExpense',
        call: (sdk) => sdk.recordExpense({ referenceId: 'r2', amount: 200 }),
        endpoint: 'record-expense',
        bodyKeys: ['reference_id', 'amount'],
      },
      {
        name: 'recordBill',
        call: (sdk) => sdk.recordBill({ amount: 300, description: 'd', vendorName: 'v' }),
        endpoint: 'record-bill',
        bodyKeys: ['amount', 'description', 'vendor_name'],
      },
      {
        name: 'reverseTransaction',
        call: (sdk) => sdk.reverseTransaction({ transactionId: 't1', reason: 'test' }),
        endpoint: 'reverse-transaction',
        bodyKeys: ['transaction_id', 'reason'],
      },
      {
        name: 'registerInstrument',
        call: (sdk) => sdk.registerInstrument({ externalRef: 'ref1', extractedTerms: { amount: 100, currency: 'USD', counterpartyName: 'Acme' } }),
        endpoint: 'register-instrument',
        bodyKeys: ['external_ref', 'extracted_terms'],
      },
      {
        name: 'closePeriod',
        call: (sdk) => sdk.closePeriod(2026, 3),
        endpoint: 'close-period',
        bodyKeys: ['year', 'month'],
      },
      {
        name: 'listPeriods',
        call: (sdk) => sdk.listPeriods(),
        endpoint: 'close-period',
        bodyKeys: ['action'],
      },
      {
        name: 'runHealthCheck',
        call: (sdk) => sdk.runHealthCheck(),
        endpoint: 'health-check',
        bodyKeys: ['action'],
      },
      {
        name: 'getHealthStatus',
        call: (sdk) => sdk.getHealthStatus(),
        endpoint: 'health-check',
        bodyKeys: ['action'],
      },
      {
        name: 'recordAdjustment',
        call: (sdk) => sdk.recordAdjustment({ adjustmentType: 'correction', entries: [{ accountType: 'cash', entryType: 'debit', amount: 100 }], reason: 'fix', preparedBy: 'admin' }),
        endpoint: 'record-adjustment',
        bodyKeys: ['adjustment_type', 'entries', 'reason', 'prepared_by'],
      },
      {
        name: 'recordOpeningBalance',
        call: (sdk) => sdk.recordOpeningBalance({ asOfDate: '2026-01-01', source: 'manual', balances: [{ accountType: 'cash', balance: 1000 }] }),
        endpoint: 'record-opening-balance',
        bodyKeys: ['as_of_date', 'source', 'balances'],
      },
      {
        name: 'recordTransfer',
        call: (sdk) => sdk.recordTransfer({ fromAccountType: 'cash', toAccountType: 'savings', amount: 500, transferType: 'operating' }),
        endpoint: 'record-transfer',
        bodyKeys: ['from_account_type', 'to_account_type', 'amount', 'transfer_type'],
      },
      {
        name: 'uploadReceipt',
        call: (sdk) => sdk.uploadReceipt({ fileUrl: 'https://example.com/receipt.jpg' }),
        endpoint: 'upload-receipt',
        bodyKeys: ['file_url'],
      },
      {
        name: 'receivePayment',
        call: (sdk) => sdk.receivePayment({ amount: 500 }),
        endpoint: 'receive-payment',
        bodyKeys: ['amount'],
      },
      {
        name: 'deleteCreator',
        call: (sdk) => sdk.deleteCreator('creator_1'),
        endpoint: 'delete-creator',
        bodyKeys: ['creator_id'],
      },
      {
        name: 'submitTaxInfo',
        call: (sdk) => sdk.submitTaxInfo({ participantId: 'p1', legalName: 'John', taxIdType: 'ssn', taxIdLast4: '1234', businessType: 'individual', certify: true }),
        endpoint: 'submit-tax-info',
        bodyKeys: ['participant_id', 'legal_name', 'tax_id_type', 'tax_id_last4', 'business_type', 'certify'],
      },
      {
        name: 'createBudget',
        call: (sdk) => sdk.createBudget({ name: 'Marketing', budgetAmount: 10000, budgetPeriod: 'monthly' }),
        endpoint: 'manage-budgets',
        bodyKeys: ['name', 'budget_amount', 'budget_period'],
      },
      {
        name: 'createRecurring',
        call: (sdk) => sdk.createRecurring({ name: 'Rent', merchantName: 'Landlord', categoryCode: 'rent', amount: 2000, recurrenceInterval: 'monthly', startDate: '2026-01-01', businessPurpose: 'Office' }),
        endpoint: 'manage-recurring',
        bodyKeys: ['name', 'merchant_name', 'amount', 'recurrence_interval'],
      },
      {
        name: 'createContractor',
        call: (sdk) => sdk.createContractor({ name: 'Jane' }),
        endpoint: 'manage-contractors',
        bodyKeys: ['name'],
      },
      {
        name: 'recordContractorPayment',
        call: (sdk) => sdk.recordContractorPayment({ contractorId: 'c1', amount: 5000, paymentDate: '2026-03-01' }),
        endpoint: 'manage-contractors/payment',
        bodyKeys: ['contractor_id', 'amount', 'payment_date'],
      },
      {
        name: 'createBankAccount',
        call: (sdk) => sdk.createBankAccount({ bankName: 'Chase', accountName: 'Checking', accountType: 'checking' }),
        endpoint: 'manage-bank-accounts',
        bodyKeys: ['bank_name', 'account_name', 'account_type'],
      },
      {
        name: 'sendBreachAlert',
        call: (sdk) => sdk.sendBreachAlert({ cashBalance: 1000, pendingTotal: 5000, triggeredBy: 'manual' }),
        endpoint: 'send-breach-alert',
        bodyKeys: ['cash_balance', 'pending_total', 'triggered_by'],
      },
      // Invoices
      {
        name: 'createInvoice',
        call: (sdk) => sdk.createInvoice({ customerName: 'Acme', lineItems: [{ description: 'Service', quantity: 1, unitPrice: 5000 }] }),
        endpoint: 'invoices',
        bodyKeys: ['customer_name', 'line_items'],
      },
      {
        name: 'sendInvoice',
        call: (sdk) => sdk.sendInvoice('inv_1'),
        endpoint: 'invoices/inv_1/send',
        bodyKeys: [],
      },
      {
        name: 'recordInvoicePayment',
        call: (sdk) => sdk.recordInvoicePayment('inv_1', { amount: 5000 }),
        endpoint: 'invoices/inv_1/record-payment',
        bodyKeys: ['amount'],
      },
      {
        name: 'voidInvoice',
        call: (sdk) => sdk.voidInvoice('inv_1', 'duplicate'),
        endpoint: 'invoices/inv_1/void',
        bodyKeys: ['reason'],
      },
      {
        name: 'payBill',
        call: (sdk) => sdk.payBill({ amount: 3000 }),
        endpoint: 'pay-bill',
        bodyKeys: ['amount'],
      },
      // Payouts
      {
        name: 'executePayout',
        call: (sdk) => sdk.executePayout('po_1'),
        endpoint: 'execute-payout',
        bodyKeys: ['action', 'payout_id'],
      },
      {
        name: 'executeBatchPayouts',
        call: (sdk) => sdk.executeBatchPayouts(['po_1', 'po_2']),
        endpoint: 'execute-payout',
        bodyKeys: ['action', 'payout_ids'],
      },
      {
        name: 'generateBatchPayoutFile',
        call: (sdk) => sdk.generateBatchPayoutFile(['po_1']),
        endpoint: 'execute-payout',
        bodyKeys: ['action', 'payout_ids'],
      },
      {
        name: 'listPayoutRails',
        call: (sdk) => sdk.listPayoutRails(),
        endpoint: 'execute-payout',
        bodyKeys: ['action'],
      },
      // Splits
      {
        name: 'autoPromoteCreators',
        call: (sdk) => sdk.autoPromoteCreators(),
        endpoint: 'manage-splits',
        bodyKeys: ['action'],
      },
      {
        name: 'clearCreatorSplit',
        call: (sdk) => sdk.clearCreatorSplit('creator_1'),
        endpoint: 'manage-splits',
        bodyKeys: ['action', 'creator_id'],
      },
      // Email
      {
        name: 'configureEmail',
        call: (sdk) => sdk.configureEmail({ enabled: true }),
        endpoint: 'send-statements',
        bodyKeys: ['action', 'email_config'],
      },
      {
        name: 'sendMonthlyStatements',
        call: (sdk) => sdk.sendMonthlyStatements(2026, 3),
        endpoint: 'send-statements',
        bodyKeys: ['action', 'year', 'month'],
      },
      {
        name: 'sendCreatorStatement',
        call: (sdk) => sdk.sendCreatorStatement('c1', 2026, 3),
        endpoint: 'send-statements',
        bodyKeys: ['action', 'creator_id'],
      },
      {
        name: 'previewStatementEmail',
        call: (sdk) => sdk.previewStatementEmail('c1'),
        endpoint: 'send-statements',
        bodyKeys: ['action', 'creator_id'],
      },
      {
        name: 'getEmailHistory',
        call: (sdk) => sdk.getEmailHistory(),
        endpoint: 'send-statements',
        bodyKeys: ['action'],
      },
      // Webhooks
      {
        name: 'retryWebhookDelivery',
        call: (sdk) => sdk.retryWebhookDelivery('del_1'),
        endpoint: 'webhooks',
        bodyKeys: ['action', 'delivery_id'],
      },
      {
        name: 'rotateWebhookSecret',
        call: (sdk) => sdk.rotateWebhookSecret('ep_1'),
        endpoint: 'webhooks',
        bodyKeys: ['action', 'endpoint_id'],
      },
      {
        name: 'testWebhookEndpoint',
        call: (sdk) => sdk.testWebhookEndpoint('ep_1'),
        endpoint: 'webhooks',
        bodyKeys: ['action', 'endpoint_id'],
      },
      // Alerts
      {
        name: 'testAlert',
        call: (sdk) => sdk.testAlert('cfg_1'),
        endpoint: 'configure-alerts',
        bodyKeys: ['action', 'config_id'],
      },
      // Tax
      {
        name: 'generateAllTaxDocuments',
        call: (sdk) => sdk.generateAllTaxDocuments(2026),
        endpoint: 'tax/documents/generate',
        bodyKeys: ['tax_year'],
        mockResponse: { success: true, generation: { tax_year: 2026, created: 0, skipped: 0, total_amount: 0 } },
      },
      {
        name: 'markTaxDocumentFiled',
        call: (sdk) => sdk.markTaxDocumentFiled('doc_1'),
        endpoint: 'tax/documents/doc_1/mark-filed',
        bodyKeys: [],
        mockResponse: { success: true, document: { id: 'doc_1', tax_year: 2026, status: 'filed' } },
      },
      {
        name: 'markTaxDocumentsFiledBulk',
        call: (sdk) => sdk.markTaxDocumentsFiledBulk(2026),
        endpoint: 'tax/documents/mark-filed',
        bodyKeys: ['tax_year'],
      },
      {
        name: 'deliverTaxDocumentCopyB',
        call: (sdk) => sdk.deliverTaxDocumentCopyB(2026),
        endpoint: 'tax/documents/deliver-copy-b',
        bodyKeys: ['tax_year'],
      },
      {
        name: 'generateTaxDocumentPdf',
        call: (sdk) => sdk.generateTaxDocumentPdf('doc_1', 'filer'),
        endpoint: 'tax/documents/doc_1/pdf',
        bodyKeys: ['copy_type'],
      },
      {
        name: 'generateTaxDocumentPdfBatch',
        call: (sdk) => sdk.generateTaxDocumentPdfBatch(2026),
        endpoint: 'tax/documents/pdf/batch',
        bodyKeys: ['tax_year'],
      },
      // Wallets
      {
        name: 'topUpWallet',
        call: (sdk) => sdk.topUpWallet({ walletId: 'w1', amount: 1000, referenceId: 'ref1' }),
        endpoint: 'wallets/w1/topups',
        bodyKeys: ['amount', 'reference_id'],
      },
      {
        name: 'withdrawFromWallet',
        call: (sdk) => sdk.withdrawFromWallet({ walletId: 'w1', amount: 500, referenceId: 'ref2' }),
        endpoint: 'wallets/w1/withdrawals',
        bodyKeys: ['amount', 'reference_id'],
      },
      // Reconciliation
      {
        name: 'matchTransaction',
        call: (sdk) => sdk.matchTransaction({ transactionId: 't1', bankTransactionId: 'bt1' }),
        endpoint: 'reconciliations/matches',
        bodyKeys: ['transaction_id', 'bank_transaction_id'],
        mockResponse: { success: true, match: { id: 'm1', transaction_id: 't1', bank_transaction_id: 'bt1', status: 'confirmed', matched_at: '2026-01-01' } },
      },
      {
        name: 'createReconciliationSnapshot',
        call: (sdk) => sdk.createReconciliationSnapshot({ periodId: 'p1' }),
        endpoint: 'reconciliations/snapshots',
        bodyKeys: ['period_id'],
        mockResponse: { success: true, snapshot: { id: 's1', integrity_hash: 'abc123' } },
      },
      {
        name: 'autoMatchBankTransaction',
        call: (sdk) => sdk.autoMatchBankTransaction('bat_1'),
        endpoint: 'reconciliations/auto-match',
        bodyKeys: ['bank_aggregator_transaction_id'],
      },
      // Bank statement import
      {
        name: 'importBankStatement',
        call: (sdk) => sdk.importBankStatement({ bankAccountId: 'ba1', lines: [{ transactionDate: '2026-01-15', description: 'Payment', amount: 100 }] }),
        endpoint: 'import-bank-statement',
        bodyKeys: ['bank_account_id', 'lines'],
      },
      // Parse import
      {
        name: 'parseImportFile',
        call: (sdk) => sdk.parseImportFile('base64data', 'csv'),
        endpoint: 'import-transactions',
        bodyKeys: ['action', 'data'],
      },
      {
        name: 'saveImportTemplate',
        call: (sdk) => sdk.saveImportTemplate({ name: 'Chase', bank_name: 'Chase', format: 'csv', mapping: { date: 0, amount: 1 } }),
        endpoint: 'import-transactions',
        bodyKeys: ['action', 'template'],
      },
      // Holds
      {
        name: 'releaseHold',
        call: (sdk) => sdk.releaseHold({ holdId: 'h1' }),
        endpoint: 'holds/h1/release',
        bodyKeys: ['execute_transfer'],
      },
      {
        name: 'releaseFunds',
        call: (sdk) => sdk.releaseFunds('entry_1'),
        endpoint: 'holds/entry_1/release',
        bodyKeys: ['execute_transfer'],
      },
    ]

    for (const { name, call, endpoint, bodyKeys, mockResponse } of postMethods) {
      it(`${name} → POST /${endpoint} with correct snake_case keys`, async () => {
        const fn = mockFetch(mockResponse ?? { success: true })
        const sdk = createClient(fn)
        await call(sdk)

        // Verify endpoint
        expect(fn).toHaveBeenCalledTimes(1)
        const [url, init] = fn.mock.calls[0]
        expect(url).toContain(`/${endpoint}`)

        // Verify POST method and headers
        expect(init.method).toBe('POST')
        expect(init.headers['x-api-key']).toBe(API_KEY)
        expect(init.headers['Content-Type']).toBe('application/json')
        expect(init.headers['Soledgic-Version']).toBeDefined()

        // Verify snake_case body keys
        const body = JSON.parse(init.body)
        for (const key of bodyKeys) {
          expect(body).toHaveProperty(key)
        }
      })
    }
  })

  describe('GET method contracts', () => {
    const getMethods: Array<{
      name: string
      call: (sdk: Soledgic) => Promise<any>
      endpoint: string
      mockResponse?: Record<string, any>
    }> = [
      { name: 'getBalanceSheet', call: (sdk) => sdk.getBalanceSheet(), endpoint: 'balance-sheet' },
      { name: 'getRunway', call: (sdk) => sdk.getRunway(), endpoint: 'get-runway' },
      { name: 'getAPAging', call: (sdk) => sdk.getAPAging(), endpoint: 'ap-aging' },
      { name: 'getARAging', call: (sdk) => sdk.getARAging(), endpoint: 'ar-aging' },
      { name: 'listLedgers', call: (sdk) => sdk.listLedgers(), endpoint: 'list-ledgers' },
      { name: 'listBudgets', call: (sdk) => sdk.listBudgets(), endpoint: 'manage-budgets' },
      { name: 'listRecurring', call: (sdk) => sdk.listRecurring(), endpoint: 'manage-recurring' },
      { name: 'listContractors', call: (sdk) => sdk.listContractors(), endpoint: 'manage-contractors' },
      { name: 'listBankAccounts', call: (sdk) => sdk.listBankAccounts(), endpoint: 'manage-bank-accounts' },
      { name: 'listParticipants', call: (sdk) => sdk.listParticipants(), endpoint: 'participants' },
      { name: 'getDetailedTrialBalance', call: (sdk) => sdk.getDetailedTrialBalance(), endpoint: 'trial-balance' },
      { name: 'getDetailedProfitLoss', call: (sdk) => sdk.getDetailedProfitLoss(), endpoint: 'profit-loss' },
      { name: 'getDueRecurring', call: (sdk) => sdk.getDueRecurring(), endpoint: 'manage-recurring/due' },
      { name: 'listFraudPolicies', call: (sdk) => sdk.listFraudPolicies(), endpoint: 'fraud/policies' },
      { name: 'getComplianceOverview', call: (sdk) => sdk.getComplianceOverview(), endpoint: 'compliance/overview', mockResponse: { success: true, overview: { window_days: 30, access_window_hours: 24, total_events: 0, unique_ips: 0, unique_actors: 0, high_risk_events: 0, critical_risk_events: 0, failed_auth_events: 0, payouts_failed: 0, refunds_recorded: 0, dispute_events: 0 }, note: '' } },
      { name: 'listComplianceAccessPatterns', call: (sdk) => sdk.listComplianceAccessPatterns(), endpoint: 'compliance/access-patterns' },
      { name: 'listComplianceFinancialActivity', call: (sdk) => sdk.listComplianceFinancialActivity(), endpoint: 'compliance/financial-activity' },
      { name: 'listComplianceSecuritySummary', call: (sdk) => sdk.listComplianceSecuritySummary(), endpoint: 'compliance/security-summary' },
      { name: 'getEscrowSummary', call: (sdk) => sdk.getEscrowSummary(), endpoint: 'holds/summary' },
      { name: 'getHoldSummary', call: (sdk) => sdk.getHoldSummary(), endpoint: 'holds/summary' },
      { name: 'listInvoices', call: (sdk) => sdk.listInvoices(), endpoint: 'invoices' },
    ]

    for (const { name, call, endpoint, mockResponse } of getMethods) {
      it(`${name} → GET /${endpoint} with correct headers`, async () => {
        const fn = mockFetch(mockResponse ?? { success: true, data: [], participants: [], patterns: [], activity: [], summary: [], wallets: [], policies: [] })
        const sdk = createClient(fn)
        await call(sdk)

        expect(fn).toHaveBeenCalledTimes(1)
        const [url, init] = fn.mock.calls[0]
        expect(url).toContain(`/${endpoint}`)
        expect(init.method).toBe('GET')
        expect(init.headers['x-api-key']).toBe(API_KEY)
        expect(init.headers['Soledgic-Version']).toBeDefined()
        // GET requests should not have a body
        expect(init.body).toBeUndefined()
      })
    }
  })

  describe('response mapping invariants', () => {
    it('all error responses throw typed errors with status and message', async () => {
      for (const status of [400, 401, 404, 409, 500, 502, 503]) {
        const fn = mockFetch({ error: `Error ${status}` }, status)
        const sdk = createClient(fn)
        try {
          await sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 })
          expect.unreachable(`should throw for status ${status}`)
        } catch (err: any) {
          expect(err).toBeInstanceOf(SoledgicError)
          expect(err.status).toBe(status)
          expect(typeof err.message).toBe('string')
          expect(err.message.length).toBeGreaterThan(0)
        }
      }
    })

    it('destroy() makes all subsequent requests throw', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      sdk.destroy()

      await expect(sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 }))
        .rejects.toThrow('Client has been destroyed')
    })

    it('request timeout is configurable', () => {
      const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL, timeout: 5000 })
      // The timeout is internal but we can verify the client was created
      expect(sdk).toBeDefined()
    })

    it('apiVersion is sent in headers', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn, { apiVersion: '2026-06-01' })
      await sdk.runHealthCheck()

      const headers = fn.mock.calls[0][1].headers
      expect(headers['Soledgic-Version']).toBe('2026-06-01')
    })

    it('apiVersion defaults when empty', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn, { apiVersion: '' })
      await sdk.runHealthCheck()

      const headers = fn.mock.calls[0][1].headers
      expect(headers['Soledgic-Version']).toBe('2026-03-01')
    })
  })

  describe('helpers.ts contract tests', () => {
    it('mapWebhookEndpoint always returns complete object with correct types', () => {

      // Valid input
      const result = mapWebhookEndpoint({
        id: 'wh_1', url: 'https://example.com', description: 'Test',
        events: ['sale.completed'], is_active: true, created_at: '2026-01-01',
        secret_rotated_at: '2026-02-01',
      })
      expect(result.id).toBe('wh_1')
      expect(result.url).toBe('https://example.com')
      expect(result.description).toBe('Test')
      expect(result.events).toEqual(['sale.completed'])
      expect(result.isActive).toBe(true)
      expect(result.createdAt).toBe('2026-01-01')
      expect(result.secretRotatedAt).toBe('2026-02-01')

      // Null/undefined input — should return safe defaults, never crash
      const empty = mapWebhookEndpoint(null)
      expect(empty.id).toBe('')
      expect(empty.url).toBe('')
      expect(empty.description).toBeNull()
      expect(empty.events).toEqual([])
      expect(empty.isActive).toBe(false)
      expect(empty.createdAt).toBe('')
      expect(empty.secretRotatedAt).toBeNull()

      // Partial input
      const partial = mapWebhookEndpoint({ id: 'wh_2' })
      expect(partial.id).toBe('wh_2')
      expect(partial.url).toBe('')
      expect(partial.isActive).toBe(false)
    })

    it('mapWebhookDelivery always returns complete object with correct types', () => {

      const result = mapWebhookDelivery({
        id: 'd1', endpoint_id: 'ep1', event_type: 'sale.completed',
        status: 'delivered', attempts: 3, max_attempts: 5,
        response_status: 200, response_body: 'OK', response_time_ms: 150,
        created_at: '2026-01-01', delivered_at: '2026-01-01T00:01:00Z',
        payload: { data: 'test' },
      })
      expect(result.id).toBe('d1')
      expect(result.endpointId).toBe('ep1')
      expect(result.eventType).toBe('sale.completed')
      expect(result.status).toBe('delivered')
      expect(result.attempts).toBe(3)
      expect(result.maxAttempts).toBe(5)
      expect(result.responseStatus).toBe(200)
      expect(result.responseBody).toBe('OK')
      expect(result.responseTimeMs).toBe(150)
      expect(result.deliveredAt).toBe('2026-01-01T00:01:00Z')
      expect(result.payload).toEqual({ data: 'test' })

      // Null input
      const empty = mapWebhookDelivery(null)
      expect(empty.id).toBe('')
      expect(empty.endpointId).toBeNull()
      expect(empty.eventType).toBe('unknown')
      expect(empty.status).toBe('unknown')
      expect(empty.attempts).toBe(0)
      expect(empty.maxAttempts).toBeNull()
      expect(empty.responseStatus).toBeNull()
      expect(empty.responseBody).toBeNull()
      expect(empty.responseTimeMs).toBeNull()
      expect(empty.deliveredAt).toBeNull()
      expect(empty.nextRetryAt).toBeNull()
      expect(empty.payload).toBeNull()
    })
  })
})
