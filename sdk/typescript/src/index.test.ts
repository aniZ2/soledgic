import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Soledgic } from './index'

const BASE_URL = 'https://test.supabase.co/functions/v1'
const API_KEY = 'sk_test_key'

function mockFetch(body: any, status = 200, contentType = 'application/json') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Map([['Content-Type', contentType]]),
  })
}

function createClient(fetchFn: any): Soledgic {
  vi.stubGlobal('fetch', fetchFn)
  return new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
}

describe('Soledgic SDK', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('throws on non-OK response', async () => {
    const fn = mockFetch({ error: 'Unauthorized' }, 401)
    const sdk = createClient(fn)
    await expect(sdk.listPeriods()).rejects.toThrow('Unauthorized')
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

  // === CHECKOUT ===

  it('createCheckout rejects when neither paymentMethodId nor successUrl provided', async () => {
    const fn = mockFetch({})
    const sdk = createClient(fn)
    await expect(
      sdk.createCheckout({ amount: 1000, creatorId: 'c_1' } as any)
    ).rejects.toThrow('Either paymentMethodId/sourceId or successUrl is required')
    expect(fn).not.toHaveBeenCalled()
  })

  it('createCheckout maps session response', async () => {
    const fn = mockFetch({
      success: true,
      mode: 'session',
      session_id: 'sess_1',
      checkout_url: 'https://pay.example.com',
      expires_at: '2026-01-01T00:00:00Z',
      breakdown: { gross_amount: 100, creator_amount: 80, platform_amount: 20, creator_percent: 80 },
    })
    const sdk = createClient(fn)
    const result = await sdk.createCheckout({
      amount: 10000,
      creatorId: 'c_1',
      successUrl: 'https://example.com/success',
    })

    expect(result).toMatchObject({
      success: true,
      mode: 'session',
      sessionId: 'sess_1',
      checkoutUrl: 'https://pay.example.com',
    })
  })

  // === RECORD REFUND ===

  it('recordRefund maps snake_case response to camelCase', async () => {
    const fn = mockFetch({
      success: true,
      transaction_id: 'txn_r1',
      refunded_amount: 5000,
      breakdown: { from_creator: 4000, from_platform: 1000 },
      is_full_refund: true,
    })
    const sdk = createClient(fn)
    const result = await sdk.recordRefund({
      originalSaleReference: 'order_1',
      reason: 'Returned',
    })

    expect(result.transactionId).toBe('txn_r1')
    expect(result.refundedAmount).toBe(5000)
    expect(result.breakdown.fromCreator).toBe(4000)
    expect(result.breakdown.fromPlatform).toBe(1000)
    expect(result.isFullRefund).toBe(true)
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

  // === CREATE CREATOR ===

  it('createCreator maps nested snake_case correctly', async () => {
    const fn = mockFetch({
      success: true,
      creator: {
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
    expect(body.creator_id).toBe('creator_1')
    expect(body.payout_preferences.minimum_amount).toBe(5000)

    expect(result.creator.accountId).toBe('acc_1')
    expect(result.creator.defaultSplitPercent).toBe(80)
  })

  // === CREATE LEDGER ===

  it('createLedger maps response with warning', async () => {
    const fn = mockFetch({
      success: true,
      ledger: {
        id: 'led_1',
        business_name: 'Acme',
        ledger_mode: 'standard',
        api_key: 'sk_live_abc',
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

    expect(result.ledger.apiKey).toBe('sk_live_abc')
    expect(result.warning).toContain('cannot be retrieved')
  })

  // === RISK EVALUATION ===

  it('evaluateRisk maps nested response', async () => {
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
    const result = await sdk.evaluateRisk({
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

  // === ACTION-BASED ROUTING ===

  it('listRiskPolicies sends correct action', async () => {
    const fn = mockFetch({ success: true, policies: [] })
    const sdk = createClient(fn)
    await sdk.listRiskPolicies()

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.action).toBe('list')
    expect(fn.mock.calls[0][0]).toContain('/configure-risk-policy')
  })

  it('calculateTaxForCreator sends correct action and params', async () => {
    const fn = mockFetch({ success: true, data: {} })
    const sdk = createClient(fn)
    await sdk.calculateTaxForCreator('creator_1', 2025)

    const body = JSON.parse(fn.mock.calls[0][1].body)
    expect(body.action).toBe('calculate')
    expect(body.creator_id).toBe('creator_1')
    expect(body.tax_year).toBe(2025)
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
})
