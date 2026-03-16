import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Soledgic, SoledgicError, ValidationError, AuthenticationError, NotFoundError, ConflictError, mapWebhookEndpoint, mapWebhookDelivery, timingSafeEqual, webhookPayloadToString, isArrayBufferView, parseWebhookSignatureHeader, parseWebhookEvent, hmacHex, verifyWebhookSignature, resolveWebhookEndpointUrl } from './index'

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

    it('reverseTransaction maps all snake_case fields to camelCase', async () => {
      const fn = mockFetch({
        success: true, void_type: 'full', message: 'Reversed',
        transaction_id: 'tx_1', reversal_id: 'rev_1', reversed_amount: 5000,
        is_partial: false, voided_at: '2026-01-01', reversed_at: '2026-01-02',
        warning: 'balance low',
      })
      const sdk = createClient(fn)
      const result = await sdk.reverseTransaction({ transactionId: 'tx_1', reason: 'test' })

      expect(result.success).toBe(true)
      expect(result.voidType).toBe('full')
      expect(result.message).toBe('Reversed')
      expect(result.transactionId).toBe('tx_1')
      expect(result.reversalId).toBe('rev_1')
      expect(result.reversedAmount).toBe(5000)
      expect(result.isPartial).toBe(false)
      expect(result.voidedAt).toBe('2026-01-01')
      expect(result.reversedAt).toBe('2026-01-02')
      expect(result.warning).toBe('balance low')
    })

    it('reverseTransaction returns null for missing optional fields', async () => {
      const fn = mockFetch({ success: true, void_type: 'void', message: 'Done' })
      const sdk = createClient(fn)
      const result = await sdk.reverseTransaction({ transactionId: 'tx_2', reason: 'err' })

      expect(result.reversalId).toBeNull()
      expect(result.reversedAmount).toBeNull()
      expect(result.isPartial).toBeNull()
      expect(result.voidedAt).toBeNull()
      expect(result.reversedAt).toBeNull()
      expect(result.warning).toBeNull()
    })

    it('projectIntent maps all response fields', async () => {
      const fn = mockFetch({
        success: true, instrument_id: 'inst_1', external_ref: 'ref_1',
        cadence: 'monthly', projections_created: 6, projections_requested: 12,
        duplicates_skipped: 0, date_range: { from: '2026-01', to: '2026-06' },
        projected_dates: ['2026-01-15', '2026-02-15'],
      })
      const sdk = createClient(fn)
      const result = await sdk.projectIntent({ authorizingInstrumentId: 'inst_1', untilDate: '2026-12-31' })

      expect(result.instrumentId).toBe('inst_1')
      expect(result.externalRef).toBe('ref_1')
      expect(result.cadence).toBe('monthly')
      expect(result.projectionsCreated).toBe(6)
      expect(result.projectionsRequested).toBe(12)
      expect(result.duplicatesSkipped).toBe(0)
      expect(result.dateRange.from).toBe('2026-01')
      expect(result.projectedDates).toHaveLength(2)
    })

    it('releaseFunds maps nested release object', async () => {
      const fn = mockFetch({
        success: true,
        release: { id: 'rel_1', hold_id: 'h_1', executed: true, transfer_id: 'tr_1', transfer_status: 'completed', amount: 5000, currency: 'USD' },
      })
      const sdk = createClient(fn)
      const result = await sdk.releaseFunds('entry_1')

      expect(result.success).toBe(true)
      expect(result.release_id).toBe('rel_1')
      expect(result.entry_id).toBe('h_1')
      expect(result.executed).toBe(true)
      expect(result.transfer_id).toBe('tr_1')
      expect(result.transfer_status).toBe('completed')
      expect(result.amount).toBe(5000)
      expect(result.currency).toBe('USD')
    })

    it('releaseFunds returns nulls when release is empty', async () => {
      const fn = mockFetch({ success: true, release: {} })
      const sdk = createClient(fn)
      const result = await sdk.releaseFunds('entry_2', false)

      expect(result.release_id).toBeNull()
      expect(result.executed).toBe(false)
      expect(result.transfer_id).toBeNull()
      expect(result.amount).toBeNull()
    })

    it('checkPayoutEligibility maps eligibility fields', async () => {
      const fn = mockFetch({
        success: true,
        eligibility: { participant_id: 'p_1', eligible: true, available_balance: 10000, issues: [], requirements: {} },
      })
      const sdk = createClient(fn)
      const result = await sdk.checkPayoutEligibility('p_1')

      expect(result.creator_id).toBe('p_1')
      expect(result.eligible).toBe(true)
      expect(result.available_balance).toBe(10000)
      expect(result.issues).toEqual([])
    })

    it('checkPayoutEligibility defaults when eligibility is null', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.checkPayoutEligibility('p_2')

      expect(result.creator_id).toBe('p_2') // falls back to input
      expect(result.eligible).toBe(false)
      expect(result.available_balance).toBe(0)
      expect(result.issues).toEqual([])
    })

    it('createCheckoutSession maps checkout response fields', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_1', mode: 'direct', checkout_url: null,
          payment_id: 'pay_1', status: 'completed',
          requires_action: false, amount: 5000, currency: 'USD',
          expires_at: null,
          breakdown: { gross_amount: 5000, creator_amount: 4000, platform_amount: 1000, creator_percent: 80 },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        participantId: 'p1', amount: 5000, paymentMethodId: 'pm_1', idempotencyKey: 'ik_1',
      })

      expect(result.checkoutSession.id).toBe('cs_1')
      expect(result.checkoutSession.mode).toBe('direct')
      expect(result.checkoutSession.paymentId).toBe('pay_1')
      expect(result.checkoutSession.requiresAction).toBe(false)
      expect(result.checkoutSession.breakdown?.grossAmount).toBe(5000)
      expect(result.checkoutSession.breakdown?.creatorAmount).toBe(4000)
      expect(result.checkoutSession.breakdown?.platformAmount).toBe(1000)
      expect(result.checkoutSession.breakdown?.creatorPercent).toBe(80)
    })

    it('createPayout maps payout response fields', async () => {
      const fn = mockFetch({
        success: true,
        payout: { id: 'po_1', transaction_id: 'tx_1', gross_amount: 10000, fees: 250, net_amount: 9750, previous_balance: 15000, new_balance: 5250 },
      })
      const sdk = createClient(fn)
      const result = await sdk.createPayout({ participantId: 'p1', amount: 10000, referenceId: 'ref1' })

      expect(result.payout.id).toBe('po_1')
      expect(result.payout.transactionId).toBe('tx_1')
      expect(result.payout.grossAmount).toBe(10000)
      expect(result.payout.fees).toBe(250)
      expect(result.payout.netAmount).toBe(9750)
      expect(result.payout.previousBalance).toBe(15000)
      expect(result.payout.newBalance).toBe(5250)
    })

    it('createRefund maps refund with breakdown', async () => {
      const fn = mockFetch({
        success: true,
        refund: {
          id: 'rf_1', transaction_id: 'tx_1', reference_id: 'ref_1',
          sale_reference: 'sale_1', refunded_amount: 3000, currency: 'USD',
          status: 'completed', is_full_refund: true, repair_pending: false,
          breakdown: { from_creator: 2400, from_platform: 600 },
        },
        warning: 'partial reversal applied', warning_code: 'partial_reversal',
      })
      const sdk = createClient(fn)
      const result = await sdk.createRefund({ saleReference: 'sale_1', reason: 'defective' })

      expect(result.refund.id).toBe('rf_1')
      expect(result.refund.transactionId).toBe('tx_1')
      expect(result.refund.refundedAmount).toBe(3000)
      expect(result.refund.isFullRefund).toBe(true)
      expect(result.refund.breakdown?.fromCreator).toBe(2400)
      expect(result.refund.breakdown?.fromPlatform).toBe(600)
      expect(result.warning).toBe('partial reversal applied')
      expect(result.warningCode).toBe('partial_reversal')
    })

    it('evaluateFraud maps risk evaluation response', async () => {
      const fn = mockFetch({
        success: true, cached: false,
        evaluation: {
          id: 'eval_1', signal: 'elevated_risk',
          risk_factors: [{ policy_id: 'pol_1', policy_type: 'budget_cap', severity: 'soft', indicator: 'over_budget' }],
          valid_until: '2026-01-02', created_at: '2026-01-01', acknowledged_at: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.evaluateFraud({ idempotencyKey: 'ik_1', amount: 5000 })

      expect(result.evaluation.id).toBe('eval_1')
      expect(result.evaluation.signal).toBe('elevated_risk')
      expect(result.evaluation.riskFactors).toHaveLength(1)
      expect(result.evaluation.riskFactors[0].policyId).toBe('pol_1')
      expect(result.evaluation.riskFactors[0].policyType).toBe('budget_cap')
      expect(result.evaluation.riskFactors[0].indicator).toBe('over_budget')
      expect(result.evaluation.validUntil).toBe('2026-01-02')
      expect(result.evaluation.acknowledgedAt).toBeNull()
    })

    it('preflightAuthorization maps decision response', async () => {
      const fn = mockFetch({
        success: true, cached: true, message: 'cached',
        decision: {
          id: 'dec_1', decision: 'allowed',
          violated_policies: [{ policy_id: 'p1', policy_type: 'budget_cap', severity: 'soft', reason: 'limit' }],
          expires_at: '2026-02-01', created_at: '2026-01-01',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.preflightAuthorization({ idempotencyKey: 'ik', amount: 100 })

      expect(result.cached).toBe(true)
      expect(result.decision.id).toBe('dec_1')
      expect(result.decision.decision).toBe('allowed')
      expect(result.decision.violatedPolicies).toHaveLength(1)
      expect(result.decision.violatedPolicies[0].policyId).toBe('p1')
      expect(result.decision.violatedPolicies[0].severity).toBe('soft')
      expect(result.decision.expiresAt).toBe('2026-02-01')
    })

    it('generateTaxSummary maps nested summaries and totals', async () => {
      const fn = mockFetch({
        success: true, tax_year: 2026, note: 'test',
        summaries: [{
          participant_id: 'p1', linked_user_id: 'u1', gross_earnings: 50000,
          refunds_issued: 1000, net_earnings: 49000, total_paid_out: 45000,
          requires_1099: true, shared_tax_profile: { status: 'active', legal_name: 'John', tax_id_last4: '1234' },
        }],
        totals: { total_gross: 50000, total_refunds: 1000, total_net: 49000, total_paid: 45000, participants_requiring_1099: 1 },
      })
      const sdk = createClient(fn)
      const result = await sdk.generateTaxSummary(2026)

      expect(result.taxYear).toBe(2026)
      expect(result.summaries).toHaveLength(1)
      expect(result.summaries[0].participantId).toBe('p1')
      expect(result.summaries[0].grossEarnings).toBe(50000)
      expect(result.summaries[0].requires1099).toBe(true)
      expect(result.summaries[0].sharedTaxProfile?.legalName).toBe('John')
      expect(result.totals.totalGross).toBe(50000)
      expect(result.totals.participantsRequiring1099).toBe(1)
    })

    it('createCreator maps nested participant with tax_info', async () => {
      const fn = mockFetch({
        success: true,
        participant: { id: 'c1', account_id: 'acct_1', display_name: 'Jane', email: 'j@test.com', default_split_percent: 80, payout_preferences: { schedule: 'weekly' }, created_at: '2026-01-01' },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCreator({ creatorId: 'c1' })

      expect(result.creator.id).toBe('c1')
      expect(result.creator.accountId).toBe('acct_1')
      expect(result.creator.displayName).toBe('Jane')
      expect(result.creator.email).toBe('j@test.com')
      expect(result.creator.defaultSplitPercent).toBe(80)
      expect(result.creator.payoutPreferences).toEqual({ schedule: 'weekly' })
      expect(result.creator.createdAt).toBe('2026-01-01')

      // Verify tax_info snake_case mapping in request body
      const fn2 = mockFetch({ success: true, participant: {} })
      const sdk2 = createClient(fn2)
      await sdk2.createCreator({
        creatorId: 'c2',
        taxInfo: { taxIdType: 'ein', taxIdLast4: '5678', legalName: 'Corp', businessType: 'llc', address: { line1: '123 St', city: 'NY', state: 'NY', postalCode: '10001', country: 'US' } },
        payoutPreferences: { schedule: 'monthly', minimumAmount: 5000, method: 'card' },
      })
      const body = JSON.parse(fn2.mock.calls[0][1].body)
      expect(body.tax_info.tax_id_type).toBe('ein')
      expect(body.tax_info.tax_id_last4).toBe('5678')
      expect(body.tax_info.legal_name).toBe('Corp')
      expect(body.tax_info.address.postal_code).toBe('10001')
      expect(body.payout_preferences.minimum_amount).toBe(5000)
    })

    it('listParticipants maps array of participants', async () => {
      const fn = mockFetch({
        success: true,
        participants: [
          { id: 'p1', linked_user_id: 'u1', name: 'Alice', tier: 'gold', ledger_balance: 10000, held_amount: 500, available_balance: 9500 },
          { id: 'p2', linked_user_id: null, name: null, tier: null, ledger_balance: 0, held_amount: 0, available_balance: 0 },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listParticipants()

      expect(result.participants).toHaveLength(2)
      expect(result.participants[0].id).toBe('p1')
      expect(result.participants[0].linkedUserId).toBe('u1')
      expect(result.participants[0].name).toBe('Alice')
      expect(result.participants[0].tier).toBe('gold')
      expect(result.participants[0].ledgerBalance).toBe(10000)
      expect(result.participants[0].heldAmount).toBe(500)
      expect(result.participants[0].availableBalance).toBe(9500)
      expect(result.participants[1].linkedUserId).toBeNull()
      expect(result.participants[1].name).toBeNull()
    })

    it('getParticipant maps detail with holds array', async () => {
      const fn = mockFetch({
        success: true,
        participant: {
          id: 'p1', linked_user_id: 'u1', name: 'Bob', tier: 'silver',
          custom_split_percent: 75, ledger_balance: 8000, held_amount: 1000, available_balance: 7000,
          holds: [{ amount: 500, reason: 'tax', release_date: '2026-03-01', status: 'held' }],
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getParticipant('p1')

      expect(result.participant.id).toBe('p1')
      expect(result.participant.customSplitPercent).toBe(75)
      expect(result.participant.holds).toHaveLength(1)
      expect(result.participant.holds[0].amount).toBe(500)
      expect(result.participant.holds[0].reason).toBe('tax')
      expect(result.participant.holds[0].releaseDate).toBe('2026-03-01')
      expect(result.participant.holds[0].status).toBe('held')
    })

    it('createLedger maps response with nested settings', async () => {
      const fn = mockFetch({
        success: true, warning: 'trial mode',
        ledger: { id: 'l1', business_name: 'Acme', ledger_mode: 'platform', api_key: 'sk_test', status: 'active', created_at: '2026-01-01' },
      })
      const sdk = createClient(fn)
      const result = await sdk.createLedger({ businessName: 'Acme', ownerEmail: 'a@test.com' })

      expect(result.ledger.id).toBe('l1')
      expect(result.ledger.businessName).toBe('Acme')
      expect(result.ledger.ledgerMode).toBe('platform')
      expect(result.ledger.apiKey).toBe('sk_test')
      expect(result.warning).toBe('trial mode')
    })

    it('getParticipantPayoutEligibility maps eligibility with issues', async () => {
      const fn = mockFetch({
        success: true,
        eligibility: { participant_id: 'p1', eligible: false, available_balance: 0, issues: ['no_bank_account', 'below_minimum'], requirements: { min_payout: 1000 } },
      })
      const sdk = createClient(fn)
      const result = await sdk.getParticipantPayoutEligibility('p1')

      expect(result.eligibility.participantId).toBe('p1')
      expect(result.eligibility.eligible).toBe(false)
      expect(result.eligibility.issues).toEqual(['no_bank_account', 'below_minimum'])
      expect(result.eligibility.requirements).toEqual({ min_payout: 1000 })
    })

    it('calculateTaxForParticipant maps tax calculation', async () => {
      const fn = mockFetch({
        success: true,
        calculation: {
          participant_id: 'p1', tax_year: 2026, gross_payments: 75000,
          transaction_count: 150, requires_1099: true, monthly_totals: { '2026-01': 6000 },
          threshold: 600, linked_user_id: 'u1',
          shared_tax_profile: { status: 'active', legal_name: 'Jane Doe', tax_id_last4: '4321' },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.calculateTaxForParticipant('p1', 2026)

      expect(result.calculation.participantId).toBe('p1')
      expect(result.calculation.taxYear).toBe(2026)
      expect(result.calculation.grossPayments).toBe(75000)
      expect(result.calculation.transactionCount).toBe(150)
      expect(result.calculation.requires1099).toBe(true)
      expect(result.calculation.threshold).toBe(600)
      expect(result.calculation.linkedUserId).toBe('u1')
      expect(result.calculation.sharedTaxProfile?.legalName).toBe('Jane Doe')
      expect(result.calculation.sharedTaxProfile?.taxIdLast4).toBe('4321')
    })

    it('listRefunds maps refund array with breakdown', async () => {
      const fn = mockFetch({
        success: true, count: 1,
        refunds: [{
          id: 'r1', transaction_id: 'tx1', reference_id: 'ref1', sale_reference: 'sale1',
          refunded_amount: 2000, currency: 'USD', status: 'completed', reason: 'defective',
          refund_from: 'both', external_refund_id: null, created_at: '2026-01-15',
          breakdown: { from_creator: 1600, from_platform: 400 }, repair_pending: false, last_error: null,
        }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listRefunds({ saleReference: 'sale1' })

      expect(result.count).toBe(1)
      expect(result.refunds).toHaveLength(1)
      expect(result.refunds[0].id).toBe('r1')
      expect(result.refunds[0].transactionId).toBe('tx1')
      expect(result.refunds[0].refundedAmount).toBe(2000)
      expect(result.refunds[0].reason).toBe('defective')
      expect(result.refunds[0].refundFrom).toBe('both')
      expect(result.refunds[0].breakdown?.fromCreator).toBe(1600)
      expect(result.refunds[0].breakdown?.fromPlatform).toBe(400)
      expect(result.refunds[0].repairPending).toBe(false)
    })

    it('listAlerts maps alert configurations', async () => {
      const fn = mockFetch({
        success: true,
        data: [{
          id: 'a1', alert_type: 'breach_risk', channel: 'slack',
          config: { webhook_url: 'https://hooks.slack.com/xxx' },
          thresholds: { coverage_ratio_below: 0.5, shortfall_above: 1000 },
          is_active: true, last_triggered_at: '2026-01-01', trigger_count: 5, created_at: '2025-12-01',
        }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listAlerts()

      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('a1')
      expect(result.data[0].alertType).toBe('breach_risk')
      expect(result.data[0].channel).toBe('slack')
      expect(result.data[0].thresholds.coverageRatioBelow).toBe(0.5)
      expect(result.data[0].thresholds.shortfallAbove).toBe(1000)
      expect(result.data[0].isActive).toBe(true)
      expect(result.data[0].triggerCount).toBe(5)
    })

    it('createFraudPolicy maps policy response', async () => {
      const fn = mockFetch({
        success: true,
        policy: { id: 'fp1', type: 'budget_cap', severity: 'hard', priority: 10, is_active: true, config: { limit: 50000 }, created_at: '2026-01-01', updated_at: null },
      })
      const sdk = createClient(fn)
      const result = await sdk.createFraudPolicy({ policyType: 'budget_cap', config: { limit: 50000 } })

      expect(result.policy.id).toBe('fp1')
      expect(result.policy.type).toBe('budget_cap')
      expect(result.policy.severity).toBe('hard')
      expect(result.policy.priority).toBe(10)
      expect(result.policy.isActive).toBe(true)
      expect(result.policy.config).toEqual({ limit: 50000 })
    })

    it('listComplianceAccessPatterns maps pattern entries', async () => {
      const fn = mockFetch({
        success: true, window_hours: 24, count: 1,
        patterns: [{ ip_address: '1.2.3.4', hour: '2026-01-15T14:00:00Z', request_count: 50, unique_actions: 3, actions: ['read', 'write', 'delete'], max_risk_score: 45, failed_auths: 2 }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceAccessPatterns()

      expect(result.windowHours).toBe(24)
      expect(result.patterns[0].ipAddress).toBe('1.2.3.4')
      expect(result.patterns[0].requestCount).toBe(50)
      expect(result.patterns[0].uniqueActions).toBe(3)
      expect(result.patterns[0].maxRiskScore).toBe(45)
      expect(result.patterns[0].failedAuths).toBe(2)
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

  // ==========================================================================
  // DEEP COVERAGE FOR 90% MUTATION SCORE
  // Every field assertion kills a mutant that removes or swaps that mapping line.
  // ==========================================================================

  describe('deep coverage for 90% mutation score', () => {

    // --- WALLET: mapWalletObject exhaustive field coverage ---

    it('mapWalletObject maps every field including null/false fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        wallet: {
          id: 'w_full',
          wallet_type: 'creator_earnings',
          scope_type: 'participant',
          owner_id: 'own_1',
          owner_type: 'participant',
          participant_id: 'part_1',
          account_type: 'creator_balance',
          name: 'Earnings Wallet',
          currency: 'EUR',
          status: 'active',
          balance: 9999,
          held_amount: 100,
          available_balance: 9899,
          redeemable: true,
          transferable: true,
          topup_supported: true,
          payout_supported: true,
          created_at: '2026-03-10T00:00:00Z',
          metadata: { custom: 'val' },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getWallet('w_full')

      expect(result.success).toBe(true)
      expect(result.wallet.id).toBe('w_full')
      expect(result.wallet.object).toBe('wallet')
      expect(result.wallet.walletType).toBe('creator_earnings')
      expect(result.wallet.scopeType).toBe('participant')
      expect(result.wallet.ownerId).toBe('own_1')
      expect(result.wallet.ownerType).toBe('participant')
      expect(result.wallet.participantId).toBe('part_1')
      expect(result.wallet.accountType).toBe('creator_balance')
      expect(result.wallet.name).toBe('Earnings Wallet')
      expect(result.wallet.currency).toBe('EUR')
      expect(result.wallet.status).toBe('active')
      expect(result.wallet.balance).toBe(9999)
      expect(result.wallet.heldAmount).toBe(100)
      expect(result.wallet.availableBalance).toBe(9899)
      expect(result.wallet.redeemable).toBe(true)
      expect(result.wallet.transferable).toBe(true)
      expect(result.wallet.topupSupported).toBe(true)
      expect(result.wallet.payoutSupported).toBe(true)
      expect(result.wallet.createdAt).toBe('2026-03-10T00:00:00Z')
      expect(result.wallet.metadata).toEqual({ custom: 'val' })
    })

    it('mapWalletObject null/undefined fallback paths', async () => {
      const fn = mockFetch({
        success: true,
        wallet: {
          id: 'w_sparse',
          wallet_type: 'consumer_credit',
          scope_type: 'customer',
          // owner_id, owner_type, participant_id, name, created_at all missing
          account_type: 'user_wallet',
          currency: 'USD',
          status: 'active',
          balance: 500,
          // held_amount missing -> 0
          // available_balance missing -> falls back to balance
          redeemable: false,
          transferable: false,
          topup_supported: false,
          payout_supported: false,
          // metadata missing -> {}
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getWallet('w_sparse')

      expect(result.wallet.ownerId).toBeNull()
      expect(result.wallet.ownerType).toBeNull()
      expect(result.wallet.participantId).toBeNull()
      expect(result.wallet.name).toBeNull()
      expect(result.wallet.heldAmount).toBe(0)
      expect(result.wallet.availableBalance).toBe(500) // falls back to balance
      expect(result.wallet.redeemable).toBe(false)
      expect(result.wallet.transferable).toBe(false)
      expect(result.wallet.topupSupported).toBe(false)
      expect(result.wallet.payoutSupported).toBe(false)
      expect(result.wallet.createdAt).toBeNull()
      expect(result.wallet.metadata).toEqual({})
    })

    it('listWallets maps array through mapWalletObject and returns pagination', async () => {
      const fn = mockFetch({
        success: true,
        wallets: [
          { id: 'w1', wallet_type: 'a', scope_type: 'b', account_type: 'c', currency: 'USD', status: 'active', balance: 10, redeemable: false, transferable: false, topup_supported: false, payout_supported: false },
          { id: 'w2', wallet_type: 'x', scope_type: 'y', account_type: 'z', currency: 'EUR', status: 'frozen', balance: 0, redeemable: true, transferable: true, topup_supported: true, payout_supported: true },
        ],
        total: 2,
        limit: 25,
        offset: 0,
      })
      const sdk = createClient(fn)
      const result = await sdk.listWallets()

      expect(result.wallets).toHaveLength(2)
      expect(result.wallets[0].id).toBe('w1')
      expect(result.wallets[0].redeemable).toBe(false)
      expect(result.wallets[1].id).toBe('w2')
      expect(result.wallets[1].redeemable).toBe(true)
      expect(result.total).toBe(2)
      expect(result.limit).toBe(25)
      expect(result.offset).toBe(0)
    })

    it('createWallet maps created flag and wallet object', async () => {
      const fn = mockFetch({
        success: true,
        created: false, // existing wallet returned
        wallet: { id: 'w_exist', wallet_type: 't', scope_type: 's', account_type: 'a', currency: 'USD', status: 'active', balance: 100, redeemable: false, transferable: false, topup_supported: false, payout_supported: false },
      })
      const sdk = createClient(fn)
      const result = await sdk.createWallet({ ownerId: 'o1', walletType: 't' })

      expect(result.created).toBe(false) // created === true check in code
      expect(result.wallet.id).toBe('w_exist')
    })

    it('getWalletEntries maps wallet as null when absent and maps entry fields', async () => {
      const fn = mockFetch({
        success: true,
        wallet: null,
        entries: [
          {
            entry_id: 'e1',
            entry_type: 'debit',
            amount: 300,
            transaction_id: 'txn_e1',
            reference_id: 'ref_e1',
            transaction_type: 'withdrawal',
            description: 'Cash out',
            status: 'completed',
            metadata: { source: 'api' },
            created_at: '2026-03-11T00:00:00Z',
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
      })
      const sdk = createClient(fn)
      const result = await sdk.getWalletEntries('w_any')

      expect(result.wallet).toBeNull()
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].entryId).toBe('e1')
      expect(result.entries[0].entryType).toBe('debit')
      expect(result.entries[0].amount).toBe(300)
      expect(result.entries[0].transactionId).toBe('txn_e1')
      expect(result.entries[0].referenceId).toBe('ref_e1')
      expect(result.entries[0].transactionType).toBe('withdrawal')
      expect(result.entries[0].description).toBe('Cash out')
      expect(result.entries[0].status).toBe('completed')
      expect(result.entries[0].metadata).toEqual({ source: 'api' })
      expect(result.entries[0].createdAt).toBe('2026-03-11T00:00:00Z')
      expect(result.total).toBe(1)
      expect(result.limit).toBe(25)
      expect(result.offset).toBe(0)
    })

    it('topUpWallet falls back to deposit key and null defaults', async () => {
      const fn = mockFetch({
        success: true,
        deposit: {
          wallet_id: 'w_dep',
          owner_id: 'o_dep',
          transaction_id: 'txn_dep',
          balance: 7777,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.topUpWallet({ walletId: 'w_dep', amount: 1000 })

      expect(result.success).toBe(true)
      expect(result.walletId).toBe('w_dep')
      expect(result.ownerId).toBe('o_dep')
      expect(result.transactionId).toBe('txn_dep')
      expect(result.balance).toBe(7777)
    })

    it('topUpWallet returns nulls when topup/deposit keys missing', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.topUpWallet({ walletId: 'w_empty', amount: 100 })

      expect(result.walletId).toBeNull()
      expect(result.ownerId).toBeNull()
      expect(result.transactionId).toBeNull()
      expect(result.balance).toBeNull()
    })

    it('withdrawFromWallet maps withdrawal key and null defaults', async () => {
      const fn = mockFetch({
        success: true,
        withdrawal: {
          wallet_id: 'w_wd',
          owner_id: 'o_wd',
          transaction_id: 'txn_wd',
          balance: 3000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.withdrawFromWallet({ walletId: 'w_wd', amount: 500 })

      expect(result.success).toBe(true)
      expect(result.walletId).toBe('w_wd')
      expect(result.ownerId).toBe('o_wd')
      expect(result.transactionId).toBe('txn_wd')
      expect(result.balance).toBe(3000)
    })

    it('withdrawFromWallet falls back to response root when withdrawal key missing', async () => {
      const fn = mockFetch({
        success: true,
        wallet_id: 'w_root',
        owner_id: 'o_root',
        transaction_id: 'txn_root',
        balance: 1000,
      })
      const sdk = createClient(fn)
      const result = await sdk.withdrawFromWallet({ walletId: 'w_root', amount: 200 })

      expect(result.walletId).toBe('w_root')
      expect(result.ownerId).toBe('o_root')
      expect(result.transactionId).toBe('txn_root')
      expect(result.balance).toBe(1000)
    })

    it('createTransfer maps transfer fields and uses request params for participant ids', async () => {
      const fn = mockFetch({
        success: true,
        transfer: {
          transaction_id: 'txn_xfer',
          from_balance: 200,
          to_balance: 800,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createTransfer({
        fromParticipantId: 'from_p',
        toParticipantId: 'to_p',
        amount: 500,
      })

      expect(result.success).toBe(true)
      expect(result.transfer.transactionId).toBe('txn_xfer')
      expect(result.transfer.fromParticipantId).toBe('from_p')
      expect(result.transfer.toParticipantId).toBe('to_p')
      expect(result.transfer.fromBalance).toBe(200)
      expect(result.transfer.toBalance).toBe(800)
    })

    it('createTransfer falls back to response root when transfer key missing', async () => {
      const fn = mockFetch({
        success: true,
        transaction_id: 'txn_root',
        from_balance: 0,
        to_balance: 500,
      })
      const sdk = createClient(fn)
      const result = await sdk.createTransfer({
        fromParticipantId: 'a',
        toParticipantId: 'b',
        amount: 500,
      })

      expect(result.transfer.transactionId).toBe('txn_root')
      expect(result.transfer.fromBalance).toBe(0)
      expect(result.transfer.toBalance).toBe(500)
    })

    // --- HOLDS: exhaustive field mapping ---

    it('listHolds maps every field including null fallbacks and Boolean coercions', async () => {
      const fn = mockFetch({
        success: true,
        holds: [
          {
            id: 'h_1',
            participant_id: 'p_1',
            participant_name: 'Alice',
            amount: 5000,
            currency: 'USD',
            held_since: '2026-01-01T00:00:00Z',
            days_held: 10,
            hold_reason: 'escrow',
            hold_until: '2026-02-01T00:00:00Z',
            ready_for_release: true,
            release_status: 'ready',
            transaction_reference: 'order_99',
            product_name: 'Premium Book',
            venture_id: 'v_1',
            connected_account_ready: true,
          },
          {
            id: 'h_2',
            // all nullable fields missing
            amount: 100,
            currency: 'EUR',
            held_since: '2026-02-01T00:00:00Z',
            days_held: 1,
            ready_for_release: false,
            release_status: 'held',
            connected_account_ready: false,
          },
        ],
        count: 2,
      })
      const sdk = createClient(fn)
      const result = await sdk.listHolds()

      expect(result.success).toBe(true)
      expect(result.count).toBe(2)
      expect(result.holds).toHaveLength(2)

      // Full hold
      const h1 = result.holds[0]
      expect(h1.id).toBe('h_1')
      expect(h1.participantId).toBe('p_1')
      expect(h1.participantName).toBe('Alice')
      expect(h1.amount).toBe(5000)
      expect(h1.currency).toBe('USD')
      expect(h1.heldSince).toBe('2026-01-01T00:00:00Z')
      expect(h1.daysHeld).toBe(10)
      expect(h1.holdReason).toBe('escrow')
      expect(h1.holdUntil).toBe('2026-02-01T00:00:00Z')
      expect(h1.readyForRelease).toBe(true)
      expect(h1.releaseStatus).toBe('ready')
      expect(h1.transactionReference).toBe('order_99')
      expect(h1.productName).toBe('Premium Book')
      expect(h1.ventureId).toBe('v_1')
      expect(h1.connectedAccountReady).toBe(true)

      // Sparse hold — null fallbacks
      const h2 = result.holds[1]
      expect(h2.participantId).toBeNull()
      expect(h2.participantName).toBeNull()
      expect(h2.holdReason).toBeNull()
      expect(h2.holdUntil).toBeNull()
      expect(h2.readyForRelease).toBe(false)
      expect(h2.transactionReference).toBeNull()
      expect(h2.productName).toBeNull()
      expect(h2.ventureId).toBeNull()
      expect(h2.connectedAccountReady).toBe(false)
    })

    it('listHolds defaults count to 0 when missing', async () => {
      const fn = mockFetch({ success: true, holds: [] })
      const sdk = createClient(fn)
      const result = await sdk.listHolds()

      expect(result.count).toBe(0)
      expect(result.holds).toEqual([])
    })

    it('releaseHold maps release object with all fields', async () => {
      const fn = mockFetch({
        success: true,
        release: {
          id: 'rel_1',
          hold_id: 'h_99',
          executed: true,
          transfer_id: 'xfr_1',
          transfer_status: 'completed',
          amount: 7500,
          currency: 'USD',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.releaseHold({ holdId: 'h_99' })

      expect(result.success).toBe(true)
      expect(result.release.id).toBe('rel_1')
      expect(result.release.holdId).toBe('h_99')
      expect(result.release.executed).toBe(true)
      expect(result.release.transferId).toBe('xfr_1')
      expect(result.release.transferStatus).toBe('completed')
      expect(result.release.amount).toBe(7500)
      expect(result.release.currency).toBe('USD')
    })

    it('releaseHold null fallbacks when release is empty', async () => {
      const fn = mockFetch({ success: true, release: {} })
      const sdk = createClient(fn)
      const result = await sdk.releaseHold({ holdId: 'h_empty' })

      expect(result.release.holdId).toBe('h_empty') // falls back to req.holdId
      expect(result.release.executed).toBe(false)
      expect(result.release.transferId).toBeNull()
      expect(result.release.transferStatus).toBeNull()
      expect(result.release.amount).toBeNull()
      expect(result.release.currency).toBeNull()
    })

    it('releaseHold falls back to response root when release key missing', async () => {
      const fn = mockFetch({
        success: true,
        id: 'rel_root',
        hold_id: 'h_root',
        executed: true,
        transfer_id: 'xfr_root',
        transfer_status: 'pending',
        amount: 1000,
        currency: 'EUR',
      })
      const sdk = createClient(fn)
      const result = await sdk.releaseHold({ holdId: 'h_root' })

      expect(result.release.id).toBe('rel_root')
      expect(result.release.holdId).toBe('h_root')
      expect(result.release.executed).toBe(true)
      expect(result.release.transferId).toBe('xfr_root')
    })

    it('releaseHold sends execute_transfer true by default', async () => {
      const fn = mockFetch({ success: true, release: { id: 'r1' } })
      const sdk = createClient(fn)
      await sdk.releaseHold({ holdId: 'h1' })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.execute_transfer).toBe(true)
    })

    it('releaseHold sends execute_transfer false when explicitly set', async () => {
      const fn = mockFetch({ success: true, release: { id: 'r1' } })
      const sdk = createClient(fn)
      await sdk.releaseHold({ holdId: 'h1', executeTransfer: false })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.execute_transfer).toBe(false)
    })

    // --- COMPLIANCE: financial activity and security summary ---

    it('listComplianceFinancialActivity maps every field in activity entries', async () => {
      const fn = mockFetch({
        success: true,
        window_days: 7,
        activity: [
          {
            date: '2026-03-10',
            payouts_initiated: 5,
            payouts_completed: 3,
            payouts_failed: 1,
            sales_recorded: 20,
            refunds_recorded: 2,
            dispute_events: 0,
          },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceFinancialActivity({ days: 7 })

      expect(result.success).toBe(true)
      expect(result.windowDays).toBe(7)
      expect(result.activity).toHaveLength(1)
      const a = result.activity[0]
      expect(a.date).toBe('2026-03-10')
      expect(a.payoutsInitiated).toBe(5)
      expect(a.payoutsCompleted).toBe(3)
      expect(a.payoutsFailed).toBe(1)
      expect(a.salesRecorded).toBe(20)
      expect(a.refundsRecorded).toBe(2)
      expect(a.disputeEvents).toBe(0)
    })

    it('listComplianceFinancialActivity returns empty array when activity missing', async () => {
      const fn = mockFetch({ success: true, window_days: 30 })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceFinancialActivity()

      expect(result.activity).toEqual([])
      expect(result.windowDays).toBe(30)
    })

    it('listComplianceSecuritySummary maps every field in summary entries', async () => {
      const fn = mockFetch({
        success: true,
        window_days: 14,
        summary: [
          {
            date: '2026-03-09',
            action: 'record-sale',
            event_count: 50,
            unique_ips: 3,
            unique_actors: 2,
            avg_risk_score: 15,
            max_risk_score: 45,
            high_risk_count: 1,
            critical_risk_count: 0,
          },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceSecuritySummary({ days: 14 })

      expect(result.success).toBe(true)
      expect(result.windowDays).toBe(14)
      expect(result.summary).toHaveLength(1)
      const s = result.summary[0]
      expect(s.date).toBe('2026-03-09')
      expect(s.action).toBe('record-sale')
      expect(s.eventCount).toBe(50)
      expect(s.uniqueIps).toBe(3)
      expect(s.uniqueActors).toBe(2)
      expect(s.avgRiskScore).toBe(15)
      expect(s.maxRiskScore).toBe(45)
      expect(s.highRiskCount).toBe(1)
      expect(s.criticalRiskCount).toBe(0)
    })

    it('listComplianceSecuritySummary returns empty array when summary missing', async () => {
      const fn = mockFetch({ success: true, window_days: 7 })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceSecuritySummary()

      expect(result.summary).toEqual([])
    })

    // --- TAX: listTaxDocuments, getTaxDocument, exportTaxDocuments ---

    it('listTaxDocuments maps summary.byStatus defaults to 0', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        summary: {}, // no fields at all
        documents: [],
      })
      const sdk = createClient(fn)
      const result = await sdk.listTaxDocuments(2025)

      expect(result.taxYear).toBe(2025)
      expect(result.summary.totalDocuments).toBe(0)
      expect(result.summary.totalAmount).toBe(0)
      expect(result.summary.byStatus.calculated).toBe(0)
      expect(result.summary.byStatus.exported).toBe(0)
      expect(result.summary.byStatus.filed).toBe(0)
      expect(result.documents).toEqual([])
    })

    it('listTaxDocuments maps summary when summary itself is null', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        documents: [{ id: 'doc_1' }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listTaxDocuments(2025)

      expect(result.summary.totalDocuments).toBe(0)
      expect(result.summary.totalAmount).toBe(0)
      expect(result.summary.byStatus.calculated).toBe(0)
    })

    it('getTaxDocument passes through document object', async () => {
      const fn = mockFetch({
        success: true,
        document: {
          id: 'doc_42',
          participant_id: 'p_1',
          tax_year: 2025,
          gross_amount: 120000,
          status: 'calculated',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getTaxDocument('doc_42')

      expect(result.success).toBe(true)
      expect(result.document.id).toBe('doc_42')
      expect(result.document.participant_id).toBe('p_1')
      expect(result.document.tax_year).toBe(2025)
      expect(result.document.gross_amount).toBe(120000)
      expect(result.document.status).toBe('calculated')
    })

    it('exportTaxDocuments CSV path extracts filename from Content-Disposition', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('id,amount\ndoc_1,50000'),
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="1099_export_2025.csv"',
        }),
      })
      const sdk = createClient(fn)
      const result = await sdk.exportTaxDocuments(2025, 'csv')

      expect(result).toEqual({
        csv: 'id,amount\ndoc_1,50000',
        filename: '1099_export_2025.csv',
      })
    })

    it('exportTaxDocuments CSV path uses fallback filename when header missing', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('data'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)
      const result = await sdk.exportTaxDocuments(2025, 'csv')

      expect(result.filename).toBe('1099_export_2025.csv')
    })

    it('exportTaxDocuments JSON path returns parsed response', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        documents: [{ id: 'doc_1' }],
      })
      const sdk = createClient(fn)
      const result = await sdk.exportTaxDocuments(2025, 'json')

      expect(result).toMatchObject({ success: true, tax_year: 2025 })
    })

    it('correctTaxDocument sends all optional params', async () => {
      const fn = mockFetch({ success: true, document: { id: 'doc_c', status: 'corrected', correction_id: 'corr_1' } })
      const sdk = createClient(fn)
      const result = await sdk.correctTaxDocument('doc_c', {
        reason: 'Amount error',
        grossAmount: 200000,
        federalWithholding: 5000,
        stateWithholding: 2000,
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.reason).toBe('Amount error')
      expect(body.gross_amount).toBe(200000)
      expect(body.federal_withholding).toBe(5000)
      expect(body.state_withholding).toBe(2000)
      expect(result.document.correction_id).toBe('corr_1')
    })

    // --- EXPORT REPORT: CSV and JSON paths ---

    it('exportReport CSV path with no filename in header falls back to reportType', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('col1,col2\na,b'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)
      const result = await sdk.exportReport({
        reportType: 'transaction_detail',
        format: 'csv',
      })

      expect(result).toEqual({
        csv: 'col1,col2\na,b',
        filename: 'transaction_detail.csv',
      })
    })

    it('exportReport CSV sends correct snake_case body', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('data'),
        headers: new Headers({ 'Content-Disposition': 'attachment; filename=report.csv' }),
      })
      const sdk = createClient(fn)
      await sdk.exportReport({
        reportType: 'creator_earnings',
        format: 'csv',
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        creatorId: 'c_1',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('creator_earnings')
      expect(body.format).toBe('csv')
      expect(body.start_date).toBe('2026-01-01')
      expect(body.end_date).toBe('2026-03-01')
      expect(body.creator_id).toBe('c_1')
    })

    // --- CHECKOUT SESSION: session mode vs direct mode ---

    it('createCheckoutSession session mode maps all fields from checkout_session', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'sess_full',
          mode: 'session',
          checkout_url: 'https://pay.example.com/sess_full',
          payment_id: null,
          payment_intent_id: null,
          status: 'pending',
          requires_action: false,
          amount: 2500,
          currency: 'GBP',
          expires_at: '2026-04-01T00:00:00Z',
          breakdown: {
            gross_amount: 2500,
            creator_amount: 2000,
            platform_amount: 500,
            creator_percent: 80,
          },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 2500,
        participantId: 'p_1',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        currency: 'GBP',
        customerEmail: 'test@example.com',
      })

      expect(result.success).toBe(true)
      const cs = result.checkoutSession
      expect(cs.id).toBe('sess_full')
      expect(cs.mode).toBe('session')
      expect(cs.checkoutUrl).toBe('https://pay.example.com/sess_full')
      expect(cs.paymentId).toBeNull()
      expect(cs.paymentIntentId).toBeNull()
      expect(cs.status).toBe('pending')
      expect(cs.requiresAction).toBe(false)
      expect(cs.amount).toBe(2500)
      expect(cs.currency).toBe('GBP')
      expect(cs.expiresAt).toBe('2026-04-01T00:00:00Z')
      expect(cs.breakdown).not.toBeNull()
      expect(cs.breakdown!.grossAmount).toBe(2500)
      expect(cs.breakdown!.creatorAmount).toBe(2000)
      expect(cs.breakdown!.platformAmount).toBe(500)
      expect(cs.breakdown!.creatorPercent).toBe(80)
    })

    it('createCheckoutSession direct mode with no breakdown', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_direct',
          mode: 'direct',
          payment_id: 'pay_direct',
          status: 'completed',
          requires_action: false,
          amount: 1000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
      })

      const cs = result.checkoutSession
      expect(cs.mode).toBe('direct')
      expect(cs.paymentId).toBe('pay_direct')
      expect(cs.paymentIntentId).toBe('pay_direct') // falls back to payment_id
      expect(cs.checkoutUrl).toBeNull()
      expect(cs.breakdown).toBeNull()
      expect(cs.currency).toBe('USD') // default
      expect(cs.expiresAt).toBeNull()
    })

    it('createCheckoutSession falls back to response root when checkout_session key missing', async () => {
      const fn = mockFetch({
        success: true,
        id: 'cs_root',
        mode: 'direct',
        payment_id: 'pay_root',
        status: 'completed',
        requires_action: true,
        amount: 5000,
        currency: 'USD',
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 5000,
        participantId: 'p_1',
        paymentMethodId: 'pm_2',
      })

      expect(result.checkoutSession.id).toBe('cs_root')
      expect(result.checkoutSession.requiresAction).toBe(true)
    })

    it('createCheckoutSession with sourceId sends source_id in body', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: { id: 'cs_src', mode: 'direct', payment_id: 'pay_src', status: 'completed', requires_action: false },
      })
      const sdk = createClient(fn)
      await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        sourceId: 'src_1',
        successUrl: 'https://example.com/ok',
      } as any)

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.source_id).toBe('src_1')
      expect(body.success_url).toBe('https://example.com/ok')
    })

    // --- ALERT CRUD: createAlert and updateAlert with config mapping ---

    it('createAlert with Slack config maps webhookUrl and channel', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_1',
          alert_type: 'breach_risk',
          channel: 'slack',
          config: { webhook_url: 'https://hooks.slack.com/xxx', channel: '#alerts' },
          thresholds: { coverage_ratio_below: 0.3, shortfall_above: 5000 },
          is_active: true,
          trigger_count: 0,
          created_at: '2026-03-10T00:00:00Z',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createAlert({
        alertType: 'breach_risk',
        channel: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/xxx', channel: '#alerts' },
        thresholds: { coverageRatioBelow: 0.3, shortfallAbove: 5000 },
        isActive: true,
      })

      // Verify request body mapping
      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('create')
      expect(body.alert_type).toBe('breach_risk')
      expect(body.channel).toBe('slack')
      expect(body.config.webhook_url).toBe('https://hooks.slack.com/xxx')
      expect(body.config.channel).toBe('#alerts')
      expect(body.thresholds.coverage_ratio_below).toBe(0.3)
      expect(body.thresholds.shortfall_above).toBe(5000)
      expect(body.is_active).toBe(true)

      // Verify response mapping
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('alert_1')
      expect(result.data.alertType).toBe('breach_risk')
      expect(result.data.channel).toBe('slack')
      expect(result.data.config).toEqual({ webhook_url: 'https://hooks.slack.com/xxx', channel: '#alerts' })
      expect(result.data.thresholds.coverageRatioBelow).toBe(0.3)
      expect(result.data.thresholds.shortfallAbove).toBe(5000)
      expect(result.data.isActive).toBe(true)
      expect(result.data.triggerCount).toBe(0)
      expect(result.data.createdAt).toBe('2026-03-10T00:00:00Z')
    })

    it('createAlert with Email config maps recipients', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_2',
          alert_type: 'breach_risk',
          channel: 'email',
          config: { recipients: ['a@test.com', 'b@test.com'] },
          thresholds: {},
          is_active: false,
          trigger_count: 3,
          created_at: '2026-03-11T00:00:00Z',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createAlert({
        alertType: 'breach_risk',
        channel: 'email',
        config: { recipients: ['a@test.com', 'b@test.com'] },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.config.recipients).toEqual(['a@test.com', 'b@test.com'])
      expect(body.config.webhook_url).toBeUndefined()

      expect(result.data.triggerCount).toBe(3)
      expect(result.data.isActive).toBe(false)
    })

    it('createAlert response defaults trigger_count to 0 when missing', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_3',
          alert_type: 'breach_risk',
          channel: 'slack',
          config: {},
          thresholds: {},
          is_active: true,
          // trigger_count missing
          // created_at missing
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createAlert({
        alertType: 'breach_risk',
        channel: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/yyy' },
      })

      expect(result.data.triggerCount).toBe(0)
    })

    it('updateAlert with Slack config maps webhookUrl and channel', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_u1',
          alert_type: 'breach_risk',
          channel: 'slack',
          config: { webhook_url: 'https://hooks.slack.com/new', channel: '#ops' },
          thresholds: { coverage_ratio_below: 0.2, shortfall_above: 10000 },
          is_active: true,
          trigger_count: 5,
          created_at: '2026-01-01T00:00:00Z',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.updateAlert({
        configId: 'alert_u1',
        config: { webhookUrl: 'https://hooks.slack.com/new', channel: '#ops' },
        thresholds: { coverageRatioBelow: 0.2, shortfallAbove: 10000 },
        isActive: true,
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('update')
      expect(body.config_id).toBe('alert_u1')
      expect(body.config.webhook_url).toBe('https://hooks.slack.com/new')
      expect(body.config.channel).toBe('#ops')
      expect(body.thresholds.coverage_ratio_below).toBe(0.2)
      expect(body.thresholds.shortfall_above).toBe(10000)

      expect(result.data.id).toBe('alert_u1')
      expect(result.data.alertType).toBe('breach_risk')
      expect(result.data.thresholds.coverageRatioBelow).toBe(0.2)
      expect(result.data.thresholds.shortfallAbove).toBe(10000)
      expect(result.data.isActive).toBe(true)
      expect(result.data.triggerCount).toBe(5)
      expect(result.data.createdAt).toBe('2026-01-01T00:00:00Z')
    })

    it('updateAlert with Email config maps recipients', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_u2',
          alert_type: 'breach_risk',
          channel: 'email',
          config: { recipients: ['c@test.com'] },
          thresholds: {},
          is_active: false,
          trigger_count: 0,
          created_at: '',
        },
      })
      const sdk = createClient(fn)
      await sdk.updateAlert({
        configId: 'alert_u2',
        config: { recipients: ['c@test.com'] },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.config.recipients).toEqual(['c@test.com'])
    })

    it('updateAlert with no config sends undefined config', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_u3',
          alert_type: 'breach_risk',
          channel: 'slack',
          config: {},
          thresholds: {},
          is_active: false,
          trigger_count: 0,
          created_at: '',
        },
      })
      const sdk = createClient(fn)
      await sdk.updateAlert({ configId: 'alert_u3', isActive: false })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.config).toBeUndefined()
    })

    it('updateAlert defaults trigger_count to 0 and created_at to empty string', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'alert_u4',
          alert_type: 'test',
          channel: 'email',
          // config missing -> || {}
          thresholds: {},
          is_active: true,
          // trigger_count missing -> ?? 0
          // created_at missing -> ?? ''
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.updateAlert({ configId: 'alert_u4' })

      expect(result.data.config).toEqual({})
      expect(result.data.triggerCount).toBe(0)
      expect(result.data.createdAt).toBe('')
    })

    // --- listAlerts exhaustive field coverage ---

    it('listAlerts maps lastTriggeredAt and handles empty data', async () => {
      const fn = mockFetch({ success: true, data: [] })
      const sdk = createClient(fn)
      const result = await sdk.listAlerts()

      expect(result.data).toEqual([])
    })

    it('listAlerts maps all fields including lastTriggeredAt', async () => {
      const fn = mockFetch({
        success: true,
        data: [{
          id: 'a_full',
          alert_type: 'breach_risk',
          channel: 'email',
          config: { recipients: ['x@y.com'] },
          thresholds: { coverage_ratio_below: 0.1, shortfall_above: 999 },
          is_active: false,
          last_triggered_at: '2026-03-15T12:00:00Z',
          trigger_count: 42,
          created_at: '2026-01-01T00:00:00Z',
        }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listAlerts()

      const a = result.data[0]
      expect(a.id).toBe('a_full')
      expect(a.alertType).toBe('breach_risk')
      expect(a.channel).toBe('email')
      expect(a.config).toEqual({ recipients: ['x@y.com'] })
      expect(a.thresholds.coverageRatioBelow).toBe(0.1)
      expect(a.thresholds.shortfallAbove).toBe(999)
      expect(a.isActive).toBe(false)
      expect(a.lastTriggeredAt).toBe('2026-03-15T12:00:00Z')
      expect(a.triggerCount).toBe(42)
      expect(a.createdAt).toBe('2026-01-01T00:00:00Z')
    })

    // --- INVOICE METHODS: verify response pass-through ---

    it('getInvoice passes through invoice object from GET', async () => {
      const fn = mockFetch({
        success: true,
        invoice: {
          id: 'inv_99',
          customer_name: 'Acme',
          status: 'sent',
          total_amount: 12500,
          line_items: [{ description: 'Service', quantity: 1, unit_price: 12500, amount: 12500 }],
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getInvoice('inv_99')

      const [url, opts] = fn.mock.calls[0]
      expect(opts.method).toBe('GET')
      expect(String(url)).toContain('/invoices/inv_99')
      expect(result.invoice.id).toBe('inv_99')
      expect(result.invoice.customer_name).toBe('Acme')
    })

    it('sendInvoice returns response from POST', async () => {
      const fn = mockFetch({ success: true, message: 'Invoice emailed', invoice_id: 'inv_sent' })
      const sdk = createClient(fn)
      const result = await sdk.sendInvoice('inv_sent')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Invoice emailed')
    })

    it('recordInvoicePayment maps payment_method to snake_case', async () => {
      const fn = mockFetch({ success: true, transaction_id: 'txn_ip', remaining_balance: 0 })
      const sdk = createClient(fn)
      const result = await sdk.recordInvoicePayment('inv_55', {
        amount: 12500,
        paymentMethod: 'credit_card',
        paymentDate: '2026-03-15',
        referenceId: 'ref_ip',
        notes: 'Full payment',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.amount).toBe(12500)
      expect(body.payment_method).toBe('credit_card')
      expect(body.payment_date).toBe('2026-03-15')
      expect(body.reference_id).toBe('ref_ip')
      expect(body.notes).toBe('Full payment')
      expect(result.remaining_balance).toBe(0)
    })

    it('voidInvoice sends reason in body', async () => {
      const fn = mockFetch({ success: true, invoice_id: 'inv_void', status: 'voided' })
      const sdk = createClient(fn)
      const result = await sdk.voidInvoice('inv_void', 'Duplicate invoice')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.reason).toBe('Duplicate invoice')
      expect(result.status).toBe('voided')
    })

    it('createInvoice maps customerAddress postal_code', async () => {
      const fn = mockFetch({ success: true, invoice_id: 'inv_addr' })
      const sdk = createClient(fn)
      await sdk.createInvoice({
        customerName: 'Test Corp',
        customerAddress: {
          line1: '456 Oak Ave',
          line2: 'Suite 200',
          city: 'Portland',
          state: 'OR',
          postalCode: '97201',
          country: 'US',
        },
        lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 10000 }],
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.customer_address.line1).toBe('456 Oak Ave')
      expect(body.customer_address.line2).toBe('Suite 200')
      expect(body.customer_address.city).toBe('Portland')
      expect(body.customer_address.state).toBe('OR')
      expect(body.customer_address.postal_code).toBe('97201')
      expect(body.customer_address.country).toBe('US')
    })

    // --- PAYOUT: response field exhaustive ---

    it('createPayout returns nulls for missing optional fields', async () => {
      const fn = mockFetch({
        success: true,
        payout: { id: 'po_sparse', transaction_id: 'tx_sparse' },
      })
      const sdk = createClient(fn)
      const result = await sdk.createPayout({ participantId: 'p_1', amount: 1000 })

      expect(result.payout.id).toBe('po_sparse')
      expect(result.payout.transactionId).toBe('tx_sparse')
      expect(result.payout.grossAmount).toBeNull()
      expect(result.payout.fees).toBeNull()
      expect(result.payout.netAmount).toBeNull()
      expect(result.payout.previousBalance).toBeNull()
      expect(result.payout.newBalance).toBeNull()
    })

    it('createPayout falls back to response root when payout key missing', async () => {
      const fn = mockFetch({
        success: true,
        id: 'po_root',
        transaction_id: 'tx_root',
        gross_amount: 5000,
        fees: 100,
        net_amount: 4900,
        previous_balance: 10000,
        new_balance: 5100,
      })
      const sdk = createClient(fn)
      const result = await sdk.createPayout({ participantId: 'p_1', amount: 5000 })

      expect(result.payout.id).toBe('po_root')
      expect(result.payout.grossAmount).toBe(5000)
      expect(result.payout.fees).toBe(100)
      expect(result.payout.netAmount).toBe(4900)
      expect(result.payout.previousBalance).toBe(10000)
      expect(result.payout.newBalance).toBe(5100)
    })

    // --- REFUND: null breakdown, missing fields ---

    it('createRefund with null breakdown returns null', async () => {
      const fn = mockFetch({
        success: true,
        refund: {
          id: 'rf_nb',
          transaction_id: 'tx_nb',
          reference_id: 'ref_nb',
          sale_reference: 'sale_nb',
          refunded_amount: 1000,
          currency: 'USD',
          status: 'completed',
          breakdown: null,
          is_full_refund: null,
          repair_pending: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createRefund({ saleReference: 'sale_nb', reason: 'test' })

      expect(result.refund.breakdown).toBeNull()
      expect(result.refund.isFullRefund).toBeNull()
      expect(result.refund.repairPending).toBeNull()
      expect(result.warning).toBeNull()
      expect(result.warningCode).toBeNull()
    })

    it('createRefund falls back id from reference_id then transaction_id', async () => {
      const fn = mockFetch({
        success: true,
        refund: {
          // id missing, reference_id present
          reference_id: 'ref_fallback',
          sale_reference: 'sale_1',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createRefund({ saleReference: 'sale_1', reason: 'test' })

      expect(result.refund.id).toBe('ref_fallback')
    })

    it('createRefund id falls back to empty string when all id fields missing', async () => {
      const fn = mockFetch({
        success: true,
        refund: { sale_reference: 'sale_2' },
      })
      const sdk = createClient(fn)
      const result = await sdk.createRefund({ saleReference: 'sale_2', reason: 'test' })

      expect(result.refund.id).toBe('')
    })

    // --- SEND BREACH ALERT: with results array ---

    it('sendBreachAlert maps results array and all counters', async () => {
      const fn = mockFetch({
        success: true,
        message: 'Alerts dispatched',
        alerts_sent: 2,
        alerts_failed: 1,
        alerts_skipped: 0,
        results: [
          { channel: 'slack', success: true },
          { channel: 'email', success: true },
          { channel: 'webhook', success: false, error: 'timeout' },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.sendBreachAlert({
        cashBalance: 1000,
        pendingTotal: 5000,
        shortfall: 4000,
        coverageRatio: 0.2,
        triggeredBy: 'project-intent',
        instrumentId: 'inst_1',
        externalRef: 'contract_1',
        projectionsCreated: 6,
      })

      expect(result.success).toBe(true)
      expect(result.message).toBe('Alerts dispatched')
      expect(result.alertsSent).toBe(2)
      expect(result.alertsFailed).toBe(1)
      expect(result.alertsSkipped).toBe(0)
      expect(result.results).toHaveLength(3)
      expect(result.results![0].channel).toBe('slack')
      expect(result.results![0].success).toBe(true)
      expect(result.results![2].error).toBe('timeout')
    })

    // --- RECONCILIATION: matchTransaction, unmatchTransaction, listUnmatched ---

    it('matchTransaction maps match object', async () => {
      const fn = mockFetch({
        success: true,
        match: {
          id: 'm_1',
          transaction_id: 'txn_m1',
          bank_transaction_id: 'btxn_m1',
          status: 'confirmed',
          matched_at: '2026-03-10T00:00:00Z',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.matchTransaction({
        transactionId: 'txn_m1',
        bankTransactionId: 'btxn_m1',
      })

      expect(result.success).toBe(true)
      expect(result.match.id).toBe('m_1')
      expect(result.match.transactionId).toBe('txn_m1')
      expect(result.match.bankTransactionId).toBe('btxn_m1')
      expect(result.match.status).toBe('confirmed')
      expect(result.match.matchedAt).toBe('2026-03-10T00:00:00Z')
    })

    it('unmatchTransaction maps deleted and transactionId', async () => {
      const fn = mockFetch({
        success: true,
        deleted: true,
        transaction_id: 'txn_um1',
      })
      vi.stubGlobal('fetch', fn)
      const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
      const result = await sdk.unmatchTransaction('txn_um1')

      expect(result.success).toBe(true)
      expect(result.deleted).toBe(true)
      expect(result.transactionId).toBe('txn_um1')
    })

    it('unmatchTransaction coerces deleted to Boolean', async () => {
      const fn = mockFetch({
        success: true,
        deleted: 0,
        transaction_id: 'txn_um2',
      })
      vi.stubGlobal('fetch', fn)
      const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
      const result = await sdk.unmatchTransaction('txn_um2')

      expect(result.deleted).toBe(false)
    })

    it('listUnmatchedTransactions maps transactions with null fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        unmatched_count: 2,
        transactions: [
          {
            id: 't_1',
            reference_id: 'ref_1',
            description: 'Payment from client',
            amount: 5000,
            currency: 'USD',
            created_at: '2026-03-10T00:00:00Z',
            status: 'pending',
            metadata: { source: 'import' },
          },
          {
            id: 't_2',
            // reference_id missing -> null
            // description missing -> null
            amount: 100,
            // currency missing -> 'USD'
            created_at: '2026-03-11T00:00:00Z',
            status: 'pending',
            // metadata missing -> {}
          },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listUnmatchedTransactions()

      expect(result.success).toBe(true)
      expect(result.unmatchedCount).toBe(2)
      expect(result.transactions).toHaveLength(2)

      const t1 = result.transactions[0]
      expect(t1.id).toBe('t_1')
      expect(t1.referenceId).toBe('ref_1')
      expect(t1.description).toBe('Payment from client')
      expect(t1.amount).toBe(5000)
      expect(t1.currency).toBe('USD')
      expect(t1.createdAt).toBe('2026-03-10T00:00:00Z')
      expect(t1.status).toBe('pending')
      expect(t1.metadata).toEqual({ source: 'import' })

      const t2 = result.transactions[1]
      expect(t2.referenceId).toBeNull()
      expect(t2.description).toBeNull()
      expect(t2.currency).toBe('USD')
      expect(t2.metadata).toEqual({})
    })

    it('listUnmatchedTransactions defaults unmatchedCount to 0', async () => {
      const fn = mockFetch({ success: true, transactions: [] })
      const sdk = createClient(fn)
      const result = await sdk.listUnmatchedTransactions()

      expect(result.unmatchedCount).toBe(0)
    })

    // --- RECONCILIATION SNAPSHOT ---

    it('getReconciliationSnapshot maps all nested snapshot fields', async () => {
      const fn = mockFetch({
        success: true,
        snapshot: {
          id: 'snap_1',
          period_start: '2026-01-01',
          period_end: '2026-01-31',
          integrity_hash: 'abc123def',
          integrity_valid: true,
          summary: {
            total_matched: 50,
            total_unmatched: 3,
            matched_amount: 500000,
            unmatched_amount: 15000,
          },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getReconciliationSnapshot('period_jan')

      expect(result.success).toBe(true)
      expect(result.snapshot.id).toBe('snap_1')
      expect(result.snapshot.periodStart).toBe('2026-01-01')
      expect(result.snapshot.periodEnd).toBe('2026-01-31')
      expect(result.snapshot.integrityHash).toBe('abc123def')
      expect(result.snapshot.integrityValid).toBe(true)
      expect(result.snapshot.summary.totalMatched).toBe(50)
      expect(result.snapshot.summary.totalUnmatched).toBe(3)
      expect(result.snapshot.summary.matchedAmount).toBe(500000)
      expect(result.snapshot.summary.unmatchedAmount).toBe(15000)
    })

    it('getReconciliationSnapshot defaults summary fields to 0', async () => {
      const fn = mockFetch({
        success: true,
        snapshot: {
          id: 'snap_2',
          period_start: '2026-02-01',
          period_end: '2026-02-28',
          integrity_hash: 'xyz',
          integrity_valid: false,
          // summary missing
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getReconciliationSnapshot('period_feb')

      expect(result.snapshot.integrityValid).toBe(false)
      expect(result.snapshot.summary.totalMatched).toBe(0)
      expect(result.snapshot.summary.totalUnmatched).toBe(0)
      expect(result.snapshot.summary.matchedAmount).toBe(0)
      expect(result.snapshot.summary.unmatchedAmount).toBe(0)
    })

    // --- AUTO MATCH ---

    it('autoMatchBankTransaction maps result with match', async () => {
      const fn = mockFetch({
        success: true,
        result: {
          matched: true,
          match_type: 'exact_amount',
          matched_transaction_id: 'txn_matched',
          bank_aggregator_transaction_id: 'bat_1',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.autoMatchBankTransaction('bat_1')

      expect(result.success).toBe(true)
      expect(result.result.matched).toBe(true)
      expect(result.result.matchType).toBe('exact_amount')
      expect(result.result.matchedTransactionId).toBe('txn_matched')
      expect(result.result.bankAggregatorTransactionId).toBe('bat_1')
    })

    it('autoMatchBankTransaction handles no match with null fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        result: {
          matched: false,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.autoMatchBankTransaction('bat_2')

      expect(result.result.matched).toBe(false)
      expect(result.result.matchType).toBeNull()
      expect(result.result.matchedTransactionId).toBeNull()
      expect(result.result.bankAggregatorTransactionId).toBe('bat_2') // falls back to input
    })

    it('autoMatchBankTransaction defaults when result is null', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.autoMatchBankTransaction('bat_3')

      expect(result.result.matched).toBe(false)
      expect(result.result.bankAggregatorTransactionId).toBe('bat_3')
    })

    // --- COMPLIANCE OVERVIEW: exhaustive field mapping ---

    it('getComplianceOverview maps every overview field', async () => {
      const fn = mockFetch({
        success: true,
        overview: {
          window_days: 7,
          access_window_hours: 12,
          total_events: 500,
          unique_ips: 15,
          unique_actors: 8,
          high_risk_events: 3,
          critical_risk_events: 1,
          failed_auth_events: 2,
          payouts_failed: 4,
          refunds_recorded: 10,
          dispute_events: 1,
        },
        note: 'Monitoring active',
      })
      const sdk = createClient(fn)
      const result = await sdk.getComplianceOverview({ days: 7, hours: 12 })

      expect(result.overview.windowDays).toBe(7)
      expect(result.overview.accessWindowHours).toBe(12)
      expect(result.overview.totalEvents).toBe(500)
      expect(result.overview.uniqueIps).toBe(15)
      expect(result.overview.uniqueActors).toBe(8)
      expect(result.overview.highRiskEvents).toBe(3)
      expect(result.overview.criticalRiskEvents).toBe(1)
      expect(result.overview.failedAuthEvents).toBe(2)
      expect(result.overview.payoutsFailed).toBe(4)
      expect(result.overview.refundsRecorded).toBe(10)
      expect(result.overview.disputeEvents).toBe(1)
      expect(result.note).toBe('Monitoring active')
    })

    // --- FRAUD POLICY: deleteFraudPolicy and listFraudPolicies ---

    it('deleteFraudPolicy maps deleted boolean and policyId', async () => {
      const fn = mockFetch({
        success: true,
        deleted: true,
        policy_id: 'fp_del',
      })
      vi.stubGlobal('fetch', fn)
      const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
      const result = await sdk.deleteFraudPolicy('fp_del')

      expect(result.success).toBe(true)
      expect(result.deleted).toBe(true)
      expect(result.policyId).toBe('fp_del')
    })

    it('listFraudPolicies maps all policy fields including null fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        policies: [
          {
            id: 'fp_1',
            type: 'velocity_limit',
            severity: 'soft',
            priority: 5,
            is_active: true,
            config: { max_per_day: 10 },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-02-01T00:00:00Z',
          },
          {
            id: 'fp_2',
            type: 'budget_cap',
            severity: 'hard',
            priority: 1,
            is_active: false,
            // config missing -> {}
            // created_at missing -> null
            // updated_at missing -> null
          },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listFraudPolicies()

      expect(result.policies).toHaveLength(2)
      expect(result.policies[0].id).toBe('fp_1')
      expect(result.policies[0].type).toBe('velocity_limit')
      expect(result.policies[0].severity).toBe('soft')
      expect(result.policies[0].priority).toBe(5)
      expect(result.policies[0].isActive).toBe(true)
      expect(result.policies[0].config).toEqual({ max_per_day: 10 })
      expect(result.policies[0].createdAt).toBe('2026-01-01T00:00:00Z')
      expect(result.policies[0].updatedAt).toBe('2026-02-01T00:00:00Z')

      expect(result.policies[1].isActive).toBe(false)
      expect(result.policies[1].config).toEqual({})
      expect(result.policies[1].createdAt).toBeNull()
      expect(result.policies[1].updatedAt).toBeNull()
    })

    // --- createFraudPolicy full field mapping ---

    it('createFraudPolicy maps all fields with null fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        policy: {
          id: 'fp_new',
          type: 'amount_threshold',
          severity: 'hard',
          priority: 1,
          is_active: false,
          // config missing -> {}
          // created_at missing -> null
          // updated_at missing -> null
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createFraudPolicy({
        policyType: 'amount_threshold',
        config: { max: 100000 },
        severity: 'hard',
        priority: 1,
      })

      expect(result.policy.id).toBe('fp_new')
      expect(result.policy.isActive).toBe(false)
      expect(result.policy.config).toEqual({})
      expect(result.policy.createdAt).toBeNull()
      expect(result.policy.updatedAt).toBeNull()
    })

    // --- GENERATE TAX SUMMARY: with null sharedTaxProfile ---

    it('generateTaxSummary with null sharedTaxProfile', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        note: 'preliminary',
        summaries: [{
          participant_id: 'p_1',
          linked_user_id: null,
          gross_earnings: 400,
          refunds_issued: 0,
          net_earnings: 400,
          total_paid_out: 300,
          requires_1099: false,
          shared_tax_profile: null,
        }],
        totals: {
          total_gross: 400,
          total_refunds: 0,
          total_net: 400,
          total_paid: 300,
          participants_requiring_1099: 0,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.generateTaxSummary(2025)

      expect(result.summaries[0].linkedUserId).toBeNull()
      expect(result.summaries[0].requires1099).toBe(false)
      expect(result.summaries[0].sharedTaxProfile).toBeNull()
      expect(result.totals.totalRefunds).toBe(0)
      expect(result.totals.totalPaid).toBe(300)
    })

    // --- CALCULATE TAX: null sharedTaxProfile ---

    it('calculateTaxForParticipant with null linked_user_id and null shared_tax_profile', async () => {
      const fn = mockFetch({
        success: true,
        calculation: {
          participant_id: 'p_no_link',
          tax_year: 2025,
          gross_payments: 500,
          transaction_count: 2,
          requires_1099: false,
          monthly_totals: { '2025-06': 250, '2025-07': 250 },
          threshold: 600,
          linked_user_id: null,
          shared_tax_profile: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.calculateTaxForParticipant('p_no_link', 2025)

      expect(result.calculation.participantId).toBe('p_no_link')
      expect(result.calculation.linkedUserId).toBeNull()
      expect(result.calculation.sharedTaxProfile).toBeNull()
      expect(result.calculation.requires1099).toBe(false)
      expect(result.calculation.monthlyTotals).toEqual({ '2025-06': 250, '2025-07': 250 })
    })

    // --- WEBHOOK: createWebhookEndpoint, updateWebhookEndpoint, testWebhookEndpoint ---

    it('createWebhookEndpoint maps secret and message', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'wh_new',
          url: 'https://example.com/hook',
          description: 'New hook',
          events: ['*'],
          is_active: true,
          created_at: '2026-03-10',
          secret_rotated_at: null,
          secret: 'whsec_new_secret',
        },
        message: 'Endpoint created',
      })
      const sdk = createClient(fn)
      const result = await sdk.createWebhookEndpoint({
        url: 'https://example.com/hook',
        description: 'New hook',
      })

      expect(result.success).toBe(true)
      expect(result.data.id).toBe('wh_new')
      expect(result.data.secret).toBe('whsec_new_secret')
      expect(result.data.isActive).toBe(true)
      expect(result.message).toBe('Endpoint created')
    })

    it('createWebhookEndpoint returns null secret when missing', async () => {
      const fn = mockFetch({
        success: true,
        data: { id: 'wh_no_secret', url: 'https://example.com', events: [], is_active: false, created_at: '' },
      })
      const sdk = createClient(fn)
      const result = await sdk.createWebhookEndpoint({ url: 'https://example.com' })

      expect(result.data.secret).toBeNull()
      expect(result.message).toBeUndefined()
    })

    it('updateWebhookEndpoint maps response', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          id: 'wh_upd',
          url: 'https://example.com/updated',
          description: 'Updated',
          events: ['sale.completed'],
          is_active: false,
          created_at: '2026-03-10',
          secret_rotated_at: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.updateWebhookEndpoint('wh_upd', {
        url: 'https://example.com/updated',
        isActive: false,
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.is_active).toBe(false)
      expect(result.data.id).toBe('wh_upd')
      expect(result.data.isActive).toBe(false)
    })

    it('testWebhookEndpoint maps delivery info with number types', async () => {
      const fn = mockFetch({
        success: true,
        data: {
          delivered: true,
          status: 200,
          response_time_ms: 150,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.testWebhookEndpoint('wh_test')

      expect(result.success).toBe(true)
      expect(result.data.delivered).toBe(true)
      expect(result.data.status).toBe(200)
      expect(result.data.responseTimeMs).toBe(150)
      expect(result.error).toBeUndefined()
    })

    it('testWebhookEndpoint returns null for non-number status', async () => {
      const fn = mockFetch({
        success: false,
        error: 'Connection refused',
        data: {
          delivered: false,
          status: 'n/a',
          response_time_ms: 'timeout',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.testWebhookEndpoint('wh_fail')

      expect(result.data.delivered).toBe(false)
      expect(result.data.status).toBeNull()
      expect(result.data.responseTimeMs).toBeNull()
      expect(result.error).toBe('Connection refused')
    })

    // --- PARTICIPANT: getParticipantPayoutEligibility defaults ---

    it('getParticipantPayoutEligibility defaults when eligibility is null', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.getParticipantPayoutEligibility('p_none')

      expect(result.eligibility.participantId).toBe('p_none')
      expect(result.eligibility.eligible).toBe(false)
      expect(result.eligibility.availableBalance).toBe(0)
      expect(result.eligibility.issues).toEqual([])
      expect(result.eligibility.requirements).toEqual({})
    })

    // --- getSummary: aggregation logic ---

    it('getSummary aggregates participant balances', async () => {
      const fn = mockFetch({
        success: true,
        participants: [
          { ledger_balance: 100, held_amount: 10, available_balance: 90 },
          { ledger_balance: 200, held_amount: 20, available_balance: 180 },
          { ledger_balance: 0, held_amount: 0, available_balance: 0 },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.getSummary()

      expect(result.success).toBe(true)
      expect(result.data.total_ledger_balance).toBe(300)
      expect(result.data.total_held_amount).toBe(30)
      expect(result.data.total_available_balance).toBe(270)
      expect(result.data.participant_count).toBe(3)
    })

    it('getSummary handles empty participants array', async () => {
      const fn = mockFetch({ success: true, participants: [] })
      const sdk = createClient(fn)
      const result = await sdk.getSummary()

      expect(result.data.total_ledger_balance).toBe(0)
      expect(result.data.total_held_amount).toBe(0)
      expect(result.data.total_available_balance).toBe(0)
      expect(result.data.participant_count).toBe(0)
    })

    it('getSummary handles missing participants key', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.getSummary()

      expect(result.data.participant_count).toBe(0)
    })

    // --- ESCROW SUMMARY ---

    it('getEscrowSummary returns empty object when summary missing', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.getEscrowSummary()

      expect(result.success).toBe(true)
      expect(result.summary).toEqual({})
    })

    // --- PREFLIGHT CONVENIENCE METHODS ---

    it('preflightAndRecordExpense returns only preflight when blocked', async () => {
      const fn = mockFetch({
        success: true,
        cached: false,
        message: 'blocked',
        decision: {
          id: 'dec_blocked',
          decision: 'blocked',
          violated_policies: [{ policy_id: 'p1', policy_type: 'budget_cap', severity: 'hard', reason: 'over limit' }],
          expires_at: '2026-03-20',
          created_at: '2026-03-16',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.preflightAndRecordExpense(
        { idempotencyKey: 'ik_1', amount: 50000 },
        { referenceId: 'exp_1', amount: 50000 },
      )

      expect(result.preflight.decision.decision).toBe('blocked')
      expect(result.transaction).toBeUndefined()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('preflightAndRecordExpense records expense when allowed', async () => {
      const preflightFn = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            success: true, cached: false, message: 'allowed',
            decision: { id: 'dec_allow', decision: 'allowed', violated_policies: [], expires_at: '2026-03-20', created_at: '2026-03-16' },
          }),
          text: () => Promise.resolve(''),
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ success: true, transaction_id: 'txn_exp' }),
          text: () => Promise.resolve(''),
          headers: new Map(),
        })
      const sdk = createClient(preflightFn)
      const result = await sdk.preflightAndRecordExpense(
        { idempotencyKey: 'ik_2', amount: 1000 },
        { referenceId: 'exp_2', amount: 1000 },
      )

      expect(result.preflight.decision.decision).toBe('allowed')
      expect(result.transaction).toBeDefined()
      expect(result.transaction.transaction_id).toBe('txn_exp')

      // Verify the expense was called with the decision id
      const expenseBody = JSON.parse(preflightFn.mock.calls[1][1].body)
      expect(expenseBody.authorization_decision_id).toBe('dec_allow')
    })

    it('preflightAndRecordBill returns only preflight when blocked', async () => {
      const fn = mockFetch({
        success: true, cached: false, message: 'blocked',
        decision: { id: 'dec_b', decision: 'blocked', violated_policies: [], expires_at: null, created_at: '2026-03-16' },
      })
      const sdk = createClient(fn)
      const result = await sdk.preflightAndRecordBill(
        { idempotencyKey: 'ik_3', amount: 10000 },
        { amount: 10000, description: 'Bill', vendorName: 'V' },
      )

      expect(result.preflight.decision.decision).toBe('blocked')
      expect(result.transaction).toBeUndefined()
    })

    // --- requestGetRaw error path (used by exportTaxDocuments CSV) ---

    it('exportTaxDocuments CSV throws on non-OK response', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('{"error":"Internal error"}'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)

      await expect(sdk.exportTaxDocuments(2025, 'csv')).rejects.toThrow('Internal error')
    })

    it('exportTaxDocuments CSV throws with raw text when JSON parse fails', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)

      await expect(sdk.exportTaxDocuments(2025, 'csv')).rejects.toThrow('Bad Gateway')
    })

    // --- requestRaw error path (used by exportReport CSV) ---

    it('exportReport CSV throws on non-OK response with JSON error', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('{"error":"Forbidden"}'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)

      try {
        await sdk.exportReport({ reportType: 'transaction_detail', format: 'csv' })
        expect.unreachable('should have thrown')
      } catch (err: any) {
        expect(err).toBeInstanceOf(SoledgicError)
        expect(err.message).toBe('Forbidden')
      }
    })

    it('exportReport CSV throws with raw text when JSON parse fails', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Gateway Timeout'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)

      try {
        await sdk.exportReport({ reportType: 'transaction_detail', format: 'csv' })
        expect.unreachable('should have thrown')
      } catch (err: any) {
        expect(err).toBeInstanceOf(SoledgicError)
        expect(err.message).toBe('Gateway Timeout')
      }
    })

    // --- requestDelete error path ---

    it('unmatchTransaction throws on non-OK DELETE response', async () => {
      const fn = mockFetch({ error: 'Not found' }, 404)
      vi.stubGlobal('fetch', fn)
      const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })

      await expect(sdk.unmatchTransaction('txn_bad')).rejects.toThrow('Not found')
    })

    // --- apiVersion whitespace trim ---

    it('apiVersion trims whitespace and falls back to default', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn, { apiVersion: '   ' })
      await sdk.runHealthCheck()

      const headers = fn.mock.calls[0][1].headers
      expect(headers['Soledgic-Version']).toBe('2026-03-01')
    })

    // --- getParticipant with null fallback fields ---

    it('getParticipant maps null fallbacks for all optional fields', async () => {
      const fn = mockFetch({
        success: true,
        participant: {
          id: 'p_sparse',
          // all nullable fields missing
          ledger_balance: 0,
          held_amount: 0,
          available_balance: 0,
          holds: [],
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getParticipant('p_sparse')

      expect(result.participant.linkedUserId).toBeNull()
      expect(result.participant.name).toBeNull()
      expect(result.participant.tier).toBeNull()
      expect(result.participant.customSplitPercent).toBeNull()
      expect(result.participant.holds).toEqual([])
    })

    it('getParticipant maps hold with null reason and releaseDate', async () => {
      const fn = mockFetch({
        success: true,
        participant: {
          id: 'p_holds',
          ledger_balance: 100,
          held_amount: 50,
          available_balance: 50,
          holds: [
            { amount: 50, status: 'held' },
          ],
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getParticipant('p_holds')

      expect(result.participant.holds[0].reason).toBeNull()
      expect(result.participant.holds[0].releaseDate).toBeNull()
      expect(result.participant.holds[0].amount).toBe(50)
      expect(result.participant.holds[0].status).toBe('held')
    })

    // --- createParticipant with linked_user_id ---

    it('createParticipant maps linked_user_id null fallback', async () => {
      const fn = mockFetch({
        success: true,
        participant: {
          id: 'p_no_link',
          account_id: 'acct_no_link',
          // linked_user_id missing -> null
          display_name: 'NoLink',
          email: 'no@link.com',
          default_split_percent: 70,
          payout_preferences: {},
          created_at: '2026-03-16',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createParticipant({ participantId: 'p_no_link' })

      expect(result.participant.linkedUserId).toBeNull()
      expect(result.participant.displayName).toBe('NoLink')
      expect(result.participant.payoutPreferences).toEqual({})
    })

    // =========================================================================
    // WAVE 2: Kill remaining survived mutants in webhooks.ts, helpers.ts, client.ts
    // =========================================================================

    // --- timingSafeEqual: XOR logic, loop bounds, length check ---

    it('timingSafeEqual returns true for identical strings', () => {

      expect(timingSafeEqual('abc', 'abc')).toBe(true)
    })

    it('timingSafeEqual returns false for different strings same length', () => {

      expect(timingSafeEqual('abc', 'abd')).toBe(false)
    })

    it('timingSafeEqual returns false for different lengths', () => {

      expect(timingSafeEqual('abc', 'ab')).toBe(false)
      expect(timingSafeEqual('ab', 'abc')).toBe(false)
    })

    it('timingSafeEqual returns true for empty strings', () => {

      expect(timingSafeEqual('', '')).toBe(true)
    })

    it('timingSafeEqual returns false for empty vs non-empty', () => {

      expect(timingSafeEqual('', 'a')).toBe(false)
      expect(timingSafeEqual('a', '')).toBe(false)
    })

    it('timingSafeEqual returns false for strings differing only in first char', () => {

      expect(timingSafeEqual('xbc', 'abc')).toBe(false)
    })

    it('timingSafeEqual returns false for strings differing only in last char', () => {

      expect(timingSafeEqual('abx', 'abc')).toBe(false)
    })

    it('timingSafeEqual single character match and mismatch', () => {

      expect(timingSafeEqual('a', 'a')).toBe(true)
      expect(timingSafeEqual('a', 'b')).toBe(false)
    })

    // --- webhookPayloadToString: type checks ---

    it('webhookPayloadToString returns string input as-is', () => {

      expect(webhookPayloadToString('hello')).toBe('hello')
    })

    it('webhookPayloadToString converts object to JSON', () => {

      expect(webhookPayloadToString({ key: 'val' })).toBe('{"key":"val"}')
    })

    it('webhookPayloadToString decodes ArrayBuffer', () => {

      const buffer = new TextEncoder().encode('test payload').buffer
      expect(webhookPayloadToString(buffer)).toBe('test payload')
    })

    it('webhookPayloadToString decodes Uint8Array', () => {

      const arr = new TextEncoder().encode('uint8 data')
      expect(webhookPayloadToString(arr)).toBe('uint8 data')
    })

    it('webhookPayloadToString handles empty string', () => {

      expect(webhookPayloadToString('')).toBe('')
    })

    it('webhookPayloadToString handles empty object', () => {

      expect(webhookPayloadToString({})).toBe('{}')
    })

    // --- isArrayBufferView ---

    it('isArrayBufferView returns true for Uint8Array', () => {

      expect(isArrayBufferView(new Uint8Array([1, 2]))).toBe(true)
    })

    it('isArrayBufferView returns false for string', () => {

      expect(isArrayBufferView('hello')).toBe(false)
    })

    it('isArrayBufferView returns false for null', () => {

      expect(isArrayBufferView(null)).toBe(false)
    })

    it('isArrayBufferView returns false for plain object', () => {

      expect(isArrayBufferView({ buffer: new ArrayBuffer(0) })).toBe(false)
    })

    // --- parseWebhookSignatureHeader: split parsing ---

    it('parseWebhookSignatureHeader returns empty result for empty string', () => {

      const result = parseWebhookSignatureHeader('')
      expect(result.timestamp).toBeNull()
      expect(result.v1Signatures).toEqual([])
      expect(result.legacySignature).toBeNull()
    })

    it('parseWebhookSignatureHeader parses legacy sha256= prefix', () => {

      const result = parseWebhookSignatureHeader('sha256=abcdef1234')
      expect(result.timestamp).toBeNull()
      expect(result.v1Signatures).toEqual([])
      expect(result.legacySignature).toBe('abcdef1234')
    })

    it('parseWebhookSignatureHeader parses t= and v1= components', () => {

      const result = parseWebhookSignatureHeader('t=1234567890,v1=sig1,v1=sig2')
      expect(result.timestamp).toBe(1234567890)
      expect(result.v1Signatures).toEqual(['sig1', 'sig2'])
      expect(result.legacySignature).toBeNull()
    })

    it('parseWebhookSignatureHeader handles non-numeric timestamp', () => {

      const result = parseWebhookSignatureHeader('t=notanumber,v1=sig1')
      expect(result.timestamp).toBeNull()
      expect(result.v1Signatures).toEqual(['sig1'])
    })

    it('parseWebhookSignatureHeader ignores parts without = separator', () => {

      const result = parseWebhookSignatureHeader('t=100,noseparator,v1=sig')
      expect(result.timestamp).toBe(100)
      expect(result.v1Signatures).toEqual(['sig'])
    })

    it('parseWebhookSignatureHeader ignores unknown keys', () => {

      const result = parseWebhookSignatureHeader('t=200,v2=unknown,v1=real')
      expect(result.timestamp).toBe(200)
      expect(result.v1Signatures).toEqual(['real'])
    })

    // --- parseWebhookEvent: type/event field extraction ---

    it('parseWebhookEvent extracts type field', () => {

      const result = parseWebhookEvent('{"type":"sale.completed","id":"evt_1","created_at":"2026-01-01","livemode":true,"data":{"amount":100}}')
      expect(result.type).toBe('sale.completed')
      expect(result.id).toBe('evt_1')
      expect(result.createdAt).toBe('2026-01-01')
      expect(result.livemode).toBe(true)
      expect(result.data).toEqual({ amount: 100 })
    })

    it('parseWebhookEvent falls back to event field when type is missing', () => {

      const result = parseWebhookEvent('{"event":"payment.received","id":"evt_2"}')
      expect(result.type).toBe('payment.received')
    })

    it('parseWebhookEvent returns unknown when neither type nor event is string', () => {

      const result = parseWebhookEvent('{"id":"evt_3"}')
      expect(result.type).toBe('unknown')
    })

    it('parseWebhookEvent returns null for missing optional fields', () => {

      const result = parseWebhookEvent('{"type":"test"}')
      expect(result.id).toBeNull()
      expect(result.createdAt).toBeNull()
      expect(result.livemode).toBeNull()
      expect(result.data).toBeNull()
    })

    it('parseWebhookEvent accepts object payload', () => {

      const result = parseWebhookEvent({ type: 'obj.event', id: 'e4', data: { x: 1 } })
      expect(result.type).toBe('obj.event')
      expect(result.id).toBe('e4')
      expect(result.data).toEqual({ x: 1 })
    })

    it('parseWebhookEvent returns raw parsed object', () => {

      const result = parseWebhookEvent('{"type":"test","extra":"field"}')
      expect(result.raw).toEqual({ type: 'test', extra: 'field' })
    })

    // --- verifyWebhookSignature: tolerance, toEpochSeconds, edge cases ---

    it('verifyWebhookSignature returns false when timestamp is null', async () => {

      const result = await verifyWebhookSignature('payload', 'invalid', 'secret')
      expect(result).toBe(false)
    })

    it('verifyWebhookSignature returns false when no v1 signatures', async () => {

      const result = await verifyWebhookSignature('payload', 't=1234567890', 'secret')
      expect(result).toBe(false)
    })

    it('verifyWebhookSignature rejects expired timestamp', async () => {

      const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 minutes ago
      const sig = `t=${oldTimestamp},v1=fakesig`
      const result = await verifyWebhookSignature('payload', sig, 'secret', { toleranceSeconds: 300 })
      expect(result).toBe(false)
    })

    it('verifyWebhookSignature validates correct v1 signature', async () => {
      const payload = '{"test":"data"}'
      const secret = 'whsec_test_secret'
      const timestamp = Math.floor(Date.now() / 1000)
      const header = await buildWebhookSignature(payload, secret, timestamp)


      const result = await verifyWebhookSignature(payload, header, secret, { now: timestamp })
      expect(result).toBe(true)
    })

    it('verifyWebhookSignature validates legacy sha256= signature', async () => {
      const payload = 'legacy-payload'
      const secret = 'test-secret'

      const expected = await hmacHex(secret, payload)

      const result = await verifyWebhookSignature(payload, `sha256=${expected}`, secret)
      expect(result).toBe(true)
    })

    it('verifyWebhookSignature rejects wrong legacy signature', async () => {

      const result = await verifyWebhookSignature('payload', 'sha256=wronghex', 'secret')
      expect(result).toBe(false)
    })

    it('verifyWebhookSignature skips tolerance when set to 0', async () => {
      const payload = 'test'
      const secret = 'sec'
      const timestamp = 1 // very old timestamp
      const header = await buildWebhookSignature(payload, secret, timestamp)


      const result = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 0,
        now: timestamp,
      })
      expect(result).toBe(true)
    })

    it('verifyWebhookSignature uses Date object for now option', async () => {
      const payload = 'test-date'
      const secret = 'sec-date'
      const timestamp = Math.floor(Date.now() / 1000)
      const header = await buildWebhookSignature(payload, secret, timestamp)


      const result = await verifyWebhookSignature(payload, header, secret, {
        now: new Date(timestamp * 1000),
      })
      expect(result).toBe(true)
    })

    // --- resolveWebhookEndpointUrl: edge cases ---

    it('resolveWebhookEndpointUrl returns string endpointUrl directly', () => {

      expect(resolveWebhookEndpointUrl(undefined, 'https://hook.example.com')).toBe('https://hook.example.com')
    })

    it('resolveWebhookEndpointUrl extracts url from first array element', () => {

      expect(resolveWebhookEndpointUrl([{ url: 'https://arr.example.com' }], undefined)).toBe('https://arr.example.com')
    })

    it('resolveWebhookEndpointUrl returns null for array with non-string url', () => {

      expect(resolveWebhookEndpointUrl([{ url: 123 }], undefined)).toBeNull()
    })

    it('resolveWebhookEndpointUrl returns null for empty array', () => {

      expect(resolveWebhookEndpointUrl([], undefined)).toBeNull()
    })

    it('resolveWebhookEndpointUrl extracts url from object', () => {

      expect(resolveWebhookEndpointUrl({ url: 'https://obj.example.com' }, undefined)).toBe('https://obj.example.com')
    })

    it('resolveWebhookEndpointUrl returns null for object without url', () => {

      expect(resolveWebhookEndpointUrl({ notUrl: 'x' }, undefined)).toBeNull()
    })

    it('resolveWebhookEndpointUrl returns null when both args are null', () => {

      expect(resolveWebhookEndpointUrl(null, null)).toBeNull()
    })

    it('resolveWebhookEndpointUrl returns null for undefined', () => {

      expect(resolveWebhookEndpointUrl(undefined, undefined)).toBeNull()
    })

    it('resolveWebhookEndpointUrl prefers endpointUrl string over array', () => {

      expect(resolveWebhookEndpointUrl([{ url: 'https://arr.com' }], 'https://direct.com')).toBe('https://direct.com')
    })

    // --- mapWebhookDelivery endpointUrl resolution through resolveWebhookEndpointUrl ---

    it('mapWebhookDelivery resolves endpointUrl from webhook_endpoints array', () => {
      const result = mapWebhookDelivery({
        id: 'd_arr',
        webhook_endpoints: [{ url: 'https://from-array.com' }],
        event_type: 'test',
        status: 'pending',
        created_at: '2026-01-01',
      })
      expect(result.endpointUrl).toBe('https://from-array.com')
    })

    it('mapWebhookDelivery resolves endpointUrl from endpoint_url string', () => {
      const result = mapWebhookDelivery({
        id: 'd_str',
        endpoint_url: 'https://direct-url.com',
        event_type: 'test',
        status: 'pending',
        created_at: '2026-01-01',
      })
      expect(result.endpointUrl).toBe('https://direct-url.com')
    })

    it('mapWebhookDelivery returns null endpointUrl when neither present', () => {
      const result = mapWebhookDelivery({
        id: 'd_none',
        event_type: 'test',
        status: 'pending',
        created_at: '2026-01-01',
      })
      expect(result.endpointUrl).toBeNull()
    })

    it('mapWebhookDelivery nextRetryAt maps when present', () => {
      const result = mapWebhookDelivery({
        id: 'd_retry',
        next_retry_at: '2026-03-20T12:00:00Z',
        event_type: 'test',
        status: 'failed',
        created_at: '2026-01-01',
      })
      expect(result.nextRetryAt).toBe('2026-03-20T12:00:00Z')
    })

    // --- mapWebhookEndpoint: events array filtering ---

    it('mapWebhookEndpoint filters non-string events', () => {
      const result = mapWebhookEndpoint({
        id: 'wh_filter',
        events: ['valid.event', 123, null, 'another.event'],
        created_at: '2026-01-01',
      })
      expect(result.events).toEqual(['valid.event', 'another.event'])
    })

    // --- client.ts: error code extraction from "code" field ---

    it('error extracts code from code field when error_code missing', async () => {
      const fn = mockFetch({ error: 'Conflict', code: 'duplicate_entry' }, 409)
      const sdk = createClient(fn)
      try {
        await sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 })
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictError)
        expect(err.code).toBe('duplicate_entry')
      }
    })

    it('error prefers error_code over code', async () => {
      const fn = mockFetch({ error: 'Bad', error_code: 'specific_code', code: 'generic_code' }, 400)
      const sdk = createClient(fn)
      try {
        await sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 })
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ValidationError)
        expect(err.code).toBe('specific_code')
      }
    })

    it('error code is undefined when neither error_code nor code is string', async () => {
      const fn = mockFetch({ error: 'Server error', code: 42 }, 500)
      const sdk = createClient(fn)
      try {
        await sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 })
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(SoledgicError)
        expect(err.code).toBeUndefined()
      }
    })

    // --- client.ts: request fallback error message ---

    it('request uses fallback message when data.error is missing', async () => {
      const fn = mockFetch({ detail: 'something' }, 422)
      const sdk = createClient(fn)
      try {
        await sdk.recordSale({ referenceId: 'r', creatorId: 'c', amount: 100 })
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err.message).toBe('Request failed: 422')
      }
    })

    it('requestGet uses fallback message when data.error is missing', async () => {
      const fn = mockFetch({ detail: 'something' }, 503)
      const sdk = createClient(fn)
      try {
        await sdk.getAPAging()
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err.message).toBe('Request failed: 503')
      }
    })

    // --- client.ts: requestRaw non-JSON error body ---

    it('requestRaw falls back to text when JSON parse fails on error', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)
      try {
        await sdk.exportReport({ reportType: 'summary', format: 'csv' })
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(SoledgicError)
        expect(err.message).toBe('Service Unavailable')
        expect(err.status).toBe(503)
        expect(err.details).toEqual({ error: 'Service Unavailable' })
      }
    })

    it('requestRaw uses parsed JSON error when available', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"error":"Bad request body","error_code":"parse_error"}'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)
      try {
        await sdk.exportReport({ reportType: 'summary', format: 'csv' })
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ValidationError)
        expect(err.message).toBe('Bad request body')
        expect(err.code).toBe('parse_error')
      }
    })

    // --- client.ts: requestGetRaw non-JSON error body ---

    it('requestGetRaw falls back to text when JSON parse fails on error', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway from CDN'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)
      try {
        await sdk.exportTaxDocuments(2025, 'csv')
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err.message).toBe('Bad Gateway from CDN')
        expect(err.status).toBe(502)
      }
    })

    it('requestGetRaw uses parsed JSON error when available', async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error":"Unauthorized export"}'),
        headers: new Headers({}),
      })
      const sdk = createClient(fn)
      try {
        await sdk.exportTaxDocuments(2025, 'csv')
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(AuthenticationError)
        expect(err.message).toBe('Unauthorized export')
      }
    })

    // --- client.ts: requestDelete fallback error message ---

    it('requestDelete uses fallback message when data.error missing', async () => {
      const fn = mockFetch({ detail: 'not found' }, 404)
      vi.stubGlobal('fetch', fn)
      const sdk = new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
      try {
        await sdk.unmatchTransaction('txn_x')
        expect.unreachable('should throw')
      } catch (err: any) {
        expect(err).toBeInstanceOf(NotFoundError)
        expect(err.message).toBe('Request failed: 404')
      }
    })

    // --- client.ts: reverseTransaction transactionId fallback chain ---

    it('reverseTransaction falls back to original_transaction_id', async () => {
      const fn = mockFetch({
        success: true,
        void_type: 'void',
        message: 'Done',
        original_transaction_id: 'orig_tx',
        // transaction_id missing
      })
      const sdk = createClient(fn)
      const result = await sdk.reverseTransaction({ transactionId: 'req_tx', reason: 'test' })

      expect(result.transactionId).toBe('orig_tx')
    })

    it('reverseTransaction falls back to request transactionId when both are missing', async () => {
      const fn = mockFetch({
        success: true,
        void_type: 'void',
        message: 'Done',
        // both transaction_id and original_transaction_id missing
      })
      const sdk = createClient(fn)
      const result = await sdk.reverseTransaction({ transactionId: 'from_req', reason: 'test' })

      expect(result.transactionId).toBe('from_req')
    })

    // --- client.ts: createCheckoutSession validation ---

    it('createCheckoutSession throws when neither paymentMethodId nor successUrl', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await expect(() => sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
      } as any)).rejects.toThrow('Either paymentMethodId/sourceId or successUrl is required')
    })

    it('createCheckoutSession hasPaymentMethod is false when paymentMethodId is empty string', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await expect(sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: '',
      } as any)).rejects.toThrow('Either paymentMethodId/sourceId or successUrl is required')
    })

    // --- client.ts: checkPayoutEligibility Boolean() and defaults ---

    it('checkPayoutEligibility maps eligible false explicitly', async () => {
      const fn = mockFetch({
        success: true,
        eligibility: {
          participant_id: 'p_ineligible',
          eligible: false,
          available_balance: 0,
          issues: ['No bank account'],
          requirements: { bank_account: true },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.checkPayoutEligibility('p_ineligible')

      expect(result.eligible).toBe(false)
      expect(result.available_balance).toBe(0)
      expect(result.issues).toEqual(['No bank account'])
      expect(result.requirements).toEqual({ bank_account: true })
    })

    // --- client.ts: listParticipants null fallbacks ---

    it('listParticipants maps all fields with null fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        participants: [
          {
            id: 'p_full',
            linked_user_id: 'u_1',
            name: 'Alice',
            tier: 'gold',
            ledger_balance: 10000,
            held_amount: 500,
            available_balance: 9500,
          },
          {
            id: 'p_sparse',
            // all nullable fields missing
            ledger_balance: 0,
            held_amount: 0,
            available_balance: 0,
          },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listParticipants()

      expect(result.participants[0].linkedUserId).toBe('u_1')
      expect(result.participants[0].name).toBe('Alice')
      expect(result.participants[0].tier).toBe('gold')

      expect(result.participants[1].linkedUserId).toBeNull()
      expect(result.participants[1].name).toBeNull()
      expect(result.participants[1].tier).toBeNull()
    })

    // --- client.ts: listRefunds full field mapping ---

    it('listRefunds maps all fields with null fallbacks', async () => {
      const fn = mockFetch({
        success: true,
        count: 2,
        refunds: [
          {
            id: 'rf_1',
            transaction_id: 'tx_rf1',
            reference_id: 'ref_rf1',
            sale_reference: 'sale_1',
            refunded_amount: 5000,
            currency: 'USD',
            status: 'completed',
            reason: 'Customer request',
            refund_from: 'platform',
            external_refund_id: 'ext_1',
            created_at: '2026-03-10',
            breakdown: { from_creator: 3000, from_platform: 2000 },
            repair_pending: false,
            last_error: null,
          },
          {
            id: 'rf_2',
            refunded_amount: 100,
            currency: 'EUR',
            status: 'pending',
            // all nullable fields missing
          },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.listRefunds()

      expect(result.count).toBe(2)
      expect(result.refunds[0].transactionId).toBe('tx_rf1')
      expect(result.refunds[0].referenceId).toBe('ref_rf1')
      expect(result.refunds[0].saleReference).toBe('sale_1')
      expect(result.refunds[0].reason).toBe('Customer request')
      expect(result.refunds[0].refundFrom).toBe('platform')
      expect(result.refunds[0].externalRefundId).toBe('ext_1')
      expect(result.refunds[0].createdAt).toBe('2026-03-10')
      expect(result.refunds[0].breakdown!.fromCreator).toBe(3000)
      expect(result.refunds[0].breakdown!.fromPlatform).toBe(2000)
      expect(result.refunds[0].repairPending).toBe(false)
      expect(result.refunds[0].lastError).toBeNull()

      expect(result.refunds[1].transactionId).toBeNull()
      expect(result.refunds[1].referenceId).toBeNull()
      expect(result.refunds[1].saleReference).toBeNull()
      expect(result.refunds[1].reason).toBeNull()
      expect(result.refunds[1].refundFrom).toBeNull()
      expect(result.refunds[1].externalRefundId).toBeNull()
      expect(result.refunds[1].createdAt).toBeNull()
      expect(result.refunds[1].breakdown).toBeNull()
      expect(result.refunds[1].repairPending).toBeNull()
      expect(result.refunds[1].lastError).toBeNull()
    })

    it('listRefunds defaults count from array length when count missing', async () => {
      const fn = mockFetch({
        success: true,
        refunds: [{ id: 'r1', refunded_amount: 100, currency: 'USD', status: 'done' }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listRefunds()

      expect(result.count).toBe(1)
    })

    it('listRefunds defaults to empty array when refunds key missing', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.listRefunds()

      expect(result.refunds).toEqual([])
      expect(result.count).toBe(0)
    })

    // --- client.ts: sendBreachAlert defaults ---

    it('sendBreachAlert defaults alertsSent to 0 when missing', async () => {
      const fn = mockFetch({
        success: true,
        message: 'No configs',
        // alerts_sent missing -> ?? 0
      })
      const sdk = createClient(fn)
      const result = await sdk.sendBreachAlert({
        cashBalance: 100,
        pendingTotal: 100,
        shortfall: 0,
        coverageRatio: 1,
        triggeredBy: 'manual',
      })

      expect(result.alertsSent).toBe(0)
      expect(result.results).toBeUndefined()
    })

    // --- client.ts: evaluateFraud exhaustive field mapping ---

    it('evaluateFraud maps all fields including risk factors', async () => {
      const fn = mockFetch({
        success: true,
        cached: true,
        evaluation: {
          id: 'eval_1',
          signal: 'medium',
          risk_factors: [
            { policy_id: 'fp_1', policy_type: 'velocity', severity: 'soft', indicator: 'high_frequency' },
          ],
          valid_until: '2026-03-20',
          created_at: '2026-03-16',
          acknowledged_at: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.evaluateFraud({
        idempotencyKey: 'ik_eval',
        amount: 50000,
      })

      expect(result.success).toBe(true)
      expect(result.cached).toBe(true)
      expect(result.evaluation.id).toBe('eval_1')
      expect(result.evaluation.signal).toBe('medium')
      expect(result.evaluation.riskFactors).toHaveLength(1)
      expect(result.evaluation.riskFactors[0].policyId).toBe('fp_1')
      expect(result.evaluation.riskFactors[0].policyType).toBe('velocity')
      expect(result.evaluation.riskFactors[0].severity).toBe('soft')
      expect(result.evaluation.riskFactors[0].indicator).toBe('high_frequency')
      expect(result.evaluation.validUntil).toBe('2026-03-20')
      expect(result.evaluation.createdAt).toBe('2026-03-16')
      expect(result.evaluation.acknowledgedAt).toBeNull()
    })

    it('evaluateFraud defaults risk_factors to empty array', async () => {
      const fn = mockFetch({
        success: true,
        cached: false,
        evaluation: {
          id: 'eval_2',
          signal: 'low',
          // risk_factors missing -> || []
          valid_until: null,
          created_at: '2026-03-16',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.evaluateFraud({ idempotencyKey: 'ik_2', amount: 100 })

      expect(result.evaluation.riskFactors).toEqual([])
    })

    // --- client.ts: preflightAuthorization violated_policies mapping ---

    it('preflightAuthorization maps violated_policies with all fields', async () => {
      const fn = mockFetch({
        success: true,
        cached: false,
        message: 'reviewed',
        decision: {
          id: 'dec_pf',
          decision: 'allowed',
          violated_policies: [
            { policy_id: 'p1', policy_type: 'budget', severity: 'soft', reason: 'near limit' },
          ],
          expires_at: '2026-04-01',
          created_at: '2026-03-16',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.preflightAuthorization({
        idempotencyKey: 'ik_pf',
        amount: 1000,
      })

      expect(result.decision.violatedPolicies[0].policyId).toBe('p1')
      expect(result.decision.violatedPolicies[0].policyType).toBe('budget')
      expect(result.decision.violatedPolicies[0].severity).toBe('soft')
      expect(result.decision.violatedPolicies[0].reason).toBe('near limit')
      expect(result.decision.expiresAt).toBe('2026-04-01')
      expect(result.decision.createdAt).toBe('2026-03-16')
      expect(result.message).toBe('reviewed')
    })

    it('preflightAuthorization defaults violated_policies to empty array', async () => {
      const fn = mockFetch({
        success: true,
        cached: false,
        message: 'ok',
        decision: {
          id: 'dec_pf2',
          decision: 'allowed',
          // violated_policies missing -> || []
          expires_at: null,
          created_at: '2026-03-16',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.preflightAuthorization({ idempotencyKey: 'ik_pf2', amount: 100 })

      expect(result.decision.violatedPolicies).toEqual([])
    })

    // --- client.ts: calculateTaxForParticipant with sharedTaxProfile present ---

    it('calculateTaxForParticipant maps sharedTaxProfile with fields', async () => {
      const fn = mockFetch({
        success: true,
        calculation: {
          participant_id: 'p_tax',
          tax_year: 2025,
          gross_payments: 80000,
          transaction_count: 50,
          requires_1099: true,
          monthly_totals: {},
          threshold: 600,
          linked_user_id: 'u_tax',
          shared_tax_profile: {
            status: 'verified',
            legal_name: 'Test Corp LLC',
            tax_id_last4: '1234',
          },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.calculateTaxForParticipant('p_tax', 2025)

      expect(result.calculation.requires1099).toBe(true)
      expect(result.calculation.linkedUserId).toBe('u_tax')
      expect(result.calculation.sharedTaxProfile).not.toBeNull()
      expect(result.calculation.sharedTaxProfile!.status).toBe('verified')
      expect(result.calculation.sharedTaxProfile!.legalName).toBe('Test Corp LLC')
      expect(result.calculation.sharedTaxProfile!.taxIdLast4).toBe('1234')
    })

    it('calculateTaxForParticipant sharedTaxProfile null fallbacks in fields', async () => {
      const fn = mockFetch({
        success: true,
        calculation: {
          participant_id: 'p_tax2',
          tax_year: 2025,
          gross_payments: 100,
          transaction_count: 1,
          requires_1099: false,
          threshold: 600,
          shared_tax_profile: {
            status: 'pending',
            // legal_name missing -> null
            // tax_id_last4 missing -> null
          },
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.calculateTaxForParticipant('p_tax2')

      expect(result.calculation.sharedTaxProfile!.legalName).toBeNull()
      expect(result.calculation.sharedTaxProfile!.taxIdLast4).toBeNull()
    })

    // --- client.ts: generateTaxSummary with sharedTaxProfile present ---

    it('generateTaxSummary maps sharedTaxProfile with all fields', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        note: 'final',
        summaries: [{
          participant_id: 'p_1',
          linked_user_id: 'u_1',
          gross_earnings: 80000,
          refunds_issued: 1000,
          net_earnings: 79000,
          total_paid_out: 79000,
          requires_1099: true,
          shared_tax_profile: {
            status: 'verified',
            legal_name: 'Big Corp',
            tax_id_last4: '5678',
          },
        }],
        totals: {
          total_gross: 80000,
          total_refunds: 1000,
          total_net: 79000,
          total_paid: 79000,
          participants_requiring_1099: 1,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.generateTaxSummary(2025)

      expect(result.summaries[0].requires1099).toBe(true)
      expect(result.summaries[0].linkedUserId).toBe('u_1')
      expect(result.summaries[0].sharedTaxProfile!.status).toBe('verified')
      expect(result.summaries[0].sharedTaxProfile!.legalName).toBe('Big Corp')
      expect(result.summaries[0].sharedTaxProfile!.taxIdLast4).toBe('5678')
      expect(result.totals.participantsRequiring1099).toBe(1)
    })

    it('generateTaxSummary sharedTaxProfile null legalName and taxIdLast4', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        summaries: [{
          participant_id: 'p_sp',
          gross_earnings: 100,
          refunds_issued: 0,
          net_earnings: 100,
          total_paid_out: 50,
          requires_1099: false,
          shared_tax_profile: {
            status: 'pending',
          },
        }],
        totals: {
          total_gross: 100,
          total_refunds: 0,
          total_net: 100,
          total_paid: 50,
          participants_requiring_1099: 0,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.generateTaxSummary(2025)

      expect(result.summaries[0].sharedTaxProfile!.legalName).toBeNull()
      expect(result.summaries[0].sharedTaxProfile!.taxIdLast4).toBeNull()
    })

    // --- client.ts: createCheckoutSession Boolean(success) coercion ---

    it('createCheckoutSession coerces success to boolean', async () => {
      const fn = mockFetch({
        success: 1, // truthy but not boolean
        checkout_session: {
          id: 'cs_bool',
          mode: 'direct',
          payment_id: 'pay_1',
          status: 'completed',
          requires_action: false,
          amount: 1000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
      })

      expect(result.success).toBe(true)
      expect(typeof result.success).toBe('boolean')
    })

    // --- client.ts: createCheckoutSession mode defaults to direct ---

    it('createCheckoutSession defaults mode to direct when not session', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_nomode',
          // mode missing -> not 'session' -> defaults to 'direct'
          payment_id: 'pay_1',
          status: 'completed',
          requires_action: false,
          amount: 1000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
      })

      expect(result.checkoutSession.mode).toBe('direct')
    })

    // --- client.ts: createCheckoutSession currency default chain ---

    it('createCheckoutSession uses req.currency over USD default', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_cur',
          mode: 'session',
          status: 'pending',
          requires_action: false,
          amount: 2000,
          // currency missing in response
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 2000,
        participantId: 'p_1',
        currency: 'GBP',
        successUrl: 'https://example.com/ok',
      })

      expect(result.checkoutSession.currency).toBe('GBP')
    })

    // --- client.ts: createCheckoutSession id fallback chain ---

    it('createCheckoutSession id falls back to payment_id then payment_intent_id', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          // id missing
          payment_id: 'pay_fb',
          status: 'completed',
          requires_action: false,
          amount: 500,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 500,
        participantId: 'p_1',
        paymentMethodId: 'pm_fb',
      })

      expect(result.checkoutSession.id).toBe('pay_fb')
    })

    // --- client.ts: createWebhookEndpoint default events ---

    it('createWebhookEndpoint sends default events [*]', async () => {
      const fn = mockFetch({
        success: true,
        data: { id: 'wh_def', url: 'https://example.com', events: ['*'], is_active: true, created_at: '' },
      })
      const sdk = createClient(fn)
      await sdk.createWebhookEndpoint({ url: 'https://example.com' })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.events).toEqual(['*'])
    })

    // --- client.ts: rotateWebhookSecret mapping ---

    it('rotateWebhookSecret maps secret and message', async () => {
      const fn = mockFetch({
        success: true,
        data: { secret: 'whsec_rotated' },
        message: 'Secret rotated',
      })
      const sdk = createClient(fn)
      const result = await sdk.rotateWebhookSecret('wh_rot')

      expect(result.success).toBe(true)
      expect(result.data.secret).toBe('whsec_rotated')
      expect(result.message).toBe('Secret rotated')
    })

    it('rotateWebhookSecret returns null secret when missing', async () => {
      const fn = mockFetch({
        success: true,
        data: {},
      })
      const sdk = createClient(fn)
      const result = await sdk.rotateWebhookSecret('wh_rot2')

      expect(result.data.secret).toBeNull()
      expect(result.message).toBeUndefined()
    })

    // --- client.ts: deleteWebhookEndpoint and retryWebhookDelivery ---

    it('deleteWebhookEndpoint maps message', async () => {
      const fn = mockFetch({ success: true, message: 'Deleted' })
      const sdk = createClient(fn)
      const result = await sdk.deleteWebhookEndpoint('wh_del')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Deleted')
    })

    it('deleteWebhookEndpoint returns undefined message when missing', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.deleteWebhookEndpoint('wh_del2')

      expect(result.message).toBeUndefined()
    })

    it('retryWebhookDelivery maps message', async () => {
      const fn = mockFetch({ success: true, message: 'Retrying' })
      const sdk = createClient(fn)
      const result = await sdk.retryWebhookDelivery('d_retry')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Retrying')
    })

    // --- client.ts: getWebhookDeliveries with non-array data ---

    it('getWebhookDeliveries defaults to empty array when data is not array', async () => {
      const fn = mockFetch({ success: true, data: null })
      const sdk = createClient(fn)
      const result = await sdk.getWebhookDeliveries()

      expect(result.data).toEqual([])
    })

    // --- client.ts: listWebhookEndpoints with non-array data ---

    it('listWebhookEndpoints defaults to empty array when data is not array', async () => {
      const fn = mockFetch({ success: true, data: null })
      const sdk = createClient(fn)
      const result = await sdk.listWebhookEndpoints()

      expect(result.data).toEqual([])
    })

    // --- client.ts: listComplianceAccessPatterns exhaustive ---

    it('listComplianceAccessPatterns maps all pattern fields', async () => {
      const fn = mockFetch({
        success: true,
        window_hours: 24,
        count: 1,
        patterns: [{
          ip_address: '192.168.1.1',
          hour: '2026-03-16T10:00:00Z',
          request_count: 100,
          unique_actions: 5,
          actions: ['record-sale', 'generate-report'],
          max_risk_score: 30,
          failed_auths: 2,
        }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceAccessPatterns({ hours: 24, limit: 10 })

      expect(result.windowHours).toBe(24)
      expect(result.count).toBe(1)
      expect(result.patterns[0].ipAddress).toBe('192.168.1.1')
      expect(result.patterns[0].hour).toBe('2026-03-16T10:00:00Z')
      expect(result.patterns[0].requestCount).toBe(100)
      expect(result.patterns[0].uniqueActions).toBe(5)
      expect(result.patterns[0].actions).toEqual(['record-sale', 'generate-report'])
      expect(result.patterns[0].maxRiskScore).toBe(30)
      expect(result.patterns[0].failedAuths).toBe(2)
    })

    it('listComplianceAccessPatterns defaults actions to empty array', async () => {
      const fn = mockFetch({
        success: true,
        window_hours: 1,
        count: 1,
        patterns: [{
          ip_address: '10.0.0.1',
          hour: '2026-03-16T00:00:00Z',
          request_count: 1,
          unique_actions: 0,
          // actions missing -> || []
          max_risk_score: 0,
          failed_auths: 0,
        }],
      })
      const sdk = createClient(fn)
      const result = await sdk.listComplianceAccessPatterns()

      expect(result.patterns[0].actions).toEqual([])
    })

    // --- client.ts: createRefund with breakdown present ---

    it('createRefund maps breakdown fields', async () => {
      const fn = mockFetch({
        success: true,
        refund: {
          id: 'rf_bd',
          sale_reference: 'sale_bd',
          refunded_amount: 5000,
          currency: 'USD',
          status: 'completed',
          breakdown: { from_creator: 3500, from_platform: 1500 },
          is_full_refund: true,
          repair_pending: false,
        },
        warning: 'Balance low',
        warning_code: 'low_balance',
      })
      const sdk = createClient(fn)
      const result = await sdk.createRefund({ saleReference: 'sale_bd', reason: 'test' })

      expect(result.refund.breakdown).not.toBeNull()
      expect(result.refund.breakdown!.fromCreator).toBe(3500)
      expect(result.refund.breakdown!.fromPlatform).toBe(1500)
      expect(result.refund.isFullRefund).toBe(true)
      expect(result.refund.repairPending).toBe(false)
      expect(result.warning).toBe('Balance low')
      expect(result.warningCode).toBe('low_balance')
    })

    // --- client.ts: createRefund id falls back to transaction_id ---

    it('createRefund id falls back to transaction_id', async () => {
      const fn = mockFetch({
        success: true,
        refund: {
          // id missing, reference_id missing
          transaction_id: 'tx_fallback',
          sale_reference: 'sale_3',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createRefund({ saleReference: 'sale_3', reason: 'test' })

      expect(result.refund.id).toBe('tx_fallback')
    })

    // --- hmacHex: basic test ---

    it('hmacHex produces consistent hex output', async () => {

      const result = await hmacHex('secret', 'payload')
      expect(typeof result).toBe('string')
      expect(result).toMatch(/^[0-9a-f]{64}$/)

      // Same inputs produce same output
      const result2 = await hmacHex('secret', 'payload')
      expect(result).toBe(result2)
    })

    it('hmacHex different payloads produce different results', async () => {

      const a = await hmacHex('secret', 'payload-a')
      const b = await hmacHex('secret', 'payload-b')
      expect(a).not.toBe(b)
    })

    // --- client.ts: createPayout with full payout key ---

    it('createPayout maps all payout fields when present', async () => {
      const fn = mockFetch({
        success: true,
        payout: {
          id: 'po_full',
          transaction_id: 'tx_full',
          gross_amount: 10000,
          fees: 200,
          net_amount: 9800,
          previous_balance: 25000,
          new_balance: 15200,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createPayout({ participantId: 'p_1', amount: 10000 })

      expect(result.payout.id).toBe('po_full')
      expect(result.payout.transactionId).toBe('tx_full')
      expect(result.payout.grossAmount).toBe(10000)
      expect(result.payout.fees).toBe(200)
      expect(result.payout.netAmount).toBe(9800)
      expect(result.payout.previousBalance).toBe(25000)
      expect(result.payout.newBalance).toBe(15200)
    })

    // --- client.ts: createReconciliationSnapshot ---

    it('createReconciliationSnapshot maps snapshot_id and integrity_hash', async () => {
      const fn = mockFetch({
        success: true,
        snapshot: {
          id: 'snap_new',
          integrity_hash: 'hash_abc',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createReconciliationSnapshot({ periodId: 'period_1' })

      expect(result.success).toBe(true)
      expect(result.snapshot_id).toBe('snap_new')
      expect(result.integrity_hash).toBe('hash_abc')
    })

    // --- client.ts: createCreator maps all fields ---

    it('createCreator maps all response fields', async () => {
      const fn = mockFetch({
        success: true,
        participant: {
          id: 'c_1',
          account_id: 'acct_c1',
          display_name: 'Creator One',
          email: 'c1@test.com',
          default_split_percent: 80,
          payout_preferences: { schedule: 'monthly' },
          created_at: '2026-03-10',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCreator({
        creatorId: 'c_1',
        displayName: 'Creator One',
        email: 'c1@test.com',
      })

      expect(result.success).toBe(true)
      expect(result.creator.id).toBe('c_1')
      expect(result.creator.accountId).toBe('acct_c1')
      expect(result.creator.displayName).toBe('Creator One')
      expect(result.creator.email).toBe('c1@test.com')
      expect(result.creator.defaultSplitPercent).toBe(80)
      expect(result.creator.payoutPreferences).toEqual({ schedule: 'monthly' })
      expect(result.creator.createdAt).toBe('2026-03-10')
    })

    it('createCreator defaults payoutPreferences to empty object', async () => {
      const fn = mockFetch({
        success: true,
        participant: {
          id: 'c_2',
          account_id: 'acct_c2',
          // payout_preferences missing -> || {}
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCreator({
        creatorId: 'c_2',
        displayName: 'C2',
        email: 'c2@test.com',
      })

      expect(result.creator.payoutPreferences).toEqual({})
    })

    it('createCreator handles missing participant key', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      const result = await sdk.createCreator({
        creatorId: 'c_3',
        displayName: 'C3',
        email: 'c3@test.com',
      })

      // participant is {} from || {}
      expect(result.creator.id).toBeUndefined()
      expect(result.creator.payoutPreferences).toEqual({})
    })

    // --- client.ts: generateAllTaxDocuments ---

    it('generateAllTaxDocuments maps generation fields', async () => {
      const fn = mockFetch({
        success: true,
        generation: {
          tax_year: 2025,
          created: 10,
          skipped: 2,
          total_amount: 500000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.generateAllTaxDocuments(2025)

      expect(result.generation.taxYear).toBe(2025)
      expect(result.generation.created).toBe(10)
      expect(result.generation.skipped).toBe(2)
      expect(result.generation.totalAmount).toBe(500000)
    })

    // --- client.ts: markTaxDocumentFiled ---

    it('markTaxDocumentFiled maps document fields', async () => {
      const fn = mockFetch({
        success: true,
        document: {
          id: 'doc_filed',
          tax_year: 2025,
          status: 'filed',
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.markTaxDocumentFiled('doc_filed')

      expect(result.success).toBe(true)
      expect(result.document.id).toBe('doc_filed')
      expect(result.document.tax_year).toBe(2025)
      expect(result.document.status).toBe('filed')
    })

    // --- client.ts: createLedger maps all fields ---

    it('createLedger maps all response fields', async () => {
      const fn = mockFetch({
        success: true,
        ledger: {
          id: 'ledger_1',
          business_name: 'Test Biz',
          ledger_mode: 'marketplace',
          api_key: 'key_123',
          status: 'active',
          created_at: '2026-03-10',
        },
        warning: 'Demo mode',
      })
      const sdk = createClient(fn)
      const result = await sdk.createLedger({
        businessName: 'Test Biz',
        ownerEmail: 'owner@test.com',
        ledgerMode: 'marketplace',
      })

      expect(result.ledger.id).toBe('ledger_1')
      expect(result.ledger.businessName).toBe('Test Biz')
      expect(result.ledger.ledgerMode).toBe('marketplace')
      expect(result.ledger.apiKey).toBe('key_123')
      expect(result.ledger.status).toBe('active')
      expect(result.ledger.createdAt).toBe('2026-03-10')
      expect(result.warning).toBe('Demo mode')
    })

    // =========================================================================
    // WAVE 3: Kill remaining ~130 survived mutants toward 95% score
    // Targets: strict equality, ?? vs ||, Boolean() wrappers, boundary conditions,
    // string literal endpoints, fallback chains, XOR logic
    // =========================================================================

    // --- timingSafeEqual: kill XOR accumulation mutants ---

    it('timingSafeEqual: result |= detects differences even after initial match', () => {
      // If |= were replaced with =, only the last XOR would matter
      // 'aX' vs 'aY' - first chars match, second chars differ
      expect(timingSafeEqual('aX', 'aY')).toBe(false)
      // Verify the accumulation matters with longer strings
      expect(timingSafeEqual('abcXef', 'abcYef')).toBe(false)
    })

    it('timingSafeEqual: length XOR matters even when chars match up to shorter', () => {
      // aLen ^ bLen should produce non-zero when lengths differ
      // Even if all chars in the overlap match
      expect(timingSafeEqual('abc', 'abcd')).toBe(false)
      expect(timingSafeEqual('abcd', 'abc')).toBe(false)
    })

    it('timingSafeEqual: Math.max ensures loop covers both strings', () => {
      // If loop used min instead of max, trailing chars of longer string wouldn't be checked
      expect(timingSafeEqual('ab', 'ac')).toBe(false)
    })

    it('timingSafeEqual: charCodeAt(i) vs 0 for out-of-bounds', () => {
      // When i >= length, charCodeAt gives NaN; code uses 0 as default
      // This means the XOR of the extra char against 0 should be non-zero
      expect(timingSafeEqual('a', 'ab')).toBe(false)
    })

    it('timingSafeEqual: result === 0 returns true only for exact match', () => {
      // Strictly 0, not falsy
      expect(timingSafeEqual('abc', 'abc')).toBe(true)
      expect(timingSafeEqual('abc', 'abC')).toBe(false)
    })

    // --- hmacHex: byte-to-hex conversion, padStart ---

    it('hmacHex uses padStart(2, "0") for single-digit hex bytes', async () => {
      // padStart(2, '0') ensures bytes like 0x05 become '05' not '5'
      const result = await hmacHex('test', 'data')
      // All hex chars, length 64 (SHA-256 = 32 bytes = 64 hex chars)
      expect(result.length).toBe(64)
      expect(result).toMatch(/^[0-9a-f]+$/)
      // Removing padStart would shorten the output when a byte < 16
      // Different secrets produce different output
      const result2 = await hmacHex('different', 'data')
      expect(result).not.toBe(result2)
    })

    it('hmacHex different secrets produce different outputs', async () => {
      const a = await hmacHex('secret1', 'same-payload')
      const b = await hmacHex('secret2', 'same-payload')
      expect(a).not.toBe(b)
    })

    it('hmacHex empty payload still produces valid 64-char hex', async () => {
      const result = await hmacHex('key', '')
      expect(result.length).toBe(64)
      expect(result).toMatch(/^[0-9a-f]{64}$/)
    })

    // --- verifyWebhookSignature: tolerance boundary conditions ---

    it('verifyWebhookSignature: > vs >= tolerance boundary (exactly at tolerance passes)', async () => {
      const payload = '{"boundary":"test"}'
      const secret = 'boundary_secret'
      const timestamp = 1000000
      const header = await buildWebhookSignature(payload, secret, timestamp)

      // Exactly 300 seconds difference should pass (> not >=)
      const atBoundary = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 300,
        now: timestamp + 300,
      })
      expect(atBoundary).toBe(true)

      // 301 seconds should fail
      const pastBoundary = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 300,
        now: timestamp + 301,
      })
      expect(pastBoundary).toBe(false)
    })

    it('verifyWebhookSignature: negative time difference (future timestamp)', async () => {
      const payload = '{"future":"test"}'
      const secret = 'future_secret'
      const timestamp = 2000000
      const header = await buildWebhookSignature(payload, secret, timestamp)

      // now is BEFORE timestamp, Math.abs ensures this is checked
      const result = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 300,
        now: timestamp - 301,
      })
      expect(result).toBe(false)

      // But within tolerance should pass
      const result2 = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 300,
        now: timestamp - 300,
      })
      expect(result2).toBe(true)
    })

    it('verifyWebhookSignature: toleranceSeconds defaults to 300', async () => {
      const payload = '{"default":"tol"}'
      const secret = 'default_tol_sec'
      const timestamp = 3000000
      const header = await buildWebhookSignature(payload, secret, timestamp)

      // 300 seconds should pass with default tolerance
      const result = await verifyWebhookSignature(payload, header, secret, {
        now: timestamp + 300,
      })
      expect(result).toBe(true)

      // 301 should fail
      const result2 = await verifyWebhookSignature(payload, header, secret, {
        now: timestamp + 301,
      })
      expect(result2).toBe(false)
    })

    it('verifyWebhookSignature: .some() vs .every() on v1Signatures', async () => {
      const payload = '{"multi":"sig"}'
      const secret = 'multi_secret'
      const timestamp = 4000000
      const header = await buildWebhookSignature(payload, secret, timestamp)

      // Add a wrong signature alongside the correct one
      const wrongSig = 'deadbeef'.repeat(8)
      const multiHeader = `${header},v1=${wrongSig}`

      // .some() should still return true if ANY signature matches
      const result = await verifyWebhookSignature(payload, multiHeader, secret, {
        now: timestamp,
      })
      expect(result).toBe(true)
    })

    it('verifyWebhookSignature: all signatures wrong returns false', async () => {
      const payload = '{"all":"wrong"}'
      const header = 't=1000000,v1=aabbccdd,v1=11223344'

      const result = await verifyWebhookSignature(payload, header, 'secret', {
        toleranceSeconds: 0,
      })
      expect(result).toBe(false)
    })

    it('verifyWebhookSignature: timestamp.payload format in HMAC', async () => {
      // The HMAC is computed over `${timestamp}.${payload}` not just payload
      const payload = 'test-payload'
      const secret = 'test-secret'
      const timestamp = 5000000

      // Build correct signature
      const header = await buildWebhookSignature(payload, secret, timestamp)

      // Verify it passes
      const result = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 0,
        now: timestamp,
      })
      expect(result).toBe(true)

      // Using wrong timestamp should fail even with correct payload
      const wrongHeader = header.replace(`t=${timestamp}`, 't=9999999')
      const result2 = await verifyWebhookSignature(payload, wrongHeader, secret, {
        toleranceSeconds: 0,
        now: 9999999,
      })
      expect(result2).toBe(false)
    })

    // --- toEpochSeconds: Math.floor removal ---

    it('verifyWebhookSignature: Date now option converts to epoch seconds', async () => {
      const payload = '{"date":"test"}'
      const secret = 'date_secret'
      const timestamp = 6000000
      const header = await buildWebhookSignature(payload, secret, timestamp)

      // Using a Date object for now
      const dateNow = new Date(timestamp * 1000 + 200_000) // 200 seconds after
      const result = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 300,
        now: dateNow,
      })
      expect(result).toBe(true)

      // Date that's too far should fail
      const dateFar = new Date(timestamp * 1000 + 301_000)
      const result2 = await verifyWebhookSignature(payload, header, secret, {
        toleranceSeconds: 300,
        now: dateFar,
      })
      expect(result2).toBe(false)
    })

    // --- parseWebhookSignatureHeader: edge cases ---

    it('parseWebhookSignatureHeader: Infinity timestamp treated as null', () => {
      const result = parseWebhookSignatureHeader('t=Infinity,v1=sig')
      // Number('Infinity') is Infinity, Number.isFinite(Infinity) is false
      expect(result.timestamp).toBeNull()
      expect(result.v1Signatures).toEqual(['sig'])
    })

    it('parseWebhookSignatureHeader: NaN timestamp treated as null', () => {
      const result = parseWebhookSignatureHeader('t=NaN,v1=sig')
      expect(result.timestamp).toBeNull()
    })

    it('parseWebhookSignatureHeader: part with empty value ignored', () => {
      const result = parseWebhookSignatureHeader('t=,v1=sig')
      // key='t', value='' -> value is falsy, continue
      expect(result.timestamp).toBeNull()
      expect(result.v1Signatures).toEqual(['sig'])
    })

    it('parseWebhookSignatureHeader: whitespace trimming on parts', () => {
      const result = parseWebhookSignatureHeader(' t=100 , v1=sig1 ')
      expect(result.timestamp).toBe(100)
      expect(result.v1Signatures).toEqual(['sig1'])
    })

    // --- parseWebhookEvent: data nullish coalescing ---

    it('parseWebhookEvent: data undefined becomes null via ?? null', () => {
      const result = parseWebhookEvent('{"type":"test"}')
      // data is undefined, ?? null should give null (not undefined)
      expect(result.data).toBeNull()
      expect(result.data).not.toBeUndefined()
    })

    it('parseWebhookEvent: data null stays null via ?? null', () => {
      const result = parseWebhookEvent('{"type":"test","data":null}')
      expect(result.data).toBeNull()
    })

    it('parseWebhookEvent: non-string id/type/created_at/livemode return null/defaults', () => {
      const result = parseWebhookEvent('{"id":123,"type":456,"created_at":789,"livemode":"yes"}')
      expect(result.id).toBeNull() // 123 is not string
      expect(result.type).toBe('unknown') // 456 is not string, event also not string
      expect(result.createdAt).toBeNull() // 789 is not string
      expect(result.livemode).toBeNull() // "yes" is not boolean
    })

    it('parseWebhookEvent: event field non-string falls to unknown', () => {
      const result = parseWebhookEvent('{"event":42}')
      expect(result.type).toBe('unknown')
    })

    it('parseWebhookEvent: livemode false preserves false', () => {
      const result = parseWebhookEvent('{"type":"t","livemode":false}')
      expect(result.livemode).toBe(false)
    })

    // --- helpers.ts: mapWebhookEndpoint ---

    it('mapWebhookEndpoint: String(null ?? "") gives empty string', () => {
      const result = mapWebhookEndpoint({ id: null })
      expect(result.id).toBe('')
      // Removing ?? '' would give String(null) = 'null'
      expect(result.id).not.toBe('null')
    })

    it('mapWebhookEndpoint: String(undefined ?? "") gives empty string', () => {
      const result = mapWebhookEndpoint({})
      expect(result.id).toBe('')
      expect(result.id).not.toBe('undefined')
    })

    it('mapWebhookEndpoint: non-string url gives empty string', () => {
      const result = mapWebhookEndpoint({ id: 'x', url: 123 })
      expect(result.url).toBe('')
    })

    it('mapWebhookEndpoint: non-string description gives null', () => {
      const result = mapWebhookEndpoint({ id: 'x', description: 42 })
      expect(result.description).toBeNull()
    })

    it('mapWebhookEndpoint: non-string created_at gives empty string', () => {
      const result = mapWebhookEndpoint({ id: 'x', created_at: 12345 })
      expect(result.createdAt).toBe('')
    })

    it('mapWebhookEndpoint: non-string secret_rotated_at gives null', () => {
      const result = mapWebhookEndpoint({ id: 'x', secret_rotated_at: true })
      expect(result.secretRotatedAt).toBeNull()
    })

    it('mapWebhookEndpoint: Boolean() coerces truthy is_active', () => {
      const result = mapWebhookEndpoint({ id: 'x', is_active: 1 })
      expect(result.isActive).toBe(true)
      expect(typeof result.isActive).toBe('boolean')

      const result2 = mapWebhookEndpoint({ id: 'x', is_active: 0 })
      expect(result2.isActive).toBe(false)
    })

    it('mapWebhookEndpoint: non-array events gives empty array', () => {
      const result = mapWebhookEndpoint({ id: 'x', events: 'not-array' })
      expect(result.events).toEqual([])
    })

    // --- helpers.ts: mapWebhookDelivery ---

    it('mapWebhookDelivery: Number(null || 0) gives 0', () => {
      const result = mapWebhookDelivery({ id: 'x', attempts: null })
      expect(result.attempts).toBe(0)
    })

    it('mapWebhookDelivery: Number(undefined || 0) gives 0', () => {
      const result = mapWebhookDelivery({ id: 'x' })
      expect(result.attempts).toBe(0)
    })

    it('mapWebhookDelivery: Number(3 || 0) gives 3', () => {
      const result = mapWebhookDelivery({ id: 'x', attempts: 3 })
      expect(result.attempts).toBe(3)
    })

    it('mapWebhookDelivery: String(null ?? "") gives empty string', () => {
      const result = mapWebhookDelivery({ id: null })
      expect(result.id).toBe('')
      expect(result.id).not.toBe('null')
    })

    it('mapWebhookDelivery: non-string event_type gives "unknown"', () => {
      const result = mapWebhookDelivery({ id: 'x', event_type: 42 })
      expect(result.eventType).toBe('unknown')
    })

    it('mapWebhookDelivery: non-string status gives "unknown"', () => {
      const result = mapWebhookDelivery({ id: 'x', status: false })
      expect(result.status).toBe('unknown')
    })

    it('mapWebhookDelivery: non-number max_attempts gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', max_attempts: 'five' })
      expect(result.maxAttempts).toBeNull()
    })

    it('mapWebhookDelivery: non-number response_status gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', response_status: 'ok' })
      expect(result.responseStatus).toBeNull()
    })

    it('mapWebhookDelivery: non-number response_time_ms gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', response_time_ms: 'fast' })
      expect(result.responseTimeMs).toBeNull()
    })

    it('mapWebhookDelivery: non-string response_body gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', response_body: 42 })
      expect(result.responseBody).toBeNull()
    })

    it('mapWebhookDelivery: non-string endpoint_id gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', endpoint_id: 123 })
      expect(result.endpointId).toBeNull()
    })

    it('mapWebhookDelivery: non-string created_at gives empty string', () => {
      const result = mapWebhookDelivery({ id: 'x', created_at: 999 })
      expect(result.createdAt).toBe('')
    })

    it('mapWebhookDelivery: non-string delivered_at gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', delivered_at: 123 })
      expect(result.deliveredAt).toBeNull()
    })

    it('mapWebhookDelivery: non-string next_retry_at gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', next_retry_at: true })
      expect(result.nextRetryAt).toBeNull()
    })

    it('mapWebhookDelivery: non-object payload gives null', () => {
      const result = mapWebhookDelivery({ id: 'x', payload: 'string' })
      expect(result.payload).toBeNull()

      const result2 = mapWebhookDelivery({ id: 'x', payload: null })
      expect(result2.payload).toBeNull()
    })

    it('mapWebhookDelivery: object payload is preserved', () => {
      const result = mapWebhookDelivery({ id: 'x', payload: { event: 'test', data: { a: 1 } } })
      expect(result.payload).toEqual({ event: 'test', data: { a: 1 } })
    })

    // --- resolveWebhookEndpointUrl: non-string url in object ---

    it('resolveWebhookEndpointUrl: object with non-string url returns null', () => {
      expect(resolveWebhookEndpointUrl({ url: 42 }, undefined)).toBeNull()
    })

    it('resolveWebhookEndpointUrl: number value for endpointUrl returns null', () => {
      // typeof 42 !== 'string', so returns null
      expect(resolveWebhookEndpointUrl(undefined, 42)).toBeNull()
    })

    // --- client.ts: configureEmail sendDay || 1 ---

    it('configureEmail defaults send_day to 1 when not provided', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.configureEmail({ enabled: true })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.email_config.send_day).toBe(1)
    })

    it('configureEmail uses provided sendDay', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.configureEmail({ enabled: true, sendDay: 15 })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.email_config.send_day).toBe(15)
    })

    it('configureEmail maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.configureEmail({
        enabled: false,
        sendDay: 5,
        fromName: 'Acme',
        fromEmail: 'no-reply@acme.com',
        subjectTemplate: 'Your statement for {{month}}',
        bodyTemplate: 'Hello {{name}}',
        ccAdmin: true,
        adminEmail: 'admin@acme.com',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.email_config.enabled).toBe(false)
      expect(body.email_config.send_day).toBe(5)
      expect(body.email_config.from_name).toBe('Acme')
      expect(body.email_config.from_email).toBe('no-reply@acme.com')
      expect(body.email_config.subject_template).toBe('Your statement for {{month}}')
      expect(body.email_config.body_template).toBe('Hello {{name}}')
      expect(body.email_config.cc_admin).toBe(true)
      expect(body.email_config.admin_email).toBe('admin@acme.com')
    })

    // --- client.ts: getSummary Number() coercion and reduce ---

    it('getSummary coerces non-numeric balances to 0 via Number(x || 0)', async () => {
      const fn = mockFetch({
        success: true,
        participants: [
          { ledger_balance: null, held_amount: undefined, available_balance: '' },
          { ledger_balance: '100', held_amount: 0, available_balance: 50 },
        ],
      })
      const sdk = createClient(fn)
      const result = await sdk.getSummary()

      // null || 0 = 0, undefined || 0 = 0, '' || 0 = 0
      // '100' || 0 = '100', Number('100') = 100
      expect(result.data.total_ledger_balance).toBe(100)
      expect(result.data.total_held_amount).toBe(0)
      expect(result.data.total_available_balance).toBe(50)
      expect(result.data.participant_count).toBe(2)
    })

    // --- client.ts: createCheckoutSession paymentMethodId + sourceId logic ---

    it('createCheckoutSession with sourceId (via paymentMethodId key present) passes validation', async () => {
      // hasPaymentMethod checks: 'paymentMethodId' in req ? Boolean(req.paymentMethodId || req.sourceId)
      // So paymentMethodId key must be present for sourceId to be checked
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_src_via',
          mode: 'direct',
          payment_id: 'pay_src',
          status: 'completed',
          requires_action: false,
          amount: 1000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: '', // falsy but key present
        sourceId: 'src_1', // sourceId makes hasPaymentMethod true via ||
        successUrl: 'https://example.com/ok', // also provide successUrl as fallback
      } as any)

      expect(result.checkoutSession.id).toBe('cs_src_via')
    })

    it('createCheckoutSession paymentIntentId falls back to payment_id', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_pi',
          mode: 'direct',
          payment_id: 'pay_pi',
          payment_intent_id: 'pi_explicit',
          status: 'completed',
          requires_action: false,
          amount: 1000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
      })

      // When both are present, payment_intent_id takes priority
      expect(result.checkoutSession.paymentIntentId).toBe('pi_explicit')
    })

    it('createCheckoutSession requiresAction Boolean coercion', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_ra',
          mode: 'direct',
          payment_id: 'pay_ra',
          status: 'pending',
          requires_action: 1, // truthy but not boolean
          amount: 1000,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
      })

      expect(result.checkoutSession.requiresAction).toBe(true)
      expect(typeof result.checkoutSession.requiresAction).toBe('boolean')
    })

    it('createCheckoutSession amount falls back to req.amount', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_amt',
          mode: 'direct',
          status: 'pending',
          requires_action: false,
          // amount missing in response
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 7777,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
      })

      expect(result.checkoutSession.amount).toBe(7777)
    })

    // --- client.ts: walletObject Boolean coercions (=== true) ---

    it('mapWalletObject: redeemable/transferable/topup/payout only true for exact true', async () => {
      const fn = mockFetch({
        success: true,
        wallet: {
          id: 'w_bool',
          wallet_type: 't',
          scope_type: 's',
          account_type: 'a',
          currency: 'USD',
          status: 'active',
          balance: 0,
          redeemable: 1, // truthy but not true
          transferable: 'yes',
          topup_supported: {},
          payout_supported: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getWallet('w_bool')

      // === true means only exactly `true` works
      expect(result.wallet.redeemable).toBe(false)
      expect(result.wallet.transferable).toBe(false)
      expect(result.wallet.topupSupported).toBe(false)
      expect(result.wallet.payoutSupported).toBe(false)
    })

    // --- client.ts: createWallet response.created === true ---

    it('createWallet created is true only for exact true', async () => {
      const fn1 = mockFetch({
        success: true,
        created: 1, // truthy but not true
        wallet: { id: 'w1', wallet_type: 't', scope_type: 's', account_type: 'a', currency: 'USD', status: 'active', balance: 0, redeemable: false, transferable: false, topup_supported: false, payout_supported: false },
      })
      const sdk1 = createClient(fn1)
      const result1 = await sdk1.createWallet({ ownerId: 'o1', walletType: 't' })
      expect(result1.created).toBe(false) // 1 === true is false

      const fn2 = mockFetch({
        success: true,
        created: true,
        wallet: { id: 'w2', wallet_type: 't', scope_type: 's', account_type: 'a', currency: 'USD', status: 'active', balance: 0, redeemable: false, transferable: false, topup_supported: false, payout_supported: false },
      })
      const sdk2 = createClient(fn2)
      const result2 = await sdk2.createWallet({ ownerId: 'o2', walletType: 't' })
      expect(result2.created).toBe(true)
    })

    // --- client.ts: mapWalletObject available_balance fallback ---

    it('mapWalletObject: available_balance 0 uses 0 not balance fallback', async () => {
      const fn = mockFetch({
        success: true,
        wallet: {
          id: 'w_avb',
          wallet_type: 't',
          scope_type: 's',
          account_type: 'a',
          currency: 'USD',
          status: 'active',
          balance: 500,
          available_balance: 0, // explicitly 0, should not fall back to balance
          redeemable: false,
          transferable: false,
          topup_supported: false,
          payout_supported: false,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.getWallet('w_avb')

      // ?? operator: 0 is not nullish, so should stay 0
      expect(result.wallet.availableBalance).toBe(0)
    })

    // --- client.ts: registerInstrument nested extractedTerms ---

    it('registerInstrument maps nested extractedTerms to snake_case', async () => {
      const fn = mockFetch({ success: true, instrument_id: 'inst_1' })
      const sdk = createClient(fn)
      await sdk.registerInstrument({
        externalRef: 'contract_123',
        extractedTerms: {
          amount: 5000,
          currency: 'USD',
          cadence: 'monthly',
          counterpartyName: 'Vendor Co',
        },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.external_ref).toBe('contract_123')
      expect(body.extracted_terms.amount).toBe(5000)
      expect(body.extracted_terms.currency).toBe('USD')
      expect(body.extracted_terms.cadence).toBe('monthly')
      expect(body.extracted_terms.counterparty_name).toBe('Vendor Co')
    })

    // --- client.ts: projectIntent snake_case request and response ---

    it('projectIntent sends horizon_count in request', async () => {
      const fn = mockFetch({
        success: true,
        instrument_id: 'inst_h',
        projections_created: 3,
        projections_requested: 3,
        duplicates_skipped: 0,
        date_range: {},
        projected_dates: [],
      })
      const sdk = createClient(fn)
      await sdk.projectIntent({
        authorizingInstrumentId: 'inst_h',
        horizonCount: 3,
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.authorizing_instrument_id).toBe('inst_h')
      expect(body.horizon_count).toBe(3)
    })

    // --- client.ts: configurePayoutRail ---

    it('configurePayoutRail maps rail config', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.configurePayoutRail('card', {
        enabled: true,
        credentials: { api_key: 'key_test' },
        settings: { min_amount: 100 },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('configure_rail')
      expect(body.rail_config.rail).toBe('card')
      expect(body.rail_config.enabled).toBe(true)
      expect(body.rail_config.credentials.api_key).toBe('key_test')
      expect(body.rail_config.settings.min_amount).toBe(100)
    })

    // --- client.ts: getDetailedTrialBalance snapshot flag ---

    it('getDetailedTrialBalance sends snapshot=true as string', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getDetailedTrialBalance({ asOf: '2026-03-01', snapshot: true })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('snapshot=true')
      expect(url).toContain('as_of=2026-03-01')
    })

    it('getDetailedTrialBalance omits snapshot when false', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getDetailedTrialBalance({ snapshot: false })

      const url = String(fn.mock.calls[0][0])
      expect(url).not.toContain('snapshot')
    })

    // --- client.ts: getDetailedProfitLoss all params ---

    it('getDetailedProfitLoss sends all params', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getDetailedProfitLoss({
        year: 2026,
        month: 3,
        quarter: 1,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        breakdown: 'monthly',
      })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('year=2026')
      expect(url).toContain('month=3')
      expect(url).toContain('quarter=1')
      expect(url).toContain('start_date=2026-01-01')
      expect(url).toContain('end_date=2026-03-31')
      expect(url).toContain('breakdown=monthly')
    })

    // --- client.ts: createParticipant with taxInfo and payout preferences ---

    it('createParticipant maps taxInfo to snake_case', async () => {
      const fn = mockFetch({ success: true, participant: { id: 'p_tax' } })
      const sdk = createClient(fn)
      await sdk.createParticipant({
        participantId: 'p_tax',
        taxInfo: {
          taxIdType: 'ein',
          taxIdLast4: '9999',
          legalName: 'Corp LLC',
          businessType: 'llc',
          address: {
            line1: '100 Main',
            line2: 'Floor 2',
            city: 'NYC',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
        },
        payoutPreferences: {
          schedule: 'weekly',
          minimumAmount: 1000,
          method: 'ach',
        },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.tax_info.tax_id_type).toBe('ein')
      expect(body.tax_info.tax_id_last4).toBe('9999')
      expect(body.tax_info.legal_name).toBe('Corp LLC')
      expect(body.tax_info.business_type).toBe('llc')
      expect(body.tax_info.address.line1).toBe('100 Main')
      expect(body.tax_info.address.line2).toBe('Floor 2')
      expect(body.tax_info.address.city).toBe('NYC')
      expect(body.tax_info.address.postal_code).toBe('10001')
      expect(body.payout_preferences.schedule).toBe('weekly')
      expect(body.payout_preferences.minimum_amount).toBe(1000)
      expect(body.payout_preferences.method).toBe('ach')
    })

    // --- client.ts: createLedger sends all settings ---

    it('createLedger maps all settings to snake_case', async () => {
      const fn = mockFetch({
        success: true,
        ledger: { id: 'l1', business_name: 'B', ledger_mode: 'standard', api_key: 'k', status: 'active', created_at: '2026-01-01' },
      })
      const sdk = createClient(fn)
      await sdk.createLedger({
        businessName: 'B',
        ownerEmail: 'e@t.com',
        ledgerMode: 'standard',
        settings: {
          defaultTaxRate: 0.1,
          defaultSplitPercent: 80,
          platformFeePercent: 5,
          minPayoutAmount: 1000,
          payoutSchedule: 'weekly',
          taxWithholdingPercent: 15,
          currency: 'EUR',
          fiscalYearStart: '01-01',
          receiptThreshold: 2500,
        },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.settings.default_tax_rate).toBe(0.1)
      expect(body.settings.default_split_percent).toBe(80)
      expect(body.settings.platform_fee_percent).toBe(5)
      expect(body.settings.min_payout_amount).toBe(1000)
      expect(body.settings.payout_schedule).toBe('weekly')
      expect(body.settings.tax_withholding_percent).toBe(15)
      expect(body.settings.currency).toBe('EUR')
      expect(body.settings.fiscal_year_start).toBe('01-01')
      expect(body.settings.receipt_threshold).toBe(2500)
    })

    // --- client.ts: recordSale sends all optional fields ---

    it('recordSale maps all optional fields', async () => {
      const fn = mockFetch({ success: true, transactionId: 'txn_full' })
      const sdk = createClient(fn)
      await sdk.recordSale({
        referenceId: 'ref_full',
        creatorId: 'c_full',
        amount: 10000,
        processingFee: 300,
        processingFeePaidBy: 'creator',
        creatorPercent: 75,
        productId: 'prod_1',
        productName: 'Widget',
        creatorName: 'Alice',
        skipWithholding: true,
        transactionDate: '2026-03-15',
        metadata: { key: 'val' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.processing_fee).toBe(300)
      expect(body.creator_percent).toBe(75)
      expect(body.product_id).toBe('prod_1')
      expect(body.product_name).toBe('Widget')
      expect(body.creator_name).toBe('Alice')
      expect(body.skip_withholding).toBe(true)
      expect(body.transaction_date).toBe('2026-03-15')
    })

    // --- client.ts: recordExpense authorization fields ---

    it('recordExpense maps authorization fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordExpense({
        referenceId: 'exp_auth',
        amount: 5000,
        authorizingInstrumentId: 'instr_1',
        riskEvaluationId: 'eval_1',
        authorizationDecisionId: 'dec_1',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.authorizing_instrument_id).toBe('instr_1')
      expect(body.risk_evaluation_id).toBe('eval_1')
      expect(body.authorization_decision_id).toBe('dec_1')
    })

    // --- client.ts: recordBill authorization fields ---

    it('recordBill maps authorization fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordBill({
        amount: 3000,
        description: 'Bill',
        vendorName: 'V',
        authorizingInstrumentId: 'instr_b',
        riskEvaluationId: 'eval_b',
        authorizationDecisionId: 'dec_b',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.authorizing_instrument_id).toBe('instr_b')
      expect(body.risk_evaluation_id).toBe('eval_b')
      expect(body.authorization_decision_id).toBe('dec_b')
    })

    // --- client.ts: recordIncome all optional fields ---

    it('recordIncome maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordIncome({
        referenceId: 'inc_full',
        amount: 8000,
        description: 'Consulting',
        category: 'services',
        customerId: 'cust_1',
        customerName: 'Acme',
        receivedTo: 'cash',
        invoiceId: 'inv_1',
        transactionDate: '2026-03-10',
        metadata: { note: 'test' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.description).toBe('Consulting')
      expect(body.category).toBe('services')
      expect(body.customer_id).toBe('cust_1')
      expect(body.received_to).toBe('cash')
      expect(body.invoice_id).toBe('inv_1')
      expect(body.transaction_date).toBe('2026-03-10')
      expect(body.metadata).toEqual({ note: 'test' })
    })

    // --- client.ts: recordExpense all optional fields ---

    it('recordExpense maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordExpense({
        referenceId: 'exp_full',
        amount: 4000,
        description: 'Office supplies',
        category: 'supplies',
        vendorId: 'v_1',
        vendorName: 'OfficeMax',
        paidFrom: 'checking',
        receiptUrl: 'https://example.com/receipt.jpg',
        taxDeductible: false,
        transactionDate: '2026-03-12',
        metadata: { receipt: true },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.description).toBe('Office supplies')
      expect(body.category).toBe('supplies')
      expect(body.vendor_id).toBe('v_1')
      expect(body.paid_from).toBe('checking')
      expect(body.receipt_url).toBe('https://example.com/receipt.jpg')
      expect(body.tax_deductible).toBe(false)
      expect(body.transaction_date).toBe('2026-03-12')
    })

    // --- client.ts: recordBill all optional fields ---

    it('recordBill maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordBill({
        amount: 7000,
        description: 'Hosting',
        vendorName: 'AWS',
        vendorId: 'aws_1',
        referenceId: 'bill_ref',
        dueDate: '2026-04-01',
        expenseCategory: 'infrastructure',
        paid: true,
        metadata: { env: 'prod' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.vendor_id).toBe('aws_1')
      expect(body.expense_category).toBe('infrastructure')
      expect(body.paid).toBe(true)
    })

    // --- client.ts: recordAdjustment all optional fields ---

    it('recordAdjustment maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordAdjustment({
        adjustmentType: 'reclassification',
        adjustmentDate: '2026-03-10',
        entries: [
          { accountType: 'cash', entityId: 'e_1', entryType: 'debit', amount: 500 },
          { accountType: 'revenue', entryType: 'credit', amount: 500 },
        ],
        reason: 'Reclassify revenue',
        originalTransactionId: 'txn_orig',
        supportingDocumentation: 'https://example.com/doc.pdf',
        preparedBy: 'finance_team',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.adjustment_date).toBe('2026-03-10')
      expect(body.entries[0].entity_id).toBe('e_1')
      expect(body.original_transaction_id).toBe('txn_orig')
      expect(body.supporting_documentation).toBe('https://example.com/doc.pdf')
    })

    // --- client.ts: recordOpeningBalance entity_id in balances ---

    it('recordOpeningBalance maps entity_id and sourceDescription', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordOpeningBalance({
        asOfDate: '2026-01-01',
        source: 'import',
        sourceDescription: 'Migrated from QuickBooks',
        balances: [
          { accountType: 'cash', entityId: 'checking_1', balance: 50000 },
        ],
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.source_description).toBe('Migrated from QuickBooks')
      expect(body.balances[0].entity_id).toBe('checking_1')
    })

    // --- client.ts: recordTransfer all optional fields ---

    it('recordTransfer maps description and referenceId', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.recordTransfer({
        fromAccountType: 'cash',
        toAccountType: 'savings',
        amount: 1000,
        transferType: 'operating',
        description: 'Monthly savings',
        referenceId: 'xfer_ref_1',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.description).toBe('Monthly savings')
      expect(body.reference_id).toBe('xfer_ref_1')
    })

    // --- client.ts: uploadReceipt all optional fields ---

    it('uploadReceipt maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.uploadReceipt({
        fileUrl: 'https://example.com/r.jpg',
        fileName: 'receipt.jpg',
        fileSize: 12345,
        mimeType: 'image/jpeg',
        merchantName: 'Store',
        transactionDate: '2026-03-10',
        totalAmount: 2500,
        transactionId: 'txn_rcpt',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.file_name).toBe('receipt.jpg')
      expect(body.file_size).toBe(12345)
      expect(body.transaction_date).toBe('2026-03-10')
    })

    // --- client.ts: receivePayment all optional fields ---

    it('receivePayment maps all optional fields', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.receivePayment({
        amount: 5000,
        invoiceTransactionId: 'inv_txn_1',
        customerName: 'Bob',
        customerId: 'cust_bob',
        referenceId: 'rp_ref',
        paymentMethod: 'wire',
        paymentDate: '2026-03-15',
        metadata: { source: 'manual' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.invoice_transaction_id).toBe('inv_txn_1')
      expect(body.customer_id).toBe('cust_bob')
      expect(body.reference_id).toBe('rp_ref')
      expect(body.payment_date).toBe('2026-03-15')
    })

    // --- client.ts: sendBreachAlert all optional fields ---

    it('sendBreachAlert maps all optional fields', async () => {
      const fn = mockFetch({ success: true, alerts_sent: 1, message: 'Sent' })
      const sdk = createClient(fn)
      await sdk.sendBreachAlert({
        cashBalance: 5000,
        pendingTotal: 20000,
        shortfall: 15000,
        coverageRatio: 0.25,
        triggeredBy: 'project-intent',
        instrumentId: 'instr_br',
        externalRef: 'contract_br',
        projectionsCreated: 12,
        channel: 'slack',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.shortfall).toBe(15000)
      expect(body.coverage_ratio).toBe(0.25)
      expect(body.instrument_id).toBe('instr_br')
      expect(body.external_ref).toBe('contract_br')
      expect(body.projections_created).toBe(12)
      expect(body.channel).toBe('slack')
    })

    // --- client.ts: preflightAuthorization all optional request fields ---

    it('preflightAuthorization maps all optional fields', async () => {
      const fn = mockFetch({
        success: true,
        cached: false,
        message: 'ok',
        decision: { id: 'd1', decision: 'allowed', violated_policies: [], expires_at: null, created_at: '2026-01-01' },
      })
      const sdk = createClient(fn)
      await sdk.preflightAuthorization({
        idempotencyKey: 'ik_pf_full',
        amount: 5000,
        currency: 'EUR',
        counterpartyName: 'Vendor X',
        authorizingInstrumentId: 'instr_pf',
        expectedDate: '2026-04-01',
        category: 'equipment',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.currency).toBe('EUR')
      expect(body.counterparty_name).toBe('Vendor X')
      expect(body.authorizing_instrument_id).toBe('instr_pf')
      expect(body.expected_date).toBe('2026-04-01')
      expect(body.category).toBe('equipment')
    })

    // --- client.ts: evaluateFraud all optional request fields ---

    it('evaluateFraud maps all optional request fields', async () => {
      const fn = mockFetch({
        success: true,
        cached: false,
        evaluation: { id: 'e1', signal: 'low', risk_factors: [], valid_until: null, created_at: '2026-01-01', acknowledged_at: null },
      })
      const sdk = createClient(fn)
      await sdk.evaluateFraud({
        idempotencyKey: 'ik_fr',
        amount: 3000,
        currency: 'GBP',
        counterpartyName: 'New Vendor',
        authorizingInstrumentId: 'instr_fr',
        expectedDate: '2026-05-01',
        category: 'supplies',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.currency).toBe('GBP')
      expect(body.counterparty_name).toBe('New Vendor')
      expect(body.authorizing_instrument_id).toBe('instr_fr')
      expect(body.expected_date).toBe('2026-05-01')
      expect(body.category).toBe('supplies')
    })

    // --- client.ts: createFraudPolicy sends all fields ---

    it('createFraudPolicy sends severity and priority', async () => {
      const fn = mockFetch({
        success: true,
        policy: { id: 'fp_x', type: 'velocity', severity: 'soft', priority: 5, is_active: true, config: {}, created_at: null, updated_at: null },
      })
      const sdk = createClient(fn)
      await sdk.createFraudPolicy({
        policyType: 'velocity',
        config: { max_per_hour: 100 },
        severity: 'soft',
        priority: 5,
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.policy_type).toBe('velocity')
      expect(body.severity).toBe('soft')
      expect(body.priority).toBe(5)
      expect(body.config).toEqual({ max_per_hour: 100 })
    })

    // --- client.ts: createPayout all optional request fields ---

    it('createPayout maps all optional fields', async () => {
      const fn = mockFetch({
        success: true,
        payout: { id: 'po_full_req', transaction_id: 'tx_req' },
      })
      const sdk = createClient(fn)
      await sdk.createPayout({
        participantId: 'p_1',
        walletId: 'w_1',
        amount: 10000,
        referenceId: 'po_ref',
        referenceType: 'monthly',
        description: 'Monthly payout',
        payoutMethod: 'ach',
        fees: 150,
        feesPaidBy: 'creator',
        metadata: { batch: 'march' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.wallet_id).toBe('w_1')
      expect(body.reference_type).toBe('monthly')
      expect(body.description).toBe('Monthly payout')
      expect(body.payout_method).toBe('ach')
      expect(body.fees).toBe(150)
      expect(body.fees_paid_by).toBe('creator')
      expect(body.metadata).toEqual({ batch: 'march' })
    })

    // --- client.ts: createRefund all optional request fields ---

    it('createRefund maps all optional request fields', async () => {
      const fn = mockFetch({
        success: true,
        refund: { id: 'rf_req', sale_reference: 'sale_x', refunded_amount: 1000, currency: 'USD', status: 'completed' },
      })
      const sdk = createClient(fn)
      await sdk.createRefund({
        saleReference: 'sale_x',
        reason: 'Damaged',
        amount: 1000,
        refundFrom: 'creator',
        externalRefundId: 'ext_rf_1',
        idempotencyKey: 'ik_rf',
        mode: 'processor_refund',
        processorPaymentId: 'pp_1',
        metadata: { category: 'returns' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.refund_from).toBe('creator')
      expect(body.external_refund_id).toBe('ext_rf_1')
      expect(body.idempotency_key).toBe('ik_rf')
      expect(body.mode).toBe('processor_refund')
      expect(body.processor_payment_id).toBe('pp_1')
      expect(body.metadata).toEqual({ category: 'returns' })
    })

    // --- client.ts: createCheckoutSession all optional request fields ---

    it('createCheckoutSession maps all optional fields in request body', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: { id: 'cs_all', mode: 'session', status: 'pending', requires_action: false, amount: 5000, checkout_url: 'https://pay.example.com/cs_all' },
      })
      const sdk = createClient(fn)
      await sdk.createCheckoutSession({
        amount: 5000,
        participantId: 'p_cs',
        currency: 'GBP',
        productId: 'prod_cs',
        productName: 'Premium Plan',
        customerEmail: 'buyer@example.com',
        customerId: 'cust_cs',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/cancel',
        metadata: { plan: 'premium' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.currency).toBe('GBP')
      expect(body.product_id).toBe('prod_cs')
      expect(body.product_name).toBe('Premium Plan')
      expect(body.customer_email).toBe('buyer@example.com')
      expect(body.customer_id).toBe('cust_cs')
      expect(body.cancel_url).toBe('https://example.com/cancel')
      expect(body.metadata).toEqual({ plan: 'premium' })
    })

    // --- client.ts: createTransfer all optional fields ---

    it('createTransfer maps all optional fields', async () => {
      const fn = mockFetch({
        success: true,
        transfer: { transaction_id: 'txn_xf', from_balance: 0, to_balance: 500 },
      })
      const sdk = createClient(fn)
      await sdk.createTransfer({
        fromParticipantId: 'from_p',
        toParticipantId: 'to_p',
        amount: 500,
        referenceId: 'xfer_ref',
        description: 'Gift transfer',
        metadata: { type: 'gift' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.reference_id).toBe('xfer_ref')
      expect(body.description).toBe('Gift transfer')
      expect(body.metadata).toEqual({ type: 'gift' })
    })

    // --- client.ts: topUpWallet and withdrawFromWallet optional fields ---

    it('topUpWallet maps description and metadata', async () => {
      const fn = mockFetch({ success: true, topup: { wallet_id: 'w1' } })
      const sdk = createClient(fn)
      await sdk.topUpWallet({
        walletId: 'w1',
        amount: 1000,
        referenceId: 'tu_ref',
        description: 'Bonus credit',
        metadata: { source: 'promo' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.description).toBe('Bonus credit')
      expect(body.metadata).toEqual({ source: 'promo' })
    })

    it('withdrawFromWallet maps description and metadata', async () => {
      const fn = mockFetch({ success: true, withdrawal: { wallet_id: 'w1' } })
      const sdk = createClient(fn)
      await sdk.withdrawFromWallet({
        walletId: 'w1',
        amount: 500,
        referenceId: 'wd_ref',
        description: 'Cash out',
        metadata: { reason: 'emergency' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.description).toBe('Cash out')
      expect(body.metadata).toEqual({ reason: 'emergency' })
    })

    // --- client.ts: createWallet optional fields ---

    it('createWallet maps all optional request fields', async () => {
      const fn = mockFetch({
        success: true,
        created: true,
        wallet: { id: 'w_new', wallet_type: 't', scope_type: 's', account_type: 'a', currency: 'USD', status: 'active', balance: 0, redeemable: false, transferable: false, topup_supported: false, payout_supported: false },
      })
      const sdk = createClient(fn)
      await sdk.createWallet({
        ownerId: 'owner_1',
        participantId: 'part_1',
        ownerType: 'customer',
        walletType: 'consumer_credit',
        name: 'Store Credits',
        metadata: { tier: 'gold' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.participant_id).toBe('part_1')
      expect(body.owner_type).toBe('customer')
      expect(body.name).toBe('Store Credits')
      expect(body.metadata).toEqual({ tier: 'gold' })
    })

    // --- client.ts: listWallets optional filters ---

    it('listWallets maps optional filter params', async () => {
      const fn = mockFetch({ success: true, wallets: [], total: 0, limit: 25, offset: 0 })
      const sdk = createClient(fn)
      await sdk.listWallets({
        ownerId: 'o_1',
        ownerType: 'participant',
        walletType: 'creator_earnings',
        limit: 50,
        offset: 10,
      })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('owner_id=o_1')
      expect(url).toContain('owner_type=participant')
      expect(url).toContain('wallet_type=creator_earnings')
      expect(url).toContain('limit=50')
      expect(url).toContain('offset=10')
    })

    // --- client.ts: getHeldFunds (old API) ---

    it('getHeldFunds maps query params', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getHeldFunds({
        ventureId: 'v_1',
        creatorId: 'c_1',
        readyOnly: true,
        limit: 20,
      })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('venture_id=v_1')
      expect(url).toContain('participant_id=c_1')
      expect(url).toContain('ready_only=true')
      expect(url).toContain('limit=20')
    })

    // --- client.ts: listHolds query params ---

    it('listHolds maps ventureId and readyOnly query params', async () => {
      const fn = mockFetch({ success: true, holds: [], count: 0 })
      const sdk = createClient(fn)
      await sdk.listHolds({
        participantId: 'p_1',
        ventureId: 'v_h',
        readyOnly: true,
        limit: 50,
      })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('venture_id=v_h')
      expect(url).toContain('ready_only=true')
      expect(url).toContain('limit=50')
    })

    // --- client.ts: listRefunds query params ---

    it('listRefunds sends limit as query param', async () => {
      const fn = mockFetch({ success: true, refunds: [] })
      const sdk = createClient(fn)
      await sdk.listRefunds({ saleReference: 'sale_q', limit: 25 })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('sale_reference=sale_q')
      expect(url).toContain('limit=25')
    })

    // --- client.ts: getWalletEntries optional params ---

    it('getWalletEntries sends limit and offset', async () => {
      const fn = mockFetch({ success: true, entries: [], wallet: null })
      const sdk = createClient(fn)
      await sdk.getWalletEntries('w_entries', { limit: 10, offset: 5 })

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=5')
    })

    // --- client.ts: generateTaxSummary with creatorId ---

    it('generateTaxSummary sends participant_id query param', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        summaries: [],
        totals: { total_gross: 0, total_refunds: 0, total_net: 0, total_paid: 0, participants_requiring_1099: 0 },
      })
      const sdk = createClient(fn)
      await sdk.generateTaxSummary(2025, 'creator_x')

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('participant_id=creator_x')
    })

    // --- client.ts: calculateTaxForParticipant monthlyTotals default ---

    it('calculateTaxForParticipant defaults monthlyTotals to empty object', async () => {
      const fn = mockFetch({
        success: true,
        calculation: {
          participant_id: 'p_mt',
          tax_year: 2025,
          gross_payments: 0,
          transaction_count: 0,
          requires_1099: false,
          // monthly_totals missing -> || {}
          threshold: 600,
          linked_user_id: null,
          shared_tax_profile: null,
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.calculateTaxForParticipant('p_mt')

      expect(result.calculation.monthlyTotals).toEqual({})
    })

    // --- client.ts: listTaxDocuments defaults documents to empty array ---

    it('listTaxDocuments defaults documents to empty array', async () => {
      const fn = mockFetch({
        success: true,
        tax_year: 2025,
        summary: { total_documents: 0, total_amount: 0, by_status: {} },
      })
      const sdk = createClient(fn)
      const result = await sdk.listTaxDocuments(2025)

      expect(result.documents).toEqual([])
    })

    // --- client.ts: preflightAndRecordBill allowed path ---

    it('preflightAndRecordBill records bill when allowed', async () => {
      const fn = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            success: true, cached: false, message: 'allowed',
            decision: { id: 'dec_bill_allow', decision: 'allowed', violated_policies: [], expires_at: null, created_at: '2026-01-01' },
          }),
          text: () => Promise.resolve(''),
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ success: true, transaction_id: 'txn_bill' }),
          text: () => Promise.resolve(''),
          headers: new Map(),
        })
      const sdk = createClient(fn)
      const result = await sdk.preflightAndRecordBill(
        { idempotencyKey: 'ik_bill', amount: 5000 },
        { amount: 5000, description: 'Hosting', vendorName: 'AWS' },
      )

      expect(result.preflight.decision.decision).toBe('allowed')
      expect(result.transaction).toBeDefined()
      expect(result.transaction.transaction_id).toBe('txn_bill')

      // Verify the bill was called with the decision id
      const billBody = JSON.parse(fn.mock.calls[1][1].body)
      expect(billBody.authorization_decision_id).toBe('dec_bill_allow')
    })

    // --- client.ts: createCheckoutSession idempotencyKey in body ---

    it('createCheckoutSession sends idempotency_key', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: { id: 'cs_ik', mode: 'direct', payment_id: 'pay_ik', status: 'completed', requires_action: false, amount: 1000 },
      })
      const sdk = createClient(fn)
      await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        paymentMethodId: 'pm_1',
        idempotencyKey: 'ik_checkout',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.idempotency_key).toBe('ik_checkout')
    })

    // --- client.ts: reverseTransaction all optional request fields ---

    it('reverseTransaction maps metadata in request', async () => {
      const fn = mockFetch({ success: true, void_type: 'void', message: 'Done' })
      const sdk = createClient(fn)
      await sdk.reverseTransaction({
        transactionId: 'txn_meta',
        reason: 'Test',
        metadata: { audit: 'trail' },
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.metadata).toEqual({ audit: 'trail' })
    })

    // --- client.ts: createReconciliationSnapshot as_of_date ---

    it('createReconciliationSnapshot sends as_of_date', async () => {
      const fn = mockFetch({
        success: true,
        snapshot: { id: 'snap_aod', integrity_hash: 'hash_aod' },
      })
      const sdk = createClient(fn)
      await sdk.createReconciliationSnapshot({
        periodId: 'p_aod',
        asOfDate: '2026-03-15',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.as_of_date).toBe('2026-03-15')
    })

    // --- client.ts: createInvoice line item amount computation ---

    it('createInvoice uses explicit amount when provided', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.createInvoice({
        customerName: 'Test',
        lineItems: [{ description: 'Item', quantity: 2, unitPrice: 1000, amount: 2500 }],
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      // When amount is explicitly provided, it should be used as-is
      expect(body.line_items[0].amount).toBe(2500)
    })

    // --- client.ts: getDueRecurring with days param ---

    it('getDueRecurring sends days param', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getDueRecurring(7)

      const url = String(fn.mock.calls[0][0])
      expect(url).toContain('days=7')
    })

    // --- client.ts: closePeriod with quarter ---

    it('closePeriod sends quarter param', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.closePeriod(2026, undefined, 1)

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.quarter).toBe(1)
    })

    // --- client.ts: createPeriod ---

    it('createPeriod maps request fields', async () => {
      const fn = mockFetch({ success: true, period: { id: 'per_1' } })
      const sdk = createClient(fn)
      await sdk.createPeriod({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        name: 'January 2026',
      })

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('create')
      expect(body.start_date).toBe('2026-01-01')
      expect(body.end_date).toBe('2026-01-31')
      expect(body.name).toBe('January 2026')
    })

    // --- client.ts: getFrozenStatement ---

    it('getFrozenStatement sends action get with statement_type', async () => {
      const fn = mockFetch({ success: true, statement: { id: 'stmt_1' } })
      const sdk = createClient(fn)
      await sdk.getFrozenStatement('period_1', 'profit_loss')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('get')
      expect(body.period_id).toBe('period_1')
      expect(body.statement_type).toBe('profit_loss')
    })

    // --- client.ts: listFrozenStatements ---

    it('listFrozenStatements sends action list with optional period_id', async () => {
      const fn = mockFetch({ success: true, statements: [] })
      const sdk = createClient(fn)
      await sdk.listFrozenStatements('period_2')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('list')
      expect(body.period_id).toBe('period_2')
    })

    it('listFrozenStatements sends undefined period_id when not provided', async () => {
      const fn = mockFetch({ success: true, statements: [] })
      const sdk = createClient(fn)
      await sdk.listFrozenStatements()

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.action).toBe('list')
    })

    // --- client.ts: report methods send correct report_type ---

    it('getProfitLoss sends profit_loss report_type', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getProfitLoss('2026-01-01', '2026-03-31')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('profit_loss')
      expect(body.start_date).toBe('2026-01-01')
      expect(body.end_date).toBe('2026-03-31')
    })

    it('getTrialBalance sends trial_balance report_type', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getTrialBalance('2026-03-01')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('trial_balance')
      expect(body.as_of).toBe('2026-03-01')
    })

    it('get1099Summary sends 1099_summary report_type', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.get1099Summary(2025)

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('1099_summary')
      expect(body.tax_year).toBe(2025)
    })

    it('getCreatorEarnings sends creator_earnings report_type', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getCreatorEarnings('2026-01-01', '2026-03-31')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('creator_earnings')
    })

    it('getTransactions sends transaction_history with optional params', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getTransactions('2026-01-01', '2026-03-31', 'creator_x')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('transaction_history')
      expect(body.creator_id).toBe('creator_x')
    })

    // --- client.ts: convenience PDF methods ---

    it('getCreatorStatement delegates to generatePDF with creator_statement', async () => {
      const fn = mockFetch({ success: true, filename: 'stmt.pdf', data: 'base64' })
      const sdk = createClient(fn)
      await sdk.getCreatorStatement('c_1', '2026-01-01', '2026-01-31')

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('creator_statement')
      expect(body.creator_id).toBe('c_1')
    })

    it('getTrialBalancePDF delegates to generatePDF with trial_balance', async () => {
      const fn = mockFetch({ success: true, filename: 'tb.pdf', data: 'base64' })
      const sdk = createClient(fn)
      await sdk.getTrialBalancePDF()

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('trial_balance')
    })

    it('get1099PDF delegates to generatePDF with 1099', async () => {
      const fn = mockFetch({ success: true, filename: '1099.pdf', data: 'base64' })
      const sdk = createClient(fn)
      await sdk.get1099PDF(2025)

      const body = JSON.parse(fn.mock.calls[0][1].body)
      expect(body.report_type).toBe('1099')
      expect(body.tax_year).toBe(2025)
    })

    // --- client.ts: requestGet skips undefined params ---

    it('requestGet omits undefined params from URL', async () => {
      const fn = mockFetch({ success: true })
      const sdk = createClient(fn)
      await sdk.getAPAging() // no asOfDate

      const url = String(fn.mock.calls[0][0])
      expect(url).not.toContain('as_of_date')
    })

    // --- client.ts: listAlerts defaults data to empty array when data not array ---

    it('listAlerts defaults data to empty when response.data is not array', async () => {
      const fn = mockFetch({ success: true, data: null })
      const sdk = createClient(fn)
      const result = await sdk.listAlerts()

      expect(result.data).toEqual([])
    })

    // --- client.ts: exportReport JSON path ---

    it('exportReport with json format returns full response', async () => {
      const fn = mockFetch({ success: true, report_type: 'summary', data: [], row_count: 0 })
      const sdk = createClient(fn)
      const result = await sdk.exportReport({ reportType: 'summary', format: 'json', startDate: '2026-01-01', endDate: '2026-03-31', creatorId: 'c_1' })

      expect(result).toMatchObject({ success: true, report_type: 'summary' })
    })

    // --- client.ts: createCheckoutSession checkout_url null path ---

    it('createCheckoutSession status null when missing', async () => {
      const fn = mockFetch({
        success: true,
        checkout_session: {
          id: 'cs_ns',
          mode: 'session',
          requires_action: false,
          amount: 1000,
          // status, checkout_url, expires_at all missing
        },
      })
      const sdk = createClient(fn)
      const result = await sdk.createCheckoutSession({
        amount: 1000,
        participantId: 'p_1',
        successUrl: 'https://example.com/ok',
      })

      expect(result.checkoutSession.status).toBeNull()
      expect(result.checkoutSession.checkoutUrl).toBeNull()
      expect(result.checkoutSession.expiresAt).toBeNull()
    })
  })
})
