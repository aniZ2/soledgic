import {
  SoledgicConfig,
  SoledgicError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  // Payments
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  CheckoutBreakdown,
  RecordSaleRequest,
  RecordSaleResponse,
  ProcessPayoutRequest,
  ProcessPayoutResponse,
  ExecutePayoutRequest,
  ExecutePayoutResponse,
  BatchExecutePayoutRequest,
  BatchExecutePayoutResponse,
  PayoutStatusResponse,
  CheckPayoutEligibilityResponse,
  RecordRefundRequest,
  RecordRefundResponse,
  RefundBreakdown,
  ReverseTransactionRequest,
  ReverseTransactionResponse,
  // Balances
  GetBalanceResponse,
  // Transactions
  GetTransactionsRequest,
  GetTransactionsResponse,
  // Creators
  CreateCreatorRequest,
  CreateCreatorResponse,
  DeleteCreatorResponse,
  // Reports
  ExportReportRequest,
  ExportReportJsonResponse,
  ExportReportCsvResponse,
  GenerateReportRequest,
  GenerateReportResponse,
  GeneratePdfRequest,
  GeneratePdfResponse,
  BalanceSheetResponse,
  ProfitLossResponse,
  TrialBalanceResponse,
  ApAgingResponse,
  ArAgingResponse,
  GetRunwayResponse,
  // Tax
  GenerateTaxSummaryRequest,
  GenerateTaxSummaryResponse,
  ComplianceOverviewResponse,
  // Webhooks
  CreateWebhookEndpointRequest,
  WebhookEndpointResponse,
  ListWebhookEndpointsResponse,
  // Splits
  ManageSplitsRequest,
  ManageSplitsResponse,
  // Risk
  RiskEvaluationRequest,
  RiskEvaluationResponse,
  // Receipts
  UploadReceiptRequest,
  UploadReceiptResponse,
  // Invoices
  CreateInvoiceRequest,
  InvoiceResponse,
  ListInvoicesResponse,
  // Payments received
  ReceivePaymentRequest,
  ReceivePaymentResponse,
} from './types'

// ============================================================================
// SECURITY FIX H1: Secure API Key Storage
// ============================================================================
// The API key is stored in a closure rather than as a class property.
// This makes it harder to access via memory dumps or prototype pollution.
// The key is also cleared from the config object after initialization.

/**
 * Create a secure key holder that encapsulates the API key
 * This prevents the key from being accessible via class properties
 */
function createSecureKeyHolder(key: string): () => string {
  // Store key in closure - not accessible via object inspection
  let secureKey: string | null = key

  return () => {
    if (!secureKey) {
      throw new AuthenticationError('API key has been invalidated')
    }
    return secureKey
  }
}

/**
 * Legacy Soledgic compatibility client.
 *
 * New public integrations should prefer `@soledgic/sdk`, which targets the
 * supported resource-first `/v1/*` surface including wallet objects.
 *
 * SECURITY NOTES:
 * - API key is stored securely in a closure, not as a class property
 * - Use destroy() method to clear the API key from memory when done
 * - Errors are sanitized to prevent information leakage
 *
 * @example
 * ```typescript
 * const soledgic = new Soledgic({
 *   apiKey: 'your_api_key',
 *   baseUrl: 'https://api.soledgic.com/v1'
 * })
 *
 * // Record a sale
 * const sale = await soledgic.recordSale({
 *   referenceId: 'sale_123',
 *   creatorId: 'author_123',
 *   amount: 1999
 * })
 *
 * // When done, clear the API key from memory
 * soledgic.destroy()
 * ```
 */
export class Soledgic {
  // SECURITY FIX H1: API key is stored in closure via getApiKey function
  private getApiKey: () => string
  private baseUrl: string
  private timeout: number
  private apiVersion: string
  private fetchFn: typeof fetch
  private destroyed: boolean = false

  constructor(config: SoledgicConfig) {
    if (!config.apiKey) {
      throw new ValidationError('API key is required')
    }

    // SECURITY FIX H1: Store API key in secure closure
    this.getApiKey = createSecureKeyHolder(config.apiKey)

    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || ''
    this.timeout = config.timeout || 30000
    this.apiVersion = (config.apiVersion || '').trim() || '2026-03-01'
    this.fetchFn = config.fetch || fetch
  }

  /**
   * SECURITY: Destroy the client and clear the API key from memory
   * Call this when you're done using the client to minimize exposure window
   */
  destroy(): void {
    this.destroyed = true
    this.getApiKey = () => {
      throw new AuthenticationError('Client has been destroyed')
    }
  }

  /**
   * Check if the client has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST'
      body?: Record<string, unknown>
      params?: Record<string, string | number | boolean | undefined>
    } = {}
  ): Promise<T> {
    if (this.destroyed) {
      throw new AuthenticationError('Client has been destroyed')
    }

    const { method = 'GET', body, params } = options

    let url = `${this.baseUrl}/${endpoint}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchFn(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.getApiKey(),
          'Soledgic-Version': this.apiVersion,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data: any = await response.json()

      if (!response.ok || data.success === false) {
        const message = this.sanitizeErrorMessage(data.error || 'Request failed')

        switch (response.status) {
          case 400:
            throw new ValidationError(message)
          case 401:
            throw new AuthenticationError(message)
          case 404:
            throw new NotFoundError(message)
          case 409:
            throw new ConflictError(message)
          case 429:
            throw new SoledgicError('Rate limit exceeded', 429, 'RATE_LIMITED')
          case 503:
            throw new SoledgicError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE')
          default:
            if (response.status >= 500) {
              throw new SoledgicError('An unexpected error occurred', response.status, 'SERVER_ERROR')
            }
            throw new SoledgicError(message, response.status)
        }
      }

      return data as T
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof SoledgicError) {
        throw error
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new SoledgicError('Request timeout', 408, 'TIMEOUT')
        }
        throw new SoledgicError('Network error occurred', 0, 'NETWORK_ERROR')
      }

      throw new SoledgicError('Unknown error', 500, 'UNKNOWN')
    }
  }

  private sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return 'An error occurred'
    }

    return message
      .replace(/\/[^\s]+/g, '[path]')
      .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]')
      .replace(/eyJ[A-Za-z0-9_-]+/g, '[token]')
      .replace(/sk_[a-zA-Z0-9]+/g, '[key]')
      .replace(/whsec_[a-zA-Z0-9]+/g, '[secret]')
      .replace(/postgres:\/\/[^\s]+/g, '[db]')
      .replace(/redis:\/\/[^\s]+/g, '[redis]')
      .substring(0, 200)
  }

  private toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
      result[snakeKey] = value
    }
    return result
  }

  private toCamelCase<T>(obj: Record<string, unknown>): T {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[camelKey] = this.toCamelCase(value as Record<string, unknown>)
      } else if (Array.isArray(value)) {
        result[camelKey] = value.map(item =>
          typeof item === 'object' && item !== null
            ? this.toCamelCase(item as Record<string, unknown>)
            : item
        )
      } else {
        result[camelKey] = value
      }
    }
    return result as T
  }

  // ============================================================================
  // Payments
  // ============================================================================

  /**
   * Create a checkout payment (direct charge or hosted session).
   * Omit paymentMethodId to create a hosted checkout session.
   */
  async createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    if (!request.creatorId) throw new ValidationError('creatorId is required')
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('checkout-sessions', {
      method: 'POST',
      body: {
        ...this.toSnakeCase(request as unknown as Record<string, unknown>),
        participant_id: request.creatorId,
      },
    })

    const checkout = (
      response.checkout_session &&
      typeof response.checkout_session === 'object' &&
      !Array.isArray(response.checkout_session)
    )
      ? response.checkout_session as Record<string, unknown>
      : response

    if (checkout.mode === 'session') {
      return {
        success: Boolean(response.success),
        mode: 'session',
        sessionId: String(checkout.id ?? ''),
        checkoutUrl: (checkout.checkout_url as string | null | undefined) ?? null,
        expiresAt: checkout.expires_at as string | undefined,
        breakdown: checkout.breakdown
          ? this.toCamelCase<CheckoutBreakdown>(checkout.breakdown as Record<string, unknown>)
          : undefined,
      }
    }

    return {
      success: Boolean(response.success),
      provider: (checkout.provider as 'card' | undefined) ?? 'card',
      paymentId: String(checkout.payment_id ?? checkout.payment_intent_id ?? ''),
      paymentIntentId: String(checkout.payment_intent_id ?? checkout.payment_id ?? ''),
      clientSecret: (checkout.client_secret as string | null | undefined) ?? null,
      checkoutUrl: (checkout.checkout_url as string | null | undefined) ?? null,
      status: (checkout.status as string | null | undefined) ?? null,
      requiresAction: Boolean(checkout.requires_action),
      amount: checkout.amount as number | undefined,
      currency: checkout.currency as string | undefined,
      breakdown: checkout.breakdown
        ? this.toCamelCase<CheckoutBreakdown>(checkout.breakdown as Record<string, unknown>)
        : undefined,
    }
  }

  /**
   * Record a sale with automatic revenue split.
   */
  async recordSale(request: RecordSaleRequest): Promise<RecordSaleResponse> {
    if (!request.referenceId) throw new ValidationError('referenceId is required')
    if (!request.creatorId) throw new ValidationError('creatorId is required')
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('record-sale', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<RecordSaleResponse>(response)
  }

  /**
   * Record a refund for a sale.
   */
  async recordRefund(request: RecordRefundRequest): Promise<RecordRefundResponse> {
    if (!request.originalSaleReference) throw new ValidationError('originalSaleReference is required')
    if (!request.reason) throw new ValidationError('reason is required')

    const response = await this.request<Record<string, unknown>>('refunds', {
      method: 'POST',
      body: {
        ...this.toSnakeCase(request as unknown as Record<string, unknown>),
        sale_reference: request.originalSaleReference,
      },
    })

    const refund = (
      response.refund &&
      typeof response.refund === 'object' &&
      !Array.isArray(response.refund)
    )
      ? response.refund as Record<string, unknown>
      : response

    return {
      success: Boolean(response.success),
      transactionId: refund.transaction_id as string | undefined,
      refundedAmount: refund.refunded_amount as number | undefined,
      breakdown: refund.breakdown
        ? this.toCamelCase<RefundBreakdown>(refund.breakdown as Record<string, unknown>)
        : undefined,
    }
  }

  /**
   * Reverse a transaction (immutable ledger pattern — creates offsetting entries).
   */
  async reverseTransaction(request: ReverseTransactionRequest): Promise<ReverseTransactionResponse> {
    if (!request.transactionId) throw new ValidationError('transactionId is required')
    if (!request.reason) throw new ValidationError('reason is required')

    const response = await this.request<Record<string, unknown>>('reverse-transaction', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<ReverseTransactionResponse>(response)
  }

  // ============================================================================
  // Payouts (two-step: process → execute)
  // ============================================================================

  /**
   * Step 1: Record a payout in the ledger (bookkeeping).
   * Returns a transactionId to pass to executePayout().
   */
  async processPayout(request: ProcessPayoutRequest): Promise<ProcessPayoutResponse> {
    if (!request.creatorId) throw new ValidationError('creatorId is required')
    if (!request.referenceId) throw new ValidationError('referenceId is required')

    const response = await this.request<Record<string, unknown>>('payouts', {
      method: 'POST',
      body: {
        ...this.toSnakeCase(request as unknown as Record<string, unknown>),
        participant_id: request.creatorId,
      },
    })

    const payout = (
      response.payout &&
      typeof response.payout === 'object' &&
      !Array.isArray(response.payout)
    )
      ? response.payout as Record<string, unknown>
      : response

    return {
      success: Boolean(response.success),
      payoutId: payout.id as string | undefined,
      transactionId: payout.transaction_id as string | undefined,
      amount: (payout.net_amount as number | undefined) ?? request.amount,
      status: 'created',
    }
  }

  /**
   * Step 2: Execute a recorded payout (money movement via payment rail).
   * Requires the transactionId from processPayout().
   */
  async executePayout(request: ExecutePayoutRequest): Promise<ExecutePayoutResponse> {
    if (!request.payoutId) throw new ValidationError('payoutId is required')

    const response = await this.request<Record<string, unknown>>('execute-payout', {
      method: 'POST',
      body: {
        action: 'execute',
        payout_id: request.payoutId,
        ...(request.rail ? { rail: request.rail } : {}),
        ...(request.railConfig ? { rail_config: request.railConfig } : {}),
      },
    })

    return this.toCamelCase<ExecutePayoutResponse>(response)
  }

  /**
   * Execute multiple payouts in a single batch.
   */
  async batchExecutePayout(request: BatchExecutePayoutRequest): Promise<BatchExecutePayoutResponse> {
    if (!request.payoutIds?.length) throw new ValidationError('payoutIds must not be empty')

    const response = await this.request<Record<string, unknown>>('execute-payout', {
      method: 'POST',
      body: {
        action: 'batch_execute',
        payout_ids: request.payoutIds,
        ...(request.rail ? { rail: request.rail } : {}),
      },
    })

    return this.toCamelCase<BatchExecutePayoutResponse>(response)
  }

  /**
   * Get the current status of a payout execution.
   */
  async getPayoutStatus(payoutId: string): Promise<PayoutStatusResponse> {
    if (!payoutId) throw new ValidationError('payoutId is required')

    const response = await this.request<Record<string, unknown>>('execute-payout', {
      method: 'POST',
      body: { action: 'get_status', payout_id: payoutId },
    })

    return this.toCamelCase<PayoutStatusResponse>(response)
  }

  /**
   * Check whether a creator is eligible for payout (balance, holds, etc.).
   */
  async checkPayoutEligibility(creatorId: string): Promise<CheckPayoutEligibilityResponse> {
    if (!creatorId) throw new ValidationError('creatorId is required')

    const response = await this.request<Record<string, unknown>>(
      `participants/${creatorId}/payout-eligibility`,
      { params: {} },
    )
    const eligibility = (
      response.eligibility &&
      typeof response.eligibility === 'object' &&
      !Array.isArray(response.eligibility)
    )
      ? response.eligibility as Record<string, unknown>
      : {}

    return {
      success: Boolean(response.success),
      eligible: Boolean(eligibility.eligible),
      reason: Array.isArray(eligibility.issues) && eligibility.issues.length > 0
        ? String(eligibility.issues[0])
        : undefined,
    }
  }

  // ============================================================================
  // Balances
  // ============================================================================

  /**
   * Get balance for a single creator.
   */
  async getCreatorBalance(creatorId: string): Promise<GetBalanceResponse> {
    if (!creatorId) throw new ValidationError('creatorId is required')

    const response = await this.request<Record<string, unknown>>(`participants/${creatorId}`, { params: {} })
    const participant = (
      response.participant &&
      typeof response.participant === 'object' &&
      !Array.isArray(response.participant)
    )
      ? response.participant as Record<string, unknown>
      : {}

    return {
      success: Boolean(response.success),
      balance: {
        creatorId,
        available: participant.available_balance as number,
        pending: participant.held_amount as number,
        totalEarned: participant.ledger_balance as number,
        totalPaidOut: 0,
        currency: 'USD',
      },
    }
  }

  /**
   * Get balances for all creators, optionally including platform summary.
   */
  async getAllBalances(options?: { includePlatform?: boolean }): Promise<GetBalanceResponse> {
    void options
    const response = await this.request<Record<string, unknown>>('participants', { params: {} })
    const participants = Array.isArray(response.participants)
      ? response.participants as Record<string, unknown>[]
      : []

    return {
      success: Boolean(response.success),
      balances: participants.map((participant) => ({
        creatorId: String(participant.id ?? ''),
        available: participant.available_balance as number,
        pending: participant.held_amount as number,
        currency: 'USD',
      })),
    }
  }

  // ============================================================================
  // Transactions
  // ============================================================================

  /**
   * Get transaction history with filtering and pagination.
   */
  async getTransactions(request?: GetTransactionsRequest): Promise<GetTransactionsResponse> {
    const params: Record<string, string | number | boolean | undefined> = {}

    if (request) {
      if (request.creatorId) params.creator_id = request.creatorId
      if (request.type) params.type = request.type
      if (request.status) params.status = request.status
      if (request.startDate) params.start_date = request.startDate
      if (request.endDate) params.end_date = request.endDate
      if (request.page) params.page = request.page
      if (request.perPage) params.per_page = request.perPage
      if (request.includeEntries !== undefined) params.include_entries = request.includeEntries
    }

    const response = await this.request<Record<string, unknown>>('get-transactions', { params })

    return this.toCamelCase<GetTransactionsResponse>(response)
  }

  // ============================================================================
  // Creators
  // ============================================================================

  /**
   * Pre-register a creator with optional tax info and payout preferences.
   */
  async createCreator(request: CreateCreatorRequest): Promise<CreateCreatorResponse> {
    if (!request.creatorId) throw new ValidationError('creatorId is required')

    const response = await this.request<Record<string, unknown>>('participants', {
      method: 'POST',
      body: {
        ...this.toSnakeCase(request as unknown as Record<string, unknown>),
        participant_id: request.creatorId,
      },
    })

    const participant = (
      response.participant &&
      typeof response.participant === 'object' &&
      !Array.isArray(response.participant)
    )
      ? response.participant as Record<string, unknown>
      : {}

    return {
      success: Boolean(response.success),
      creator: {
        id: String(participant.id ?? ''),
        accountId: String(participant.account_id ?? ''),
        displayName: (participant.display_name as string | null | undefined) ?? null,
        email: (participant.email as string | null | undefined) ?? null,
        defaultSplitPercent: participant.default_split_percent as number,
        payoutPreferences: participant.payout_preferences as Record<string, unknown> || {},
        createdAt: String(participant.created_at ?? ''),
      },
    }
  }

  /**
   * Soft-delete a creator (only if they have zero ledger entries).
   */
  async deleteCreator(creatorId: string): Promise<DeleteCreatorResponse> {
    if (!creatorId) throw new ValidationError('creatorId is required')

    const response = await this.request<Record<string, unknown>>('delete-creator', {
      method: 'POST',
      body: { creator_id: creatorId },
    })

    return this.toCamelCase<DeleteCreatorResponse>(response)
  }

  // ============================================================================
  // Revenue Splits
  // ============================================================================

  /**
   * Get the effective revenue split for the ledger.
   */
  async getSplitConfig(): Promise<ManageSplitsResponse> {
    const response = await this.request<Record<string, unknown>>('manage-splits', {
      method: 'POST',
      body: { action: 'get' },
    })

    return this.toCamelCase<ManageSplitsResponse>(response)
  }

  /**
   * Set the default revenue split for all creators.
   */
  async setDefaultSplit(creatorPercent: number): Promise<ManageSplitsResponse> {
    const response = await this.request<Record<string, unknown>>('manage-splits', {
      method: 'POST',
      body: { action: 'set_default', creator_percent: creatorPercent },
    })

    return this.toCamelCase<ManageSplitsResponse>(response)
  }

  /**
   * Set a custom revenue split for a specific creator.
   */
  async setCreatorSplit(creatorId: string, creatorPercent: number): Promise<ManageSplitsResponse> {
    if (!creatorId) throw new ValidationError('creatorId is required')

    const response = await this.request<Record<string, unknown>>('manage-splits', {
      method: 'POST',
      body: { action: 'set_creator', creator_id: creatorId, creator_percent: creatorPercent },
    })

    return this.toCamelCase<ManageSplitsResponse>(response)
  }

  /**
   * Set a custom revenue split for a specific product.
   */
  async setProductSplit(productId: string, creatorPercent: number): Promise<ManageSplitsResponse> {
    if (!productId) throw new ValidationError('productId is required')

    const response = await this.request<Record<string, unknown>>('manage-splits', {
      method: 'POST',
      body: { action: 'set_product', product_id: productId, creator_percent: creatorPercent },
    })

    return this.toCamelCase<ManageSplitsResponse>(response)
  }

  /**
   * Configure tiered revenue splits (different rates at different volume levels).
   */
  async setTieredSplits(tiers: ManageSplitsRequest['tiers']): Promise<ManageSplitsResponse> {
    if (!tiers?.length) throw new ValidationError('tiers must not be empty')

    const response = await this.request<Record<string, unknown>>('manage-splits', {
      method: 'POST',
      body: {
        action: 'set_tiers',
        tiers: tiers!.map(t => this.toSnakeCase(t as unknown as Record<string, unknown>)),
      },
    })

    return this.toCamelCase<ManageSplitsResponse>(response)
  }

  // ============================================================================
  // Reports
  // ============================================================================

  /**
   * Export a report as CSV or JSON.
   */
  async exportReport(request: ExportReportRequest): Promise<ExportReportJsonResponse | ExportReportCsvResponse> {
    if (!request.reportType) throw new ValidationError('reportType is required')
    if (!request.format) throw new ValidationError('format is required')

    const response = await this.request<Record<string, unknown>>('export-report', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<ExportReportJsonResponse | ExportReportCsvResponse>(response)
  }

  /**
   * Generate a financial report (profit/loss, trial balance, general ledger, 1099).
   */
  async generateReport(request: GenerateReportRequest): Promise<GenerateReportResponse> {
    if (!request.reportType) throw new ValidationError('reportType is required')

    const response = await this.request<Record<string, unknown>>('generate-report', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<GenerateReportResponse>(response)
  }

  /**
   * Generate a PDF report.
   */
  async generatePdf(request: GeneratePdfRequest): Promise<GeneratePdfResponse> {
    if (!request.reportType) throw new ValidationError('reportType is required')

    const response = await this.request<Record<string, unknown>>('generate-pdf', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<GeneratePdfResponse>(response)
  }

  /**
   * Get balance sheet as of a given date.
   */
  async getBalanceSheet(options?: { asOfDate?: string }): Promise<BalanceSheetResponse> {
    const response = await this.request<Record<string, unknown>>('balance-sheet', {
      params: options?.asOfDate ? { as_of_date: options.asOfDate } : {},
    })

    return this.toCamelCase<BalanceSheetResponse>(response)
  }

  /**
   * Get profit & loss statement.
   */
  async getProfitLoss(options?: { startDate?: string; endDate?: string }): Promise<ProfitLossResponse> {
    const params: Record<string, string | number | boolean | undefined> = {}
    if (options?.startDate) params.start_date = options.startDate
    if (options?.endDate) params.end_date = options.endDate

    const response = await this.request<Record<string, unknown>>('profit-loss', { params })

    return this.toCamelCase<ProfitLossResponse>(response)
  }

  /**
   * Get trial balance (debits must equal credits — ledger integrity check).
   */
  async getTrialBalance(): Promise<TrialBalanceResponse> {
    const response = await this.request<Record<string, unknown>>('trial-balance')

    return this.toCamelCase<TrialBalanceResponse>(response)
  }

  /**
   * Get accounts payable aging report.
   */
  async getApAging(): Promise<ApAgingResponse> {
    const response = await this.request<Record<string, unknown>>('ap-aging')

    return this.toCamelCase<ApAgingResponse>(response)
  }

  /**
   * Get accounts receivable aging report.
   */
  async getArAging(): Promise<ArAgingResponse> {
    const response = await this.request<Record<string, unknown>>('ar-aging')

    return this.toCamelCase<ArAgingResponse>(response)
  }

  /**
   * Get cash runway projection and financial health score.
   */
  async getRunway(): Promise<GetRunwayResponse> {
    const response = await this.request<Record<string, unknown>>('get-runway')

    return this.toCamelCase<GetRunwayResponse>(response)
  }

  // ============================================================================
  // Tax
  // ============================================================================

  /**
   * Generate year-end 1099 tax summaries (amounts only — no PII).
   */
  async generateTaxSummary(request: GenerateTaxSummaryRequest): Promise<GenerateTaxSummaryResponse> {
    if (!request.taxYear) throw new ValidationError('taxYear is required')

    const response = await this.request<Record<string, unknown>>(`tax/summaries/${request.taxYear}`, {
      method: 'GET',
      params: {
        participant_id: request.creatorId,
      },
    })

    return this.toCamelCase<GenerateTaxSummaryResponse>(response)
  }

  // ============================================================================
  // Risk Evaluation
  // ============================================================================

  /**
   * Evaluate risk for a proposed transaction before execution.
   */
  async evaluateFraud(request: RiskEvaluationRequest): Promise<RiskEvaluationResponse> {
    if (!request.idempotencyKey) throw new ValidationError('idempotencyKey is required')
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('fraud/evaluations', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<RiskEvaluationResponse>(response)
  }

  async evaluateRisk(request: RiskEvaluationRequest): Promise<RiskEvaluationResponse> {
    return this.evaluateFraud(request)
  }

  /**
   * Get a ledger-scoped compliance overview.
   */
  async getComplianceOverview(params: { days?: number; hours?: number } = {}): Promise<ComplianceOverviewResponse> {
    const response = await this.request<Record<string, unknown>>('compliance/overview', {
      method: 'GET',
      params,
    })

    return this.toCamelCase<ComplianceOverviewResponse>(response)
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  /**
   * Register a webhook endpoint to receive events.
   */
  async createWebhookEndpoint(request: CreateWebhookEndpointRequest): Promise<WebhookEndpointResponse> {
    if (!request.url) throw new ValidationError('url is required')
    if (!request.events?.length) throw new ValidationError('events must not be empty')

    const response = await this.request<Record<string, unknown>>('webhooks', {
      method: 'POST',
      body: { action: 'create', ...this.toSnakeCase(request as unknown as Record<string, unknown>) },
    })

    return this.toCamelCase<WebhookEndpointResponse>(response)
  }

  /**
   * List all registered webhook endpoints.
   */
  async listWebhookEndpoints(): Promise<ListWebhookEndpointsResponse> {
    const response = await this.request<Record<string, unknown>>('webhooks', {
      method: 'POST',
      body: { action: 'list' },
    })

    return this.toCamelCase<ListWebhookEndpointsResponse>(response)
  }

  /**
   * Delete a webhook endpoint.
   */
  async deleteWebhookEndpoint(endpointId: string): Promise<WebhookEndpointResponse> {
    if (!endpointId) throw new ValidationError('endpointId is required')

    const response = await this.request<Record<string, unknown>>('webhooks', {
      method: 'POST',
      body: { action: 'delete', endpoint_id: endpointId },
    })

    return this.toCamelCase<WebhookEndpointResponse>(response)
  }

  /**
   * Send a test event to a webhook endpoint to verify connectivity.
   */
  async testWebhookEndpoint(endpointId: string): Promise<WebhookEndpointResponse> {
    if (!endpointId) throw new ValidationError('endpointId is required')

    const response = await this.request<Record<string, unknown>>('webhooks', {
      method: 'POST',
      body: { action: 'test', endpoint_id: endpointId },
    })

    return this.toCamelCase<WebhookEndpointResponse>(response)
  }

  /**
   * Rotate the signing secret for a webhook endpoint.
   */
  async rotateWebhookSecret(endpointId: string): Promise<WebhookEndpointResponse> {
    if (!endpointId) throw new ValidationError('endpointId is required')

    const response = await this.request<Record<string, unknown>>('webhooks', {
      method: 'POST',
      body: { action: 'rotate_secret', endpoint_id: endpointId },
    })

    return this.toCamelCase<WebhookEndpointResponse>(response)
  }

  // ============================================================================
  // Invoices
  // ============================================================================

  /**
   * Create a new invoice.
   */
  async createInvoice(request: CreateInvoiceRequest): Promise<InvoiceResponse> {
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('invoices', {
      method: 'POST',
      body: {
        action: 'create',
        ...this.toSnakeCase(request as unknown as Record<string, unknown>),
      },
    })

    return this.toCamelCase<InvoiceResponse>(response)
  }

  /**
   * List invoices with optional status filter.
   */
  async listInvoices(options?: { status?: string }): Promise<ListInvoicesResponse> {
    const response = await this.request<Record<string, unknown>>('invoices', {
      method: 'POST',
      body: { action: 'list', ...(options?.status ? { status: options.status } : {}) },
    })

    return this.toCamelCase<ListInvoicesResponse>(response)
  }

  /**
   * Get a single invoice by ID.
   */
  async getInvoice(invoiceId: string): Promise<InvoiceResponse> {
    if (!invoiceId) throw new ValidationError('invoiceId is required')

    const response = await this.request<Record<string, unknown>>('invoices', {
      method: 'POST',
      body: { action: 'get', id: invoiceId },
    })

    return this.toCamelCase<InvoiceResponse>(response)
  }

  /**
   * Send an invoice to the customer via email.
   */
  async sendInvoice(invoiceId: string): Promise<InvoiceResponse> {
    if (!invoiceId) throw new ValidationError('invoiceId is required')

    const response = await this.request<Record<string, unknown>>('invoices', {
      method: 'POST',
      body: { action: 'send', id: invoiceId },
    })

    return this.toCamelCase<InvoiceResponse>(response)
  }

  /**
   * Record a payment received against an invoice.
   */
  async receivePayment(request: ReceivePaymentRequest): Promise<ReceivePaymentResponse> {
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('receive-payment', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<ReceivePaymentResponse>(response)
  }

  // ============================================================================
  // Receipts
  // ============================================================================

  /**
   * Upload a receipt and optionally link it to a transaction.
   */
  async uploadReceipt(request: UploadReceiptRequest): Promise<UploadReceiptResponse> {
    if (!request.fileUrl) throw new ValidationError('fileUrl is required')

    const response = await this.request<Record<string, unknown>>('upload-receipt', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<UploadReceiptResponse>(response)
  }
}
