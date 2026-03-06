/**
 * Soledgic TypeScript SDK
 * Financial infrastructure for digital platforms
 * Full accounting compliance with period locking, reconciliation, and frozen statements
 */

export interface SoledgicConfig {
  apiKey: string
  baseUrl: string
  /** Request timeout in milliseconds. Default: 30000 (30s). */
  timeout?: number
}

// === REQUEST TYPES ===

export interface RecordSaleRequest {
  referenceId: string
  creatorId: string
  amount: number
  processingFee?: number
  processingFeePaidBy?: 'platform' | 'creator' | 'split'
  creatorPercent?: number
  productId?: string
  productName?: string
  creatorName?: string
  skipWithholding?: boolean
  transactionDate?: string
  metadata?: Record<string, unknown>
}

export type CheckoutProvider = 'card'

interface CreateCheckoutRequestBase {
  amount: number
  creatorId: string
  currency?: string
  productId?: string
  productName?: string
  customerEmail?: string
  customerId?: string
  // The active checkout provider is the whitelabeled card processor.
  paymentProvider?: CheckoutProvider
  metadata?: Record<string, string>
  // Session mode: when paymentMethodId is omitted, a hosted checkout session
  // is created. The buyer visits checkoutUrl to enter their card.
  successUrl?: string
  cancelUrl?: string
}

export type CreateCheckoutRequest = CreateCheckoutRequestBase & (
  // Direct charge: idempotencyKey is required to prevent duplicate transfers
  { paymentMethodId: string; sourceId?: string; idempotencyKey: string } |
  { paymentMethodId?: string; sourceId: string; idempotencyKey: string } |
  // Session mode: idempotencyKey is not needed (session ID is the key)
  { paymentMethodId?: undefined; sourceId?: undefined; successUrl: string; idempotencyKey?: string }
)

export interface CreateCheckoutSessionResponse {
  success: boolean
  mode: 'session'
  sessionId: string
  checkoutUrl: string
  expiresAt: string
  breakdown?: CheckoutBreakdown
}

export interface RecordIncomeRequest {
  referenceId: string
  amount: number
  description?: string
  category?: string
  customerId?: string
  customerName?: string
  receivedTo?: string
  invoiceId?: string
  transactionDate?: string
  metadata?: Record<string, unknown>
}

export interface RecordExpenseRequest {
  referenceId: string
  amount: number
  description?: string
  category?: string
  vendorId?: string
  vendorName?: string
  paidFrom?: 'cash' | 'credit_card' | string
  receiptUrl?: string
  taxDeductible?: boolean
  transactionDate?: string
  metadata?: Record<string, unknown>
  authorizingInstrumentId?: string
  riskEvaluationId?: string
  authorizationDecisionId?: string
}

export interface RecordBillRequest {
  amount: number
  description: string
  vendorName: string
  vendorId?: string
  referenceId?: string
  dueDate?: string
  expenseCategory?: string
  paid?: boolean
  metadata?: Record<string, unknown>
  authorizingInstrumentId?: string
  riskEvaluationId?: string
  authorizationDecisionId?: string
}

// === AUTHORIZING INSTRUMENTS ===

export interface ExtractedTerms {
  amount: number          // Amount in cents
  currency: string        // ISO currency code (e.g., "USD")
  cadence?: 'one_time' | 'monthly' | 'quarterly' | 'annual' | 'weekly' | 'bi_weekly'
  counterpartyName: string
}

export interface RegisterInstrumentRequest {
  externalRef: string
  extractedTerms: ExtractedTerms
}

export interface RegisterInstrumentResponse {
  success: boolean
  instrumentId: string
  fingerprint: string
  externalRef: string
}

export interface AuthorizationResult {
  verified: boolean
  instrumentId: string
  externalRef: string
  mismatches?: string[]
}

// === SHADOW LEDGER (GHOST ENTRIES) ===

export interface ProjectIntentRequest {
  authorizingInstrumentId: string
  untilDate: string  // ISO date string
  horizonCount?: number  // Max projections to create (default 12, max 60)
}

export interface ProjectIntentResponse {
  success: boolean
  instrumentId: string
  externalRef: string
  cadence: string
  projectionsCreated: number
  projectionsRequested: number
  duplicatesSkipped: number
  dateRange: {
    from: string
    to: string
  }
  projectedDates: string[]
}

export interface ProjectionMatch {
  matched: boolean
  projectionId: string
  expectedDate: string
  instrumentId: string
}

export interface ObligationItem {
  expectedDate: string
  amount: number
  currency: string
  counterparty: string | null
}

export interface Obligations {
  pendingTotal: number
  pendingCount: number
  items: ObligationItem[]
}

export interface BreachRisk {
  atRisk: boolean
  shortfall: number
  coverageRatio: number
}

// === BREACH ALERTS ===

export type AlertType = 'breach_risk' | 'projection_created' | 'instrument_invalidated'
export type AlertChannel = 'slack' | 'email' | 'webhook'

export interface AlertThresholds {
  coverageRatioBelow?: number  // Trigger when coverage drops below (default 0.5 = 50%)
  shortfallAbove?: number      // Trigger when shortfall exceeds (default 0)
}

export interface SlackAlertConfig {
  webhookUrl: string
  channel?: string
}

export interface EmailAlertConfig {
  recipients: string[]
}

export interface AlertConfiguration {
  id: string
  alertType: AlertType
  channel: AlertChannel
  config: SlackAlertConfig | EmailAlertConfig | Record<string, any>
  thresholds: AlertThresholds
  isActive: boolean
  lastTriggeredAt?: string
  triggerCount: number
  createdAt: string
}

export interface CreateAlertRequest {
  alertType: AlertType
  channel: AlertChannel
  config: SlackAlertConfig | EmailAlertConfig
  thresholds?: AlertThresholds
  isActive?: boolean
}

export interface UpdateAlertRequest {
  configId: string
  config?: Partial<SlackAlertConfig | EmailAlertConfig>
  thresholds?: AlertThresholds
  isActive?: boolean
}

export interface AlertTestResult {
  success: boolean
  message: string
  channel?: string
  error?: string
}

// === PREFLIGHT AUTHORIZATION (Phase 3) ===

export type PolicyType = 'require_instrument' | 'budget_cap' | 'projection_guard'
export type PolicySeverity = 'hard' | 'soft'
export type AuthorizationDecisionType = 'allowed' | 'warn' | 'blocked'

export interface PolicyViolation {
  policyId: string
  policyType: PolicyType
  severity: PolicySeverity
  reason: string
}

export interface PreflightAuthorizationRequest {
  idempotencyKey: string
  amount: number  // In cents
  currency?: string
  counterpartyName?: string
  authorizingInstrumentId?: string
  expectedDate?: string
  category?: string
}

export interface PreflightAuthorizationResponse {
  success: boolean
  cached: boolean
  decision: {
    id: string
    decision: AuthorizationDecisionType
    violatedPolicies: PolicyViolation[]
    expiresAt: string
    createdAt: string
  }
  message?: string
}

export interface AuthorizationPolicy {
  id: string
  policyType: PolicyType
  config: Record<string, any>
  severity: PolicySeverity
  priority: number
  isActive: boolean
  createdAt: string
}

export interface CreatePolicyRequest {
  policyType: PolicyType
  config: Record<string, any>
  severity?: PolicySeverity
  priority?: number
}

export interface PreflightResult {
  decisionId: string
  decision: AuthorizationDecisionType
  warning?: string
}

export interface ProcessPayoutRequest {
  referenceId: string
  creatorId: string
  amount: number
  referenceType?: string
  description?: string
  payoutMethod?: string
  fees?: number
  feesPaidBy?: 'platform' | 'creator'
  metadata?: Record<string, unknown>
}

export interface RecordRefundRequest {
  originalSaleReference: string
  amount?: number
  reason: string
  refundFrom?: 'both' | 'platform_only' | 'creator_only'
  externalRefundId?: string
  idempotencyKey?: string
  /** Refund mode: 'ledger_only' records without processor settlement,
   *  'processor_refund' records and instructs processor to return funds. Default: 'ledger_only'. */
  mode?: 'ledger_only' | 'processor_refund'
  /** @deprecated Use mode: 'processor_refund' instead */
  executeProcessorRefund?: boolean
  processorPaymentId?: string
  metadata?: Record<string, unknown>
}

export interface RecordRefundResponse {
  success: boolean
  transactionId: string
  refundedAmount: number
  breakdown: {
    fromCreator: number
    fromPlatform: number
  }
  isFullRefund: boolean
}

export interface ReverseTransactionRequest {
  transactionId: string
  reason: string
  partialAmount?: number
}

export interface CreatePeriodRequest {
  startDate: string
  endDate: string
  name?: string
}

export interface ReconcileMatchRequest {
  transactionId: string
  bankTransactionId: string
}

export interface CreateSnapshotRequest {
  periodId?: string
  asOfDate?: string
}

export interface BackdatePolicyRequest {
  policyType: 'none' | 'soft' | 'hard'
  gracePeriodDays?: number
  maxBackdateDays?: number
  requireApproval?: boolean
  allowCurrentMonth?: boolean
  allowPriorMonth?: boolean
  blockPriorQuarter?: boolean
}

export interface CreateCreatorRequest {
  creatorId: string
  displayName?: string
  email?: string
  defaultSplitPercent?: number
  taxInfo?: {
    taxIdType?: 'ssn' | 'ein' | 'itin'
    taxIdLast4?: string
    legalName?: string
    businessType?: 'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
    }
  }
  payoutPreferences?: {
    schedule?: 'manual' | 'weekly' | 'biweekly' | 'monthly'
    minimumAmount?: number
    method?: 'card' | 'manual'
  }
  metadata?: Record<string, unknown>
}

export interface CreateLedgerRequest {
  businessName: string
  ownerEmail: string
  ledgerMode?: 'standard' | 'platform'
  settings?: {
    defaultTaxRate?: number
    defaultSplitPercent?: number
    platformFeePercent?: number
    minPayoutAmount?: number
    payoutSchedule?: 'manual' | 'weekly' | 'monthly'
    taxWithholdingPercent?: number
    currency?: string
    fiscalYearStart?: string
    receiptThreshold?: number
  }
}

export interface ExportReportRequest {
  reportType: 'transaction_detail' | 'creator_earnings' | 'platform_revenue' | 'payout_summary' | 'reconciliation' | 'audit_log'
  format: 'csv' | 'json'
  startDate?: string
  endDate?: string
  creatorId?: string
}

export interface RecordAdjustmentRequest {
  adjustmentType: 'correction' | 'reclassification' | 'accrual' | 'deferral' | 'depreciation' | 'write_off' | 'year_end' | 'opening_balance' | 'other'
  entries: Array<{
    accountType: string
    entityId?: string
    entryType: 'debit' | 'credit'
    amount: number
  }>
  reason: string
  adjustmentDate?: string
  originalTransactionId?: string
  supportingDocumentation?: string
  preparedBy: string
}

export interface RecordOpeningBalanceRequest {
  asOfDate: string
  source: 'manual' | 'imported' | 'migrated' | 'year_start'
  sourceDescription?: string
  balances: Array<{
    accountType: string
    entityId?: string
    balance: number
  }>
}

export interface RecordTransferRequest {
  fromAccountType: string
  toAccountType: string
  amount: number
  transferType: 'tax_reserve' | 'payout_reserve' | 'owner_draw' | 'owner_contribution' | 'operating' | 'savings' | 'investment' | 'other'
  description?: string
  referenceId?: string
}

export interface RiskEvaluationRequest {
  idempotencyKey: string
  amount: number
  currency?: string
  counterpartyName?: string
  authorizingInstrumentId?: string
  expectedDate?: string
  category?: string
}

export interface UploadReceiptRequest {
  fileUrl: string
  fileName?: string
  fileSize?: number
  mimeType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'
  merchantName?: string
  transactionDate?: string
  totalAmount?: number
  transactionId?: string
}

export interface ReceivePaymentRequest {
  amount: number
  invoiceTransactionId?: string
  customerName?: string
  customerId?: string
  referenceId?: string
  paymentMethod?: string
  paymentDate?: string
  metadata?: Record<string, unknown>
}

export interface SendBreachAlertRequest {
  cashBalance: number
  pendingTotal: number
  shortfall?: number
  coverageRatio?: number
  triggeredBy: 'project_intent' | 'get_runway' | 'manual'
  instrumentId?: string
  externalRef?: string
  projectionsCreated?: number
  channel?: 'slack' | 'email' | 'webhook'
}

// === RESPONSE TYPES ===

export interface SaleResponse {
  success: boolean
  transactionId: string
  breakdown: {
    grossAmount: number
    processingFee: number
    netAmount: number
    creatorAmount: number
    platformAmount: number
    creatorPercent: number
    platformPercent: number
    withheldAmount: number
    availableAmount: number
    withholdings: unknown[]
  }
  creatorBalance?: number
}

export interface CheckoutBreakdown {
  grossAmount: number
  creatorAmount: number
  platformAmount: number
  creatorPercent: number
}

export interface CreateCheckoutResponse {
  success: boolean
  provider: CheckoutProvider
  paymentId: string
  paymentIntentId: string
  clientSecret?: string | null
  checkoutUrl?: string | null
  status?: string | null
  requiresAction: boolean
  amount: number
  currency: string
  breakdown?: CheckoutBreakdown
}

export interface ReverseResponse {
  success: boolean
  voidType: 'soft_delete' | 'reversing_entry'
  message: string
  transactionId: string
  reversingTransactionId?: string
  voidedAt: string
  warning?: string
}

export interface Period {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'closed' | 'locked' | 'archived'
  lockedAt?: string
  balanceCheck?: {
    isBalanced: boolean
    totalDebits: number
    totalCredits: number
  }
}

export interface ReconciliationSnapshot {
  id: string
  periodStart: string
  periodEnd: string
  integrityHash: string
  integrityValid: boolean
  summary: {
    totalMatched: number
    totalUnmatched: number
    matchedAmount: number
    unmatchedAmount: number
  }
}

export interface FrozenStatement {
  type: 'profit_loss' | 'balance_sheet' | 'trial_balance'
  periodId: string
  generatedAt: string
  integrityHash: string
  integrityValid: boolean
  readOnly: true
  data: any
}

export interface CreateCreatorResponse {
  success: boolean
  creator: {
    id: string
    accountId: string
    displayName: string | null
    email: string | null
    defaultSplitPercent: number
    payoutPreferences: Record<string, unknown>
    createdAt: string
  }
}

export interface CreateLedgerResponse {
  success: boolean
  ledger: {
    id: string
    businessName: string
    ledgerMode: string
    apiKey: string
    status: string
    createdAt: string
  }
  warning: string
}

export interface ExportReportJsonResponse {
  success: boolean
  reportType: string
  generatedAt: string
  rowCount: number
  data: any[]
}

export interface ExportReportCsvResponse {
  csv: string
  filename: string
}

export interface RiskEvaluationResponse {
  success: boolean
  cached: boolean
  evaluation: {
    id: string
    signal: 'within_policy' | 'elevated_risk' | 'high_risk'
    riskFactors: Array<{
      policyId: string
      policyType: string
      severity: 'hard' | 'soft'
      indicator: string
    }>
    validUntil: string
    createdAt: string
    acknowledgedAt: string | null
  }
}

export interface UploadReceiptResponse {
  success: boolean
  receiptId: string
  status: 'uploaded' | 'matched' | 'orphan'
  linkedTransactionId: string | null
}

export interface ReceivePaymentResponse {
  success: boolean
  transactionId: string
  amount: number
}

export interface SendBreachAlertResponse {
  success: boolean
  message?: string
  alertsSent: number
  alertsFailed?: number
  alertsSkipped?: number
  results?: Array<{
    channel: string
    success: boolean
    error?: string
  }>
}

// === WALLET TYPES ===

export interface WalletBalanceResponse {
  success: boolean
  balance: number
  walletExists: boolean
  account: {
    id: string
    entityId: string
    name: string | null
    isActive: boolean
    createdAt: string
  } | null
}

export interface WalletDepositRequest {
  userId: string
  /** Amount in cents */
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface WalletWithdrawRequest {
  userId: string
  /** Amount in cents */
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface WalletTransferRequest {
  fromUserId: string
  toUserId: string
  /** Amount in cents */
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface WalletMutationResponse {
  success: boolean
  transactionId: string
  balance: number
}

export interface WalletTransferResponse {
  success: boolean
  transactionId: string
  fromBalance: number
  toBalance: number
}

export interface WalletHistoryEntry {
  entryId: string
  entryType: 'debit' | 'credit'
  amount: number
  transactionId: string
  referenceId: string
  transactionType: string
  description: string | null
  status: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface WalletHistoryResponse {
  success: boolean
  transactions: WalletHistoryEntry[]
  total: number
  limit: number
  offset: number
}

export class SoledgicError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
    public code?: string,
  ) {
    super(message)
    this.name = 'SoledgicError'
  }
}

export class ValidationError extends SoledgicError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends SoledgicError {
  constructor(message: string = 'Invalid API key', details?: unknown) {
    super(message, 401, details, 'AUTHENTICATION_ERROR')
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends SoledgicError {
  constructor(message: string, details?: unknown) {
    super(message, 404, details, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends SoledgicError {
  constructor(message: string, details?: unknown) {
    super(message, 409, details, 'CONFLICT')
    this.name = 'ConflictError'
  }
}

export class Soledgic {
  private _getKey: () => string
  private baseUrl: string
  private timeoutMs: number

  constructor(config: SoledgicConfig) {
    if (!config.apiKey) {
      throw new Error('apiKey is required')
    }
    if (!config.baseUrl) {
      throw new Error('baseUrl is required (e.g. https://your-project.supabase.co/functions/v1)')
    }
    // Store key in closure for protection against casual reflection
    let key: string | null = config.apiKey
    this._getKey = () => {
      if (!key) throw new Error('Client has been destroyed')
      return key
    }
    ;(this as any)._destroyKey = () => { key = null }
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.timeoutMs = config.timeout ?? 30_000
  }

  /** Clear the API key from memory. After calling destroy(), all requests will throw. */
  destroy(): void {
    (this as any)._destroyKey?.()
  }

  private throwTypedError(message: string, status: number, data: unknown): never {
    switch (status) {
      case 400: throw new ValidationError(message, data)
      case 401: throw new AuthenticationError(message, data)
      case 404: throw new NotFoundError(message, data)
      case 409: throw new ConflictError(message, data)
      default:  throw new SoledgicError(message, status, data)
    }
  }

  private async request<T>(endpoint: string, body: any): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: {
          'x-api-key': this._getKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const data = await response.json()
      if (!response.ok) {
        this.throwTypedError(
          data.error || `Request failed: ${response.status}`,
          response.status,
          data,
        )
      }
      return data
    } finally {
      clearTimeout(timer)
    }
  }

  private async requestGet<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': this._getKey(),
        },
        signal: controller.signal,
      })
      const data = await response.json()
      if (!response.ok) {
        this.throwTypedError(
          data.error || `Request failed: ${response.status}`,
          response.status,
          data,
        )
      }
      return data
    } finally {
      clearTimeout(timer)
    }
  }

  private async requestRaw(endpoint: string, body: any): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: {
          'x-api-key': this._getKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!response.ok) {
        const text = await response.text()
        let parsed: any
        try { parsed = JSON.parse(text) } catch { parsed = { error: text } }
        this.throwTypedError(
          parsed.error || `Request failed: ${response.status}`,
          response.status,
          parsed,
        )
      }
      return response
    } finally {
      clearTimeout(timer)
    }
  }

  // === MARKETPLACE MODE - SALES & PAYOUTS ===

  async createCheckout(req: CreateCheckoutRequest): Promise<CreateCheckoutResponse | CreateCheckoutSessionResponse> {
    const hasPaymentMethod = Boolean(req.paymentMethodId || req.sourceId)

    if (!hasPaymentMethod && !req.successUrl) {
      throw new Error('Either paymentMethodId/sourceId or successUrl is required')
    }

    const response = await this.request<any>('create-checkout', {
      amount: req.amount,
      creator_id: req.creatorId,
      currency: req.currency,
      product_id: req.productId,
      product_name: req.productName,
      customer_email: req.customerEmail,
      customer_id: req.customerId,
      payment_method_id: req.paymentMethodId,
      source_id: req.sourceId,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      idempotency_key: req.idempotencyKey,
      metadata: req.metadata,
    })

    // Session mode response
    if (response.mode === 'session') {
      const breakdown = response.breakdown
        ? {
            grossAmount: response.breakdown.gross_amount,
            creatorAmount: response.breakdown.creator_amount,
            platformAmount: response.breakdown.platform_amount,
            creatorPercent: response.breakdown.creator_percent,
          }
        : undefined

      return {
        success: Boolean(response.success),
        mode: 'session',
        sessionId: response.session_id,
        checkoutUrl: response.checkout_url,
        expiresAt: response.expires_at,
        breakdown,
      }
    }

    // Direct charge response
    const breakdown = response.breakdown
      ? {
          grossAmount: response.breakdown.gross_amount,
          creatorAmount: response.breakdown.creator_amount,
          platformAmount: response.breakdown.platform_amount,
          creatorPercent: response.breakdown.creator_percent,
        }
      : undefined

    return {
      success: Boolean(response.success),
      provider: response.provider,
      paymentId: response.payment_id ?? response.payment_intent_id,
      paymentIntentId: response.payment_intent_id ?? response.payment_id,
      clientSecret: response.client_secret ?? null,
      checkoutUrl: response.checkout_url ?? null,
      status: response.status ?? null,
      requiresAction: Boolean(response.requires_action),
      amount: response.amount,
      currency: response.currency,
      breakdown,
    }
  }

  async recordSale(req: RecordSaleRequest): Promise<SaleResponse> {
    return this.request('record-sale', {
      reference_id: req.referenceId,
      creator_id: req.creatorId,
      amount: req.amount,
      processing_fee: req.processingFee,
      processing_fee_paid_by: req.processingFeePaidBy,
      creator_percent: req.creatorPercent,
      product_id: req.productId,
      product_name: req.productName,
      creator_name: req.creatorName,
      skip_withholding: req.skipWithholding,
      transaction_date: req.transactionDate,
      metadata: req.metadata,
    })
  }

  async processPayout(req: ProcessPayoutRequest) {
    return this.request('process-payout', {
      reference_id: req.referenceId,
      creator_id: req.creatorId,
      amount: req.amount,
      reference_type: req.referenceType,
      description: req.description,
      payout_method: req.payoutMethod,
      fees: req.fees,
      fees_paid_by: req.feesPaidBy,
      metadata: req.metadata,
    })
  }

  async recordRefund(req: RecordRefundRequest): Promise<RecordRefundResponse> {
    const response = await this.request<any>('record-refund', {
      original_sale_reference: req.originalSaleReference,
      amount: req.amount,
      reason: req.reason,
      refund_from: req.refundFrom,
      external_refund_id: req.externalRefundId,
      idempotency_key: req.idempotencyKey,
      mode: req.mode,
      execute_processor_refund: req.executeProcessorRefund,
      processor_payment_id: req.processorPaymentId,
      metadata: req.metadata,
    })
    return {
      success: response.success,
      transactionId: response.transaction_id,
      refundedAmount: response.refunded_amount,
      breakdown: {
        fromCreator: response.breakdown?.from_creator,
        fromPlatform: response.breakdown?.from_platform,
      },
      isFullRefund: response.is_full_refund,
    }
  }

  // === STANDARD MODE - INCOME & EXPENSES ===

  async recordIncome(req: RecordIncomeRequest) {
    return this.request('record-income', {
      reference_id: req.referenceId,
      amount: req.amount,
      description: req.description,
      category: req.category,
      customer_id: req.customerId,
      customer_name: req.customerName,
      received_to: req.receivedTo,
      invoice_id: req.invoiceId,
      transaction_date: req.transactionDate,
      metadata: req.metadata,
    })
  }

  async recordExpense(req: RecordExpenseRequest) {
    return this.request('record-expense', {
      reference_id: req.referenceId,
      amount: req.amount,
      description: req.description,
      category: req.category,
      vendor_id: req.vendorId,
      vendor_name: req.vendorName,
      paid_from: req.paidFrom,
      receipt_url: req.receiptUrl,
      tax_deductible: req.taxDeductible,
      transaction_date: req.transactionDate,
      metadata: req.metadata,
      authorizing_instrument_id: req.authorizingInstrumentId,
      risk_evaluation_id: req.riskEvaluationId,
      authorization_decision_id: req.authorizationDecisionId,
    })
  }

  async recordBill(req: RecordBillRequest) {
    return this.request('record-bill', {
      amount: req.amount,
      description: req.description,
      vendor_name: req.vendorName,
      vendor_id: req.vendorId,
      reference_id: req.referenceId,
      due_date: req.dueDate,
      expense_category: req.expenseCategory,
      paid: req.paid,
      metadata: req.metadata,
      authorizing_instrument_id: req.authorizingInstrumentId,
      risk_evaluation_id: req.riskEvaluationId,
      authorization_decision_id: req.authorizationDecisionId,
    })
  }

  // === AUTHORIZING INSTRUMENTS ===
  // Register financial authorization instruments for transaction validation
  // Instruments are immutable and ledger-adjacent - they explain WHY money moved

  async registerInstrument(req: RegisterInstrumentRequest): Promise<RegisterInstrumentResponse> {
    return this.request('register-instrument', {
      external_ref: req.externalRef,
      extracted_terms: {
        amount: req.extractedTerms.amount,
        currency: req.extractedTerms.currency,
        cadence: req.extractedTerms.cadence,
        counterparty_name: req.extractedTerms.counterpartyName,
      },
    })
  }

  // === SHADOW LEDGER (GHOST ENTRIES) ===
  // Project future obligations based on authorizing instrument terms.
  // Ghost entries NEVER affect balances or entries - only express future intent.

  async projectIntent(req: ProjectIntentRequest): Promise<ProjectIntentResponse> {
    const response = await this.request<any>('project-intent', {
      authorizing_instrument_id: req.authorizingInstrumentId,
      until_date: req.untilDate,
      horizon_count: req.horizonCount,
    })
    return {
      success: response.success,
      instrumentId: response.instrument_id,
      externalRef: response.external_ref,
      cadence: response.cadence,
      projectionsCreated: response.projections_created,
      projectionsRequested: response.projections_requested,
      duplicatesSkipped: response.duplicates_skipped,
      dateRange: response.date_range,
      projectedDates: response.projected_dates,
    }
  }

  // === REVERSALS & CORRECTIONS ===

  async reverseTransaction(req: ReverseTransactionRequest): Promise<ReverseResponse> {
    return this.request('reverse-transaction', {
      transaction_id: req.transactionId,
      reason: req.reason,
      partial_amount: req.partialAmount,
    })
  }

  // === PERIOD MANAGEMENT ===

  async listPeriods(): Promise<{ success: boolean; periods: Period[] }> {
    return this.request('close-period', { action: 'list' })
  }

  async createPeriod(req: CreatePeriodRequest): Promise<{ success: boolean; period: Period }> {
    return this.request('close-period', {
      action: 'create',
      start_date: req.startDate,
      end_date: req.endDate,
      name: req.name,
    })
  }

  async closePeriod(year: number, month?: number, quarter?: number): Promise<any> {
    return this.request('close-period', { year, month, quarter })
  }

  // === RECONCILIATION ===

  async matchTransaction(req: ReconcileMatchRequest) {
    return this.request('reconcile', {
      action: 'match',
      transaction_id: req.transactionId,
      bank_transaction_id: req.bankTransactionId,
    })
  }

  async unmatchTransaction(transactionId: string) {
    return this.request('reconcile', {
      action: 'unmatch',
      transaction_id: transactionId,
    })
  }

  async listUnmatchedTransactions() {
    return this.request('reconcile', { action: 'list_unmatched' })
  }

  async createReconciliationSnapshot(req: CreateSnapshotRequest): Promise<{ success: boolean; snapshot_id: string; integrity_hash: string }> {
    return this.request('reconcile', {
      action: 'create_snapshot',
      period_id: req.periodId,
      as_of_date: req.asOfDate,
    })
  }

  async getReconciliationSnapshot(periodId: string): Promise<{ success: boolean; snapshot: ReconciliationSnapshot }> {
    return this.request('reconcile', {
      action: 'get_snapshot',
      period_id: periodId,
    })
  }

  // === FROZEN STATEMENTS ===

  async generateFrozenStatements(periodId: string) {
    return this.request('frozen-statements', {
      action: 'generate',
      period_id: periodId,
    })
  }

  async getFrozenStatement(periodId: string, statementType: 'profit_loss' | 'balance_sheet' | 'trial_balance'): Promise<{ success: boolean; statement: FrozenStatement }> {
    return this.request('frozen-statements', {
      action: 'get',
      period_id: periodId,
      statement_type: statementType,
    })
  }

  async listFrozenStatements(periodId?: string) {
    return this.request('frozen-statements', {
      action: 'list',
      period_id: periodId,
    })
  }

  async verifyFrozenStatements(periodId: string): Promise<{ success: boolean; all_valid: boolean; verification_results: any[] }> {
    return this.request('frozen-statements', {
      action: 'verify',
      period_id: periodId,
    })
  }

  // === SPLITS MANAGEMENT ===

  async listTiers() {
    return this.request('manage-splits', { action: 'list_tiers' })
  }

  async getEffectiveSplit(creatorId: string) {
    return this.request('manage-splits', { action: 'get_effective_split', creator_id: creatorId })
  }

  async setCreatorSplit(creatorId: string, splitPercent: number) {
    return this.request('manage-splits', { action: 'set_creator_split', creator_id: creatorId, split_percent: splitPercent })
  }

  async clearCreatorSplit(creatorId: string) {
    return this.request('manage-splits', { action: 'clear_creator_split', creator_id: creatorId })
  }

  async autoPromoteCreators() {
    return this.request('manage-splits', { action: 'auto_promote' })
  }

  // === BALANCES ===

  async getAllBalances() {
    return this.request('get-balances', { action: 'all_accounts' })
  }

  async getCreatorBalances() {
    return this.request('get-balances', { action: 'creator_balances' })
  }

  async getCreatorBalance(creatorId: string) {
    return this.request('get-balances', { action: 'single_creator', creator_id: creatorId })
  }

  async getSummary() {
    return this.request('get-balances', { action: 'summary' })
  }

  // === REPORTS ===

  async getProfitLoss(startDate: string, endDate: string) {
    return this.request('generate-report', { report_type: 'profit_loss', start_date: startDate, end_date: endDate })
  }

  async getTrialBalance(asOf?: string) {
    return this.request('generate-report', { report_type: 'trial_balance', as_of: asOf })
  }

  async get1099Summary(year: number) {
    return this.request('generate-report', { report_type: '1099_summary', tax_year: year })
  }

  async getCreatorEarnings(startDate: string, endDate: string) {
    return this.request('generate-report', { report_type: 'creator_earnings', start_date: startDate, end_date: endDate })
  }

  async getTransactions(startDate?: string, endDate?: string, creatorId?: string) {
    return this.request('generate-report', { report_type: 'transaction_history', start_date: startDate, end_date: endDate, creator_id: creatorId })
  }

  // === PDF EXPORTS ===

  async generatePDF(reportType: 'creator_statement' | 'profit_loss' | 'trial_balance' | '1099', options: {
    creatorId?: string
    startDate?: string
    endDate?: string
    taxYear?: number
    periodId?: string
  } = {}): Promise<{ success: boolean; filename: string; data: string; frozen?: boolean }> {
    return this.request('generate-pdf', {
      report_type: reportType,
      creator_id: options.creatorId,
      start_date: options.startDate,
      end_date: options.endDate,
      tax_year: options.taxYear,
      period_id: options.periodId
    })
  }

  async getCreatorStatement(creatorId: string, startDate: string, endDate: string) {
    return this.generatePDF('creator_statement', { creatorId, startDate, endDate })
  }

  async getProfitLossPDF(startDate: string, endDate: string, periodId?: string) {
    return this.generatePDF('profit_loss', { startDate, endDate, periodId })
  }

  async getTrialBalancePDF() {
    return this.generatePDF('trial_balance', {})
  }

  async get1099PDF(taxYear: number) {
    return this.generatePDF('1099', { taxYear })
  }

  // === AUTO-EMAIL ===

  async configureEmail(config: {
    enabled: boolean
    sendDay?: number
    fromName?: string
    fromEmail?: string
    subjectTemplate?: string
    bodyTemplate?: string
    ccAdmin?: boolean
    adminEmail?: string
  }) {
    return this.request('send-statements', {
      action: 'configure',
      email_config: {
        enabled: config.enabled,
        send_day: config.sendDay || 1,
        from_name: config.fromName,
        from_email: config.fromEmail,
        subject_template: config.subjectTemplate,
        body_template: config.bodyTemplate,
        cc_admin: config.ccAdmin,
        admin_email: config.adminEmail,
      }
    })
  }

  async sendMonthlyStatements(year?: number, month?: number) {
    return this.request('send-statements', {
      action: 'send_monthly_statements',
      year,
      month,
    })
  }

  async sendCreatorStatement(creatorId: string, year?: number, month?: number) {
    return this.request('send-statements', {
      action: 'send_single_statement',
      creator_id: creatorId,
      year,
      month,
    })
  }

  async previewStatementEmail(creatorId: string, year?: number, month?: number) {
    return this.request('send-statements', {
      action: 'preview',
      creator_id: creatorId,
      year,
      month,
    })
  }

  async getEmailHistory() {
    return this.request('send-statements', { action: 'get_queue' })
  }

  // === PAYOUT RAILS ===

  async listPayoutRails() {
    return this.request('execute-payout', { action: 'list_rails' })
  }

  async configurePayoutRail(rail: 'card' | 'wise' | 'manual' | 'crypto', config: {
    enabled: boolean
    credentials?: Record<string, string>
    settings?: Record<string, any>
  }) {
    return this.request('execute-payout', {
      action: 'configure_rail',
      rail_config: {
        rail,
        enabled: config.enabled,
        credentials: config.credentials,
        settings: config.settings,
      }
    })
  }

  async executePayout(payoutId: string, rail?: string) {
    return this.request('execute-payout', {
      action: 'execute',
      payout_id: payoutId,
      rail,
    })
  }

  async executeBatchPayouts(payoutIds: string[], rail?: string) {
    return this.request('execute-payout', {
      action: 'batch_execute',
      payout_ids: payoutIds,
      rail,
    })
  }

  async generateBatchPayoutFile(payoutIds: string[]) {
    return this.request('execute-payout', {
      action: 'generate_batch_file',
      payout_ids: payoutIds,
    })
  }

  // === WEBHOOKS ===

  async listWebhookEndpoints() {
    return this.request('webhooks', { action: 'list' })
  }

  async createWebhookEndpoint(config: {
    url: string
    description?: string
    events?: string[]
  }) {
    return this.request('webhooks', {
      action: 'create',
      url: config.url,
      description: config.description,
      events: config.events || ['*'],
    })
  }

  async updateWebhookEndpoint(endpointId: string, updates: {
    url?: string
    description?: string
    events?: string[]
    isActive?: boolean
  }) {
    return this.request('webhooks', {
      action: 'update',
      endpoint_id: endpointId,
      url: updates.url,
      description: updates.description,
      events: updates.events,
      is_active: updates.isActive,
    })
  }

  async deleteWebhookEndpoint(endpointId: string) {
    return this.request('webhooks', { action: 'delete', endpoint_id: endpointId })
  }

  async testWebhookEndpoint(endpointId: string) {
    return this.request('webhooks', { action: 'test', endpoint_id: endpointId })
  }

  async getWebhookDeliveries(endpointId?: string) {
    return this.request('webhooks', { action: 'deliveries', endpoint_id: endpointId })
  }

  async retryWebhookDelivery(deliveryId: string) {
    return this.request('webhooks', { action: 'retry', delivery_id: deliveryId })
  }

  // === BREACH ALERTS ===
  // Configure Slack, email, or webhook notifications for breach risk events.
  // Alerts trigger when project-intent creates projections that exceed cash coverage.

  async listAlerts(): Promise<{ success: boolean; data: AlertConfiguration[] }> {
    const response = await this.request<any>('configure-alerts', { action: 'list' })
    return {
      success: response.success,
      data: (response.data || []).map((c: any) => ({
        id: c.id,
        alertType: c.alert_type,
        channel: c.channel,
        config: c.config,
        thresholds: {
          coverageRatioBelow: c.thresholds?.coverage_ratio_below,
          shortfallAbove: c.thresholds?.shortfall_above,
        },
        isActive: c.is_active,
        lastTriggeredAt: c.last_triggered_at,
        triggerCount: c.trigger_count,
        createdAt: c.created_at,
      })),
    }
  }

  async createAlert(req: CreateAlertRequest): Promise<{ success: boolean; data: AlertConfiguration }> {
    const config: Record<string, any> = {}
    if ('webhookUrl' in req.config) {
      config.webhook_url = req.config.webhookUrl
      config.channel = (req.config as SlackAlertConfig).channel
    } else if ('recipients' in req.config) {
      config.recipients = req.config.recipients
    }

    const response = await this.request<any>('configure-alerts', {
      action: 'create',
      alert_type: req.alertType,
      channel: req.channel,
      config,
      thresholds: req.thresholds ? {
        coverage_ratio_below: req.thresholds.coverageRatioBelow,
        shortfall_above: req.thresholds.shortfallAbove,
      } : undefined,
      is_active: req.isActive,
    })

    return {
      success: response.success,
      data: {
        id: response.data.id,
        alertType: response.data.alert_type,
        channel: response.data.channel,
        config: response.data.config || {},
        thresholds: {
          coverageRatioBelow: response.data.thresholds?.coverage_ratio_below,
          shortfallAbove: response.data.thresholds?.shortfall_above,
        },
        isActive: response.data.is_active,
        triggerCount: response.data.trigger_count || 0,
        createdAt: response.data.created_at,
      },
    }
  }

  async updateAlert(req: UpdateAlertRequest): Promise<{ success: boolean; data: AlertConfiguration }> {
    const config: Record<string, any> | undefined = req.config ? {} : undefined
    if (req.config) {
      if ('webhookUrl' in req.config && req.config.webhookUrl) {
        config!.webhook_url = req.config.webhookUrl
      }
      if ('channel' in req.config) {
        config!.channel = req.config.channel
      }
      if ('recipients' in req.config) {
        config!.recipients = req.config.recipients
      }
    }

    const response = await this.request<any>('configure-alerts', {
      action: 'update',
      config_id: req.configId,
      config,
      thresholds: req.thresholds ? {
        coverage_ratio_below: req.thresholds.coverageRatioBelow,
        shortfall_above: req.thresholds.shortfallAbove,
      } : undefined,
      is_active: req.isActive,
    })

    return {
      success: response.success,
      data: {
        id: response.data.id,
        alertType: response.data.alert_type,
        channel: response.data.channel,
        config: response.data.config || {},
        thresholds: {
          coverageRatioBelow: response.data.thresholds?.coverage_ratio_below,
          shortfallAbove: response.data.thresholds?.shortfall_above,
        },
        isActive: response.data.is_active,
        triggerCount: response.data.trigger_count ?? 0,
        createdAt: response.data.created_at ?? '',
      },
    }
  }

  async deleteAlert(configId: string): Promise<{ success: boolean; message: string }> {
    return this.request('configure-alerts', {
      action: 'delete',
      config_id: configId,
    })
  }

  async testAlert(configId: string): Promise<AlertTestResult> {
    return this.request('configure-alerts', {
      action: 'test',
      config_id: configId,
    })
  }

  // === PREFLIGHT AUTHORIZATION (Phase 3) ===
  // Evaluate whether a proposed transaction should be allowed BEFORE execution.
  // This does NOT move money - only decides if the transaction is permitted.

  async preflightAuthorization(req: PreflightAuthorizationRequest): Promise<PreflightAuthorizationResponse> {
    const response = await this.request<any>('preflight-authorization', {
      idempotency_key: req.idempotencyKey,
      amount: req.amount,
      currency: req.currency,
      counterparty_name: req.counterpartyName,
      authorizing_instrument_id: req.authorizingInstrumentId,
      expected_date: req.expectedDate,
      category: req.category,
    })
    return {
      success: response.success,
      cached: response.cached,
      decision: {
        id: response.decision.id,
        decision: response.decision.decision,
        violatedPolicies: (response.decision.violated_policies || []).map((v: any) => ({
          policyId: v.policy_id,
          policyType: v.policy_type,
          severity: v.severity,
          reason: v.reason,
        })),
        expiresAt: response.decision.expires_at,
        createdAt: response.decision.created_at,
      },
      message: response.message,
    }
  }

  // Convenience method: preflight check then record expense if allowed
  async preflightAndRecordExpense(
    preflight: PreflightAuthorizationRequest,
    expense: Omit<RecordExpenseRequest, 'authorizationDecisionId'>
  ): Promise<{ preflight: PreflightAuthorizationResponse; transaction?: any }> {
    const preflightResult = await this.preflightAuthorization(preflight)

    if (preflightResult.decision.decision === 'blocked') {
      return { preflight: preflightResult }
    }

    const transaction = await this.recordExpense({
      ...expense,
      authorizationDecisionId: preflightResult.decision.id,
    })

    return { preflight: preflightResult, transaction }
  }

  // Convenience method: preflight check then record bill if allowed
  async preflightAndRecordBill(
    preflight: PreflightAuthorizationRequest,
    bill: Omit<RecordBillRequest, 'authorizationDecisionId'>
  ): Promise<{ preflight: PreflightAuthorizationResponse; transaction?: any }> {
    const preflightResult = await this.preflightAuthorization(preflight)

    if (preflightResult.decision.decision === 'blocked') {
      return { preflight: preflightResult }
    }

    const transaction = await this.recordBill({
      ...bill,
      authorizationDecisionId: preflightResult.decision.id,
    })

    return { preflight: preflightResult, transaction }
  }

  // === BANK IMPORT ===

  async getImportTemplates() {
    return this.request('import-transactions', { action: 'get_templates' })
  }

  async parseImportFile(fileBase64: string, format?: 'csv' | 'ofx' | 'qfx' | 'auto') {
    return this.request('import-transactions', {
      action: 'parse_preview',
      data: fileBase64,
      format,
    })
  }

  async importTransactions(transactions: Array<{
    date: string
    description: string
    amount: number
    reference?: string
  }>) {
    return this.request('import-transactions', {
      action: 'import',
      transactions,
    })
  }

  async saveImportTemplate(template: {
    name: string
    bank_name: string
    format: string
    mapping: Record<string, string | number>
    skip_rows?: number
    delimiter?: string
  }) {
    return this.request('import-transactions', {
      action: 'save_template',
      template,
    })
  }

  // === ESCROW / HELD FUNDS ===

  async getEscrowSummary() {
    return this.request('release-funds', { action: 'get_summary' })
  }

  async getHeldFunds(options?: { ventureId?: string; creatorId?: string; readyOnly?: boolean; limit?: number }) {
    return this.request('release-funds', {
      action: 'get_held',
      venture_id: options?.ventureId,
      creator_id: options?.creatorId,
      ready_only: options?.readyOnly,
      limit: options?.limit,
    })
  }

  async releaseFunds(entryId: string, executeTransfer = true) {
    return this.request('release-funds', {
      action: 'release',
      entry_id: entryId,
      execute_transfer: executeTransfer,
    })
  }

  async batchReleaseFunds(entryIds: string[], executeTransfer = true) {
    return this.request('release-funds', {
      action: 'batch_release',
      entry_ids: entryIds,
      execute_transfer: executeTransfer,
    })
  }

  async autoReleaseFunds(options?: { executeTransfer?: boolean; limit?: number }) {
    return this.request('release-funds', {
      action: 'auto_release',
      execute_transfer: options?.executeTransfer,
      limit: options?.limit,
    })
  }

  // === PAYOUT ELIGIBILITY ===

  async checkPayoutEligibility(creatorId: string) {
    return this.request('check-payout-eligibility', { creator_id: creatorId })
  }

  // === HEALTH CHECKS ===

  async runHealthCheck() {
    return this.request('health-check', { action: 'run' })
  }

  async getHealthStatus() {
    return this.request('health-check', { action: 'status' })
  }

  async getHealthHistory() {
    return this.request('health-check', { action: 'history' })
  }

  // === FINANCIAL REPORTS (DETAILED) ===

  async getAPAging(asOfDate?: string) {
    return this.requestGet('ap-aging', { as_of_date: asOfDate })
  }

  async getARAging(asOfDate?: string) {
    return this.requestGet('ar-aging', { as_of_date: asOfDate })
  }

  async getBalanceSheet(asOfDate?: string) {
    return this.requestGet('balance-sheet', { as_of_date: asOfDate })
  }

  async getDetailedTrialBalance(options?: { asOf?: string; snapshot?: boolean }) {
    return this.requestGet('trial-balance', {
      as_of: options?.asOf,
      snapshot: options?.snapshot ? 'true' : undefined,
    })
  }

  async getDetailedProfitLoss(options?: {
    year?: number
    month?: number
    quarter?: number
    startDate?: string
    endDate?: string
    breakdown?: 'monthly'
  }) {
    return this.requestGet('profit-loss', {
      year: options?.year,
      month: options?.month,
      quarter: options?.quarter,
      start_date: options?.startDate,
      end_date: options?.endDate,
      breakdown: options?.breakdown,
    })
  }

  async getRunway() {
    return this.requestGet('get-runway')
  }

  // === CREATOR ONBOARDING ===

  async createCreator(req: CreateCreatorRequest): Promise<CreateCreatorResponse> {
    const response = await this.request<any>('create-creator', {
      creator_id: req.creatorId,
      display_name: req.displayName,
      email: req.email,
      default_split_percent: req.defaultSplitPercent,
      tax_info: req.taxInfo ? {
        tax_id_type: req.taxInfo.taxIdType,
        tax_id_last4: req.taxInfo.taxIdLast4,
        legal_name: req.taxInfo.legalName,
        business_type: req.taxInfo.businessType,
        address: req.taxInfo.address ? {
          line1: req.taxInfo.address.line1,
          line2: req.taxInfo.address.line2,
          city: req.taxInfo.address.city,
          state: req.taxInfo.address.state,
          postal_code: req.taxInfo.address.postalCode,
          country: req.taxInfo.address.country,
        } : undefined,
      } : undefined,
      payout_preferences: req.payoutPreferences ? {
        schedule: req.payoutPreferences.schedule,
        minimum_amount: req.payoutPreferences.minimumAmount,
        method: req.payoutPreferences.method,
      } : undefined,
      metadata: req.metadata,
    })
    return {
      success: response.success,
      creator: {
        id: response.creator.id,
        accountId: response.creator.account_id,
        displayName: response.creator.display_name,
        email: response.creator.email,
        defaultSplitPercent: response.creator.default_split_percent,
        payoutPreferences: response.creator.payout_preferences || {},
        createdAt: response.creator.created_at,
      },
    }
  }

  // === LEDGER MANAGEMENT ===

  async createLedger(req: CreateLedgerRequest): Promise<CreateLedgerResponse> {
    const response = await this.request<any>('create-ledger', {
      business_name: req.businessName,
      owner_email: req.ownerEmail,
      ledger_mode: req.ledgerMode,
      settings: req.settings ? {
        default_tax_rate: req.settings.defaultTaxRate,
        default_split_percent: req.settings.defaultSplitPercent,
        platform_fee_percent: req.settings.platformFeePercent,
        min_payout_amount: req.settings.minPayoutAmount,
        payout_schedule: req.settings.payoutSchedule,
        tax_withholding_percent: req.settings.taxWithholdingPercent,
        currency: req.settings.currency,
        fiscal_year_start: req.settings.fiscalYearStart,
        receipt_threshold: req.settings.receiptThreshold,
      } : undefined,
    })
    return {
      success: response.success,
      ledger: {
        id: response.ledger.id,
        businessName: response.ledger.business_name,
        ledgerMode: response.ledger.ledger_mode,
        apiKey: response.ledger.api_key,
        status: response.ledger.status,
        createdAt: response.ledger.created_at,
      },
      warning: response.warning,
    }
  }

  // === ACCOUNTING ADJUSTMENTS ===

  async recordAdjustment(req: RecordAdjustmentRequest) {
    return this.request('record-adjustment', {
      adjustment_type: req.adjustmentType,
      adjustment_date: req.adjustmentDate,
      entries: req.entries.map(e => ({
        account_type: e.accountType,
        entity_id: e.entityId,
        entry_type: e.entryType,
        amount: e.amount,
      })),
      reason: req.reason,
      original_transaction_id: req.originalTransactionId,
      supporting_documentation: req.supportingDocumentation,
      prepared_by: req.preparedBy,
    })
  }

  async recordOpeningBalance(req: RecordOpeningBalanceRequest) {
    return this.request('record-opening-balance', {
      as_of_date: req.asOfDate,
      source: req.source,
      source_description: req.sourceDescription,
      balances: req.balances.map(b => ({
        account_type: b.accountType,
        entity_id: b.entityId,
        balance: b.balance,
      })),
    })
  }

  async recordTransfer(req: RecordTransferRequest) {
    return this.request('record-transfer', {
      from_account_type: req.fromAccountType,
      to_account_type: req.toAccountType,
      amount: req.amount,
      transfer_type: req.transferType,
      description: req.description,
      reference_id: req.referenceId,
    })
  }

  // === RISK & POLICY ===

  async evaluateRisk(req: RiskEvaluationRequest): Promise<RiskEvaluationResponse> {
    const response = await this.request<any>('risk-evaluation', {
      idempotency_key: req.idempotencyKey,
      amount: req.amount,
      currency: req.currency,
      counterparty_name: req.counterpartyName,
      authorizing_instrument_id: req.authorizingInstrumentId,
      expected_date: req.expectedDate,
      category: req.category,
    })
    return {
      success: response.success,
      cached: response.cached,
      evaluation: {
        id: response.evaluation.id,
        signal: response.evaluation.signal,
        riskFactors: (response.evaluation.risk_factors || []).map((f: any) => ({
          policyId: f.policy_id,
          policyType: f.policy_type,
          severity: f.severity,
          indicator: f.indicator,
        })),
        validUntil: response.evaluation.valid_until,
        createdAt: response.evaluation.created_at,
        acknowledgedAt: response.evaluation.acknowledged_at,
      },
    }
  }

  async createRiskPolicy(req: CreatePolicyRequest) {
    return this.request('configure-risk-policy', {
      action: 'create',
      policy_type: req.policyType,
      config: req.config,
      severity: req.severity,
      priority: req.priority,
    })
  }

  async listRiskPolicies() {
    return this.request('configure-risk-policy', { action: 'list' })
  }

  async deleteRiskPolicy(policyId: string) {
    return this.request('configure-risk-policy', { action: 'delete', policy_id: policyId })
  }

  // === TAX DOCUMENTS ===

  async calculateTaxForCreator(creatorId: string, taxYear?: number) {
    return this.request('tax-documents', {
      action: 'calculate',
      creator_id: creatorId,
      tax_year: taxYear,
    })
  }

  async generateAllTaxDocuments(taxYear?: number) {
    return this.request('tax-documents', { action: 'generate_all', tax_year: taxYear })
  }

  async listTaxDocuments(taxYear?: number) {
    return this.request('tax-documents', { action: 'list', tax_year: taxYear })
  }

  async getTaxDocument(documentId: string) {
    return this.request('tax-documents', { action: 'get', document_id: documentId })
  }

  async exportTaxDocuments(taxYear?: number, format: 'csv' | 'json' = 'json') {
    const body = { action: 'export', tax_year: taxYear, format }
    if (format === 'csv') {
      const response = await this.requestRaw('tax-documents', body)
      const csv = await response.text()
      const disposition = response.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      return { csv, filename: filenameMatch?.[1] || `1099_export_${taxYear}.csv` }
    }
    return this.request('tax-documents', body)
  }

  async markTaxDocumentFiled(documentId: string) {
    return this.request('tax-documents', { action: 'mark_filed', document_id: documentId })
  }

  async generateTaxSummary(taxYear: number, creatorId?: string) {
    return this.request('generate-tax-summary', {
      tax_year: taxYear,
      creator_id: creatorId,
    })
  }

  // === DATA EXPORT ===

  async exportReport(req: ExportReportRequest & { format: 'json' }): Promise<ExportReportJsonResponse>
  async exportReport(req: ExportReportRequest & { format: 'csv' }): Promise<ExportReportCsvResponse>
  async exportReport(req: ExportReportRequest): Promise<ExportReportJsonResponse | ExportReportCsvResponse>
  async exportReport(req: ExportReportRequest): Promise<ExportReportJsonResponse | ExportReportCsvResponse> {
    const body = {
      report_type: req.reportType,
      format: req.format,
      start_date: req.startDate,
      end_date: req.endDate,
      creator_id: req.creatorId,
    }
    if (req.format === 'csv') {
      const response = await this.requestRaw('export-report', body)
      const csv = await response.text()
      const disposition = response.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      return { csv, filename: filenameMatch?.[1] || `${req.reportType}.csv` }
    }
    return this.request('export-report', body)
  }

  // === RECEIPTS ===

  async uploadReceipt(req: UploadReceiptRequest): Promise<UploadReceiptResponse> {
    return this.request('upload-receipt', {
      file_url: req.fileUrl,
      file_name: req.fileName,
      file_size: req.fileSize,
      mime_type: req.mimeType,
      merchant_name: req.merchantName,
      transaction_date: req.transactionDate,
      total_amount: req.totalAmount,
      transaction_id: req.transactionId,
    })
  }

  // === PAYMENTS ===

  async receivePayment(req: ReceivePaymentRequest): Promise<ReceivePaymentResponse> {
    return this.request('receive-payment', {
      amount: req.amount,
      invoice_transaction_id: req.invoiceTransactionId,
      customer_name: req.customerName,
      customer_id: req.customerId,
      reference_id: req.referenceId,
      payment_method: req.paymentMethod,
      payment_date: req.paymentDate,
      metadata: req.metadata,
    })
  }

  // === BREACH ALERTS ===

  async sendBreachAlert(req: SendBreachAlertRequest): Promise<SendBreachAlertResponse> {
    const response = await this.request<any>('send-breach-alert', {
      cash_balance: req.cashBalance,
      pending_total: req.pendingTotal,
      shortfall: req.shortfall,
      coverage_ratio: req.coverageRatio,
      triggered_by: req.triggeredBy,
      instrument_id: req.instrumentId,
      external_ref: req.externalRef,
      projections_created: req.projectionsCreated,
      channel: req.channel,
    })
    return {
      success: response.success,
      message: response.message,
      alertsSent: response.alerts_sent ?? 0,
      alertsFailed: response.alerts_failed,
      alertsSkipped: response.alerts_skipped,
      results: response.results
        ? response.results.map((r: any) => ({
            channel: r.channel,
            success: r.success,
            error: r.error,
          }))
        : undefined,
    }
  }

  // === WALLETS ===

  async getWalletBalance(userId: string): Promise<WalletBalanceResponse> {
    const response = await this.request<any>('manage-wallet', {
      action: 'get_balance',
      user_id: userId,
    })
    return {
      success: response.success,
      balance: response.balance,
      walletExists: response.wallet_exists,
      account: response.account
        ? {
            id: response.account.id,
            entityId: response.account.entity_id,
            name: response.account.name,
            isActive: response.account.is_active,
            createdAt: response.account.created_at,
          }
        : null,
    }
  }

  async walletDeposit(req: WalletDepositRequest): Promise<WalletMutationResponse> {
    const response = await this.request<any>('manage-wallet', {
      action: 'deposit',
      user_id: req.userId,
      amount: req.amount,
      reference_id: req.referenceId,
      description: req.description,
      metadata: req.metadata,
    })
    return {
      success: response.success,
      transactionId: response.transaction_id,
      balance: response.balance,
    }
  }

  async walletWithdraw(req: WalletWithdrawRequest): Promise<WalletMutationResponse> {
    const response = await this.request<any>('manage-wallet', {
      action: 'withdraw',
      user_id: req.userId,
      amount: req.amount,
      reference_id: req.referenceId,
      description: req.description,
      metadata: req.metadata,
    })
    return {
      success: response.success,
      transactionId: response.transaction_id,
      balance: response.balance,
    }
  }

  async walletTransfer(req: WalletTransferRequest): Promise<WalletTransferResponse> {
    const response = await this.request<any>('manage-wallet', {
      action: 'transfer',
      from_user_id: req.fromUserId,
      to_user_id: req.toUserId,
      amount: req.amount,
      reference_id: req.referenceId,
      description: req.description,
      metadata: req.metadata,
    })
    return {
      success: response.success,
      transactionId: response.transaction_id,
      fromBalance: response.from_balance,
      toBalance: response.to_balance,
    }
  }

  async getWalletHistory(userId: string, options?: { limit?: number; offset?: number }): Promise<WalletHistoryResponse> {
    const response = await this.request<any>('manage-wallet', {
      action: 'history',
      user_id: userId,
      limit: options?.limit,
      offset: options?.offset,
    })
    return {
      success: response.success,
      transactions: (response.transactions || []).map((t: any) => ({
        entryId: t.entry_id,
        entryType: t.entry_type,
        amount: t.amount,
        transactionId: t.transaction_id,
        referenceId: t.reference_id,
        transactionType: t.transaction_type,
        description: t.description,
        status: t.status,
        metadata: t.metadata,
        createdAt: t.created_at,
      })),
      total: response.total,
      limit: response.limit,
      offset: response.offset,
    }
  }
}

export default Soledgic
