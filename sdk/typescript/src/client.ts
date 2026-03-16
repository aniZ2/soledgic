/**
 * Soledgic SDK Client
 * Main client class with all API methods
 */

import type {
  SoledgicConfig,
  WebhookPayloadInput,
  VerifyWebhookSignatureOptions,
  RecordSaleRequest,
  SaleResponse,
  RecordIncomeRequest,
  RecordExpenseRequest,
  RecordBillRequest,
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
  ProjectIntentRequest,
  ProjectIntentResponse,
  ReverseTransactionRequest,
  ReverseResponse,
  Period,
  CreatePeriodRequest,
  ReconcileMatchRequest,
  ReconciliationMatchResponse,
  ReconciliationUnmatchResponse,
  UnmatchedTransactionsResponse,
  CreateSnapshotRequest,
  ReconciliationSnapshot,
  AutoMatchReconciliationResponse,
  FrozenStatement,
  CreateCreatorRequest,
  CreateCreatorResponse,
  CreateParticipantRequest,
  CreateParticipantResponse,
  ParticipantSummary,
  ParticipantDetail,
  ParticipantPayoutEligibilityResponse,
  CreateLedgerRequest,
  CreateLedgerResponse,
  RecordAdjustmentRequest,
  RecordOpeningBalanceRequest,
  RecordTransferRequest,
  RiskEvaluationRequest,
  RiskEvaluationResponse,
  CreatePolicyRequest,
  FraudPolicyResponse,
  FraudPolicyListResponse,
  FraudPolicyDeleteResponse,
  TaxCalculationResponse,
  TaxDocumentGenerationResponse,
  TaxDocumentsResponse,
  TaxDocumentResponse,
  TaxSummaryResponse,
  ComplianceOverviewResponse,
  ComplianceAccessPatternsResponse,
  ComplianceFinancialActivityResponse,
  ComplianceSecuritySummaryResponse,
  ExportReportRequest,
  ExportReportJsonResponse,
  ExportReportCsvResponse,
  UploadReceiptRequest,
  UploadReceiptResponse,
  ReceivePaymentRequest,
  ReceivePaymentResponse,
  SendBreachAlertRequest,
  SendBreachAlertResponse,
  WalletObject,
  ListWalletsRequest,
  ListWalletsResponse,
  CreateWalletRequest,
  CreateWalletResponse,
  GetWalletResponse,
  WalletEntriesResponse,
  WalletTopupRequest,
  WalletTopupResponse,
  WalletWithdrawRequest,
  WalletWithdrawalResponse,
  ParticipantTransferRequest,
  ParticipantTransferResponse,
  HoldQueryOptions,
  HeldFundsResponse,
  HeldFundsSummaryResponse,
  ReleaseHoldRequest,
  ReleaseHoldResponse,
  CreateCheckoutSessionRequest,
  CheckoutSessionResourceResponse,
  CreatePayoutRequest,
  PayoutResourceResponse,
  CreateRefundRequest,
  RefundResourceResponse,
  ListRefundsRequest,
  ListRefundsResponse,
  PreflightAuthorizationRequest,
  PreflightAuthorizationResponse,
  CreateAlertRequest,
  AlertConfiguration,
  UpdateAlertRequest,
  AlertTestResult,
  SlackAlertConfig,
  CreateInvoiceRequest,
  RecordInvoicePaymentRequest,
  PayBillRequest,
  CreateBudgetRequest,
  CreateRecurringRequest,
  CreateContractorRequest,
  RecordContractorPaymentRequest,
  CreateBankAccountRequest,
  SubmitTaxInfoRequest,
  ImportBankStatementRequest,
  CheckoutBreakdown,
} from './types'
import { SoledgicError, ValidationError, AuthenticationError, NotFoundError, ConflictError } from './errors'
import { verifyWebhookSignature, parseWebhookEvent } from './webhooks'
import { mapWebhookEndpoint, mapWebhookDelivery } from './helpers'

export const DEFAULT_API_VERSION = '2026-03-01'

export class Soledgic {
  private _getKey: () => string
  private baseUrl: string
  private timeoutMs: number
  private apiVersion: string

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
    this.apiVersion = (config.apiVersion || '').trim() || DEFAULT_API_VERSION
  }

  /** Clear the API key from memory. After calling destroy(), all requests will throw. */
  destroy(): void {
    (this as any)._destroyKey?.()
  }

  readonly webhooks = {
    verifySignature: (
      payload: WebhookPayloadInput,
      signatureHeader: string,
      secret: string,
      options?: VerifyWebhookSignatureOptions,
    ) => verifyWebhookSignature(payload, signatureHeader, secret, options),
    parseEvent: <T = Record<string, unknown>>(payload: WebhookPayloadInput) =>
      parseWebhookEvent<T>(payload),
  }

  private throwTypedError(message: string, status: number, data: unknown): never {
    const apiCode =
      typeof (data as any)?.error_code === 'string'
        ? (data as any).error_code
        : typeof (data as any)?.code === 'string'
          ? (data as any).code
          : undefined

    switch (status) {
      case 400: throw new ValidationError(message, data, apiCode)
      case 401: throw new AuthenticationError(message, data, apiCode)
      case 404: throw new NotFoundError(message, data, apiCode)
      case 409: throw new ConflictError(message, data, apiCode)
      default:  throw new SoledgicError(message, status, data, apiCode)
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
          'Soledgic-Version': this.apiVersion,
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
          'Soledgic-Version': this.apiVersion,
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
          'Soledgic-Version': this.apiVersion,
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

  private async requestGetRaw(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<Response> {
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
          'Soledgic-Version': this.apiVersion,
        },
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

  private async requestDelete<T>(endpoint: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'DELETE',
        headers: {
          'x-api-key': this._getKey(),
          'Soledgic-Version': this.apiVersion,
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

  // === MARKETPLACE MODE - SALES & PAYOUTS ===

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
    const response = await this.request<any>('reverse-transaction', {
      transaction_id: req.transactionId,
      reason: req.reason,
      partial_amount: req.partialAmount,
      idempotency_key: req.idempotencyKey,
      metadata: req.metadata,
    })
    return {
      success: response.success,
      voidType: response.void_type,
      message: response.message,
      transactionId: response.transaction_id ?? response.original_transaction_id ?? req.transactionId,
      reversalId: response.reversal_id ?? null,
      reversedAmount: response.reversed_amount ?? null,
      isPartial: response.is_partial ?? null,
      voidedAt: response.voided_at ?? null,
      reversedAt: response.reversed_at ?? null,
      warning: response.warning ?? null,
    }
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

  async matchTransaction(req: ReconcileMatchRequest): Promise<ReconciliationMatchResponse> {
    const response = await this.request<any>('reconciliations/matches', {
      transaction_id: req.transactionId,
      bank_transaction_id: req.bankTransactionId,
    })
    return {
      success: response.success,
      match: {
        id: response.match.id,
        transactionId: response.match.transaction_id,
        bankTransactionId: response.match.bank_transaction_id,
        status: response.match.status,
        matchedAt: response.match.matched_at,
      },
    }
  }

  async unmatchTransaction(transactionId: string): Promise<ReconciliationUnmatchResponse> {
    const response = await this.requestDelete<any>(`reconciliations/matches/${transactionId}`)
    return {
      success: response.success,
      deleted: Boolean(response.deleted),
      transactionId: response.transaction_id,
    }
  }

  async listUnmatchedTransactions(): Promise<UnmatchedTransactionsResponse> {
    const response = await this.requestGet<any>('reconciliations/unmatched')
    return {
      success: response.success,
      unmatchedCount: response.unmatched_count ?? 0,
      transactions: (response.transactions || []).map((transaction: any) => ({
        id: transaction.id,
        referenceId: transaction.reference_id ?? null,
        description: transaction.description ?? null,
        amount: transaction.amount,
        currency: transaction.currency || 'USD',
        createdAt: transaction.created_at,
        status: transaction.status,
        metadata: transaction.metadata || {},
      })),
    }
  }

  async createReconciliationSnapshot(req: CreateSnapshotRequest): Promise<{ success: boolean; snapshot_id: string; integrity_hash: string }> {
    const response = await this.request<any>('reconciliations/snapshots', {
      period_id: req.periodId,
      as_of_date: req.asOfDate,
    })
    return {
      success: response.success,
      snapshot_id: response.snapshot.id,
      integrity_hash: response.snapshot.integrity_hash,
    }
  }

  async getReconciliationSnapshot(periodId: string): Promise<{ success: boolean; snapshot: ReconciliationSnapshot }> {
    const response = await this.requestGet<any>(`reconciliations/snapshots/${periodId}`)
    return {
      success: response.success,
      snapshot: {
        id: response.snapshot.id,
        periodStart: response.snapshot.period_start,
        periodEnd: response.snapshot.period_end,
        integrityHash: response.snapshot.integrity_hash,
        integrityValid: Boolean(response.snapshot.integrity_valid),
        summary: {
          totalMatched: response.snapshot.summary?.total_matched ?? 0,
          totalUnmatched: response.snapshot.summary?.total_unmatched ?? 0,
          matchedAmount: response.snapshot.summary?.matched_amount ?? 0,
          unmatchedAmount: response.snapshot.summary?.unmatched_amount ?? 0,
        },
      },
    }
  }

  async autoMatchBankTransaction(bankAggregatorTransactionId: string): Promise<AutoMatchReconciliationResponse> {
    const response = await this.request<any>('reconciliations/auto-match', {
      bank_aggregator_transaction_id: bankAggregatorTransactionId,
    })
    return {
      success: response.success,
      result: {
        matched: Boolean(response.result?.matched),
        matchType: response.result?.match_type ?? null,
        matchedTransactionId: response.result?.matched_transaction_id ?? null,
        bankAggregatorTransactionId: response.result?.bank_aggregator_transaction_id ?? bankAggregatorTransactionId,
      },
    }
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

  async getSummary() {
    const response = await this.requestGet<any>('participants')
    const participants = Array.isArray(response.participants) ? response.participants : []
    const summary = participants.reduce((totals: Record<string, number>, participant: any) => ({
      total_ledger_balance: totals.total_ledger_balance + Number(participant.ledger_balance || 0),
      total_held_amount: totals.total_held_amount + Number(participant.held_amount || 0),
      total_available_balance: totals.total_available_balance + Number(participant.available_balance || 0),
    }), {
      total_ledger_balance: 0,
      total_held_amount: 0,
      total_available_balance: 0,
    })

    return {
      success: response.success,
      data: {
        ...summary,
        participant_count: participants.length,
      },
    }
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
    const response = await this.request<any>('webhooks', { action: 'list' })
    return {
      success: response.success,
      data: Array.isArray(response.data) ? response.data.map(mapWebhookEndpoint) : [],
    }
  }

  async createWebhookEndpoint(config: {
    url: string
    description?: string
    events?: string[]
  }) {
    const response = await this.request<any>('webhooks', {
      action: 'create',
      url: config.url,
      description: config.description,
      events: config.events || ['*'],
    })
    return {
      success: response.success,
      data: {
        ...mapWebhookEndpoint(response.data || {}),
        secret: typeof response.data?.secret === 'string' ? response.data.secret : null,
      },
      message: typeof response.message === 'string' ? response.message : undefined,
    }
  }

  async updateWebhookEndpoint(endpointId: string, updates: {
    url?: string
    description?: string
    events?: string[]
    isActive?: boolean
  }) {
    const response = await this.request<any>('webhooks', {
      action: 'update',
      endpoint_id: endpointId,
      url: updates.url,
      description: updates.description,
      events: updates.events,
      is_active: updates.isActive,
    })
    return {
      success: response.success,
      data: mapWebhookEndpoint(response.data || {}),
    }
  }

  async deleteWebhookEndpoint(endpointId: string) {
    const response = await this.request<any>('webhooks', { action: 'delete', endpoint_id: endpointId })
    return {
      success: response.success,
      message: typeof response.message === 'string' ? response.message : undefined,
    }
  }

  async testWebhookEndpoint(endpointId: string) {
    const response = await this.request<any>('webhooks', { action: 'test', endpoint_id: endpointId })
    return {
      success: response.success,
      error: typeof response.error === 'string' ? response.error : undefined,
      data: {
        delivered: Boolean(response.data?.delivered),
        status: typeof response.data?.status === 'number' ? response.data.status : null,
        responseTimeMs:
          typeof response.data?.response_time_ms === 'number' ? response.data.response_time_ms : null,
      },
    }
  }

  async getWebhookDeliveries(endpointId?: string, limit?: number) {
    const response = await this.request<any>('webhooks', {
      action: 'deliveries',
      endpoint_id: endpointId,
      limit,
    })
    return {
      success: response.success,
      data: Array.isArray(response.data) ? response.data.map(mapWebhookDelivery) : [],
    }
  }

  async retryWebhookDelivery(deliveryId: string) {
    const response = await this.request<any>('webhooks', { action: 'retry', delivery_id: deliveryId })
    return {
      success: response.success,
      message: typeof response.message === 'string' ? response.message : undefined,
    }
  }

  async rotateWebhookSecret(endpointId: string) {
    const response = await this.request<any>('webhooks', {
      action: 'rotate_secret',
      endpoint_id: endpointId,
    })
    return {
      success: response.success,
      data: {
        secret: typeof response.data?.secret === 'string' ? response.data.secret : null,
      },
      message: typeof response.message === 'string' ? response.message : undefined,
    }
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
    const response = await this.requestGet<any>('holds/summary')
    return {
      success: response.success,
      summary: response.summary || {},
    }
  }

  async getHeldFunds(options?: { ventureId?: string; creatorId?: string; readyOnly?: boolean; limit?: number }) {
    return this.requestGet('holds', {
      venture_id: options?.ventureId,
      participant_id: options?.creatorId,
      ready_only: options?.readyOnly,
      limit: options?.limit,
    })
  }

  async releaseFunds(entryId: string, executeTransfer = true) {
    const response = await this.request<any>(`holds/${entryId}/release`, {
      execute_transfer: executeTransfer,
    })
    return {
      success: response.success,
      release_id: response.release?.id ?? null,
      entry_id: response.release?.hold_id ?? entryId,
      executed: Boolean(response.release?.executed),
      transfer_id: response.release?.transfer_id ?? null,
      transfer_status: response.release?.transfer_status ?? null,
      amount: response.release?.amount ?? null,
      currency: response.release?.currency ?? null,
    }
  }

  // === PAYOUT ELIGIBILITY ===

  async checkPayoutEligibility(creatorId: string) {
    const response = await this.requestGet<any>(`participants/${creatorId}/payout-eligibility`)
    return {
      success: response.success,
      creator_id: response.eligibility?.participant_id ?? creatorId,
      eligible: Boolean(response.eligibility?.eligible),
      available_balance: response.eligibility?.available_balance ?? 0,
      issues: response.eligibility?.issues || [],
      requirements: response.eligibility?.requirements || {},
    }
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
    const response = await this.request<any>('participants', {
      participant_id: req.creatorId,
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
    const participant = response.participant || {}
    return {
      success: response.success,
      creator: {
        id: participant.id,
        accountId: participant.account_id,
        displayName: participant.display_name,
        email: participant.email,
        defaultSplitPercent: participant.default_split_percent,
        payoutPreferences: participant.payout_preferences || {},
        createdAt: participant.created_at,
      },
    }
  }

  // === TREASURY RESOURCES ===

  async createParticipant(req: CreateParticipantRequest): Promise<CreateParticipantResponse> {
    const response = await this.request<any>('participants', {
      participant_id: req.participantId,
      user_id: req.userId,
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

    const participant = response.participant || {}
    return {
      success: response.success,
      participant: {
        id: participant.id,
        accountId: participant.account_id,
        linkedUserId: participant.linked_user_id ?? null,
        displayName: participant.display_name,
        email: participant.email,
        defaultSplitPercent: participant.default_split_percent,
        payoutPreferences: participant.payout_preferences || {},
        createdAt: participant.created_at,
      },
    }
  }

  async listParticipants(): Promise<{ success: boolean; participants: ParticipantSummary[] }> {
    const response = await this.requestGet<any>('participants')
    return {
      success: response.success,
      participants: (response.participants || []).map((participant: any) => ({
        id: participant.id,
        linkedUserId: participant.linked_user_id ?? null,
        name: participant.name ?? null,
        tier: participant.tier ?? null,
        ledgerBalance: participant.ledger_balance,
        heldAmount: participant.held_amount,
        availableBalance: participant.available_balance,
      })),
    }
  }

  async getParticipant(participantId: string): Promise<{ success: boolean; participant: ParticipantDetail }> {
    const response = await this.requestGet<any>(`participants/${participantId}`)
    const participant = response.participant || {}
    return {
      success: response.success,
      participant: {
        id: participant.id,
        linkedUserId: participant.linked_user_id ?? null,
        name: participant.name ?? null,
        tier: participant.tier ?? null,
        customSplitPercent: participant.custom_split_percent ?? null,
        ledgerBalance: participant.ledger_balance,
        heldAmount: participant.held_amount,
        availableBalance: participant.available_balance,
        holds: (participant.holds || []).map((hold: any) => ({
          amount: hold.amount,
          reason: hold.reason ?? null,
          releaseDate: hold.release_date ?? null,
          status: hold.status,
        })),
      },
    }
  }

  async getParticipantPayoutEligibility(participantId: string): Promise<ParticipantPayoutEligibilityResponse> {
    const response = await this.requestGet<any>(`participants/${participantId}/payout-eligibility`)
    return {
      success: response.success,
      eligibility: {
        participantId: response.eligibility?.participant_id ?? participantId,
        eligible: Boolean(response.eligibility?.eligible),
        availableBalance: response.eligibility?.available_balance ?? 0,
        issues: response.eligibility?.issues || [],
        requirements: response.eligibility?.requirements || {},
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

  async evaluateFraud(req: RiskEvaluationRequest): Promise<RiskEvaluationResponse> {
    const response = await this.request<any>('fraud/evaluations', {
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

  async createFraudPolicy(req: CreatePolicyRequest): Promise<FraudPolicyResponse> {
    const response = await this.request<any>('fraud/policies', {
      policy_type: req.policyType,
      config: req.config,
      severity: req.severity,
      priority: req.priority,
    })
    return {
      success: response.success,
      policy: {
        id: response.policy.id,
        type: response.policy.type,
        severity: response.policy.severity,
        priority: response.policy.priority,
        isActive: Boolean(response.policy.is_active),
        config: response.policy.config || {},
        createdAt: response.policy.created_at ?? null,
        updatedAt: response.policy.updated_at ?? null,
      },
    }
  }

  async listFraudPolicies(): Promise<FraudPolicyListResponse> {
    const response = await this.requestGet<any>('fraud/policies')
    return {
      success: response.success,
      policies: (response.policies || []).map((policy: any) => ({
        id: policy.id,
        type: policy.type,
        severity: policy.severity,
        priority: policy.priority,
        isActive: Boolean(policy.is_active),
        config: policy.config || {},
        createdAt: policy.created_at ?? null,
        updatedAt: policy.updated_at ?? null,
      })),
    }
  }

  async deleteFraudPolicy(policyId: string): Promise<FraudPolicyDeleteResponse> {
    const response = await this.requestDelete<any>(`fraud/policies/${policyId}`)
    return {
      success: response.success,
      deleted: Boolean(response.deleted),
      policyId: response.policy_id,
    }
  }

  // === TAX DOCUMENTS ===

  async calculateTaxForParticipant(participantId: string, taxYear?: number): Promise<TaxCalculationResponse> {
    const response = await this.requestGet<any>(`tax/calculations/${participantId}`, {
      tax_year: taxYear,
    })
    return {
      success: response.success,
      calculation: {
        participantId: response.calculation.participant_id,
        taxYear: response.calculation.tax_year,
        grossPayments: response.calculation.gross_payments,
        transactionCount: response.calculation.transaction_count,
        requires1099: Boolean(response.calculation.requires_1099),
        monthlyTotals: response.calculation.monthly_totals || {},
        threshold: response.calculation.threshold,
        linkedUserId: response.calculation.linked_user_id ?? null,
        sharedTaxProfile: response.calculation.shared_tax_profile
          ? {
              status: response.calculation.shared_tax_profile.status,
              legalName: response.calculation.shared_tax_profile.legal_name ?? null,
              taxIdLast4: response.calculation.shared_tax_profile.tax_id_last4 ?? null,
            }
          : null,
      },
    }
  }

  async generateAllTaxDocuments(taxYear?: number): Promise<TaxDocumentGenerationResponse> {
    const response = await this.request<any>('tax/documents/generate', { tax_year: taxYear })
    return {
      success: response.success,
      generation: {
        taxYear: response.generation.tax_year,
        created: response.generation.created,
        skipped: response.generation.skipped,
        totalAmount: response.generation.total_amount,
      },
    }
  }

  async listTaxDocuments(taxYear?: number): Promise<TaxDocumentsResponse> {
    const response = await this.requestGet<any>('tax/documents', { tax_year: taxYear })
    return {
      success: response.success,
      taxYear: response.tax_year,
      summary: {
        totalDocuments: response.summary?.total_documents ?? 0,
        totalAmount: response.summary?.total_amount ?? 0,
        byStatus: {
          calculated: response.summary?.by_status?.calculated ?? 0,
          exported: response.summary?.by_status?.exported ?? 0,
          filed: response.summary?.by_status?.filed ?? 0,
        },
      },
      documents: response.documents || [],
    }
  }

  async getTaxDocument(documentId: string): Promise<TaxDocumentResponse> {
    const response = await this.requestGet<any>(`tax/documents/${documentId}`)
    return {
      success: response.success,
      document: response.document,
    }
  }

  async exportTaxDocuments(taxYear?: number, format: 'csv' | 'json' = 'json') {
    if (format === 'csv') {
      const response = await this.requestGetRaw('tax/documents/export', { tax_year: taxYear, format })
      const csv = await response.text()
      const disposition = response.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      return { csv, filename: filenameMatch?.[1] || `1099_export_${taxYear}.csv` }
    }
    return this.requestGet('tax/documents/export', { tax_year: taxYear, format })
  }

  async markTaxDocumentFiled(documentId: string): Promise<TaxDocumentResponse> {
    const response = await this.request<any>(`tax/documents/${documentId}/mark-filed`, {})
    return {
      success: response.success,
      document: {
        id: response.document.id,
        tax_year: response.document.tax_year,
        status: response.document.status,
      },
    }
  }

  async generateTaxSummary(taxYear: number, creatorId?: string): Promise<TaxSummaryResponse> {
    const response = await this.requestGet<any>(`tax/summaries/${taxYear}`, {
      participant_id: creatorId,
    })
    return {
      success: response.success,
      taxYear: response.tax_year,
      note: response.note,
      summaries: (response.summaries || []).map((summary: any) => ({
        participantId: summary.participant_id,
        linkedUserId: summary.linked_user_id ?? null,
        grossEarnings: summary.gross_earnings,
        refundsIssued: summary.refunds_issued,
        netEarnings: summary.net_earnings,
        totalPaidOut: summary.total_paid_out,
        requires1099: Boolean(summary.requires_1099),
        sharedTaxProfile: summary.shared_tax_profile
          ? {
              status: summary.shared_tax_profile.status,
              legalName: summary.shared_tax_profile.legal_name ?? null,
              taxIdLast4: summary.shared_tax_profile.tax_id_last4 ?? null,
            }
          : null,
      })),
      totals: {
        totalGross: response.totals.total_gross,
        totalRefunds: response.totals.total_refunds,
        totalNet: response.totals.total_net,
        totalPaid: response.totals.total_paid,
        participantsRequiring1099: response.totals.participants_requiring_1099,
      },
    }
  }

  async markTaxDocumentsFiledBulk(taxYear: number) {
    return this.request<any>('tax/documents/mark-filed', { tax_year: taxYear })
  }

  async correctTaxDocument(documentId: string, params: {
    reason: string
    grossAmount?: number
    federalWithholding?: number
    stateWithholding?: number
  }) {
    return this.request<any>(`tax/documents/${documentId}/correct`, {
      reason: params.reason,
      gross_amount: params.grossAmount,
      federal_withholding: params.federalWithholding,
      state_withholding: params.stateWithholding,
    })
  }

  async deliverTaxDocumentCopyB(taxYear: number) {
    return this.request<any>('tax/documents/deliver-copy-b', { tax_year: taxYear })
  }

  async generateTaxDocumentPdf(documentId: string, copyType?: string) {
    return this.request<any>(`tax/documents/${documentId}/pdf`, {
      copy_type: copyType,
    })
  }

  async generateTaxDocumentPdfBatch(taxYear: number, copyType?: string) {
    return this.request<any>('tax/documents/pdf/batch', {
      tax_year: taxYear,
      copy_type: copyType,
    })
  }

  // === COMPLIANCE MONITORING ===

  async getComplianceOverview(options?: { days?: number; hours?: number }): Promise<ComplianceOverviewResponse> {
    const response = await this.requestGet<any>('compliance/overview', {
      days: options?.days,
      hours: options?.hours,
    })
    return {
      success: response.success,
      overview: {
        windowDays: response.overview.window_days,
        accessWindowHours: response.overview.access_window_hours,
        totalEvents: response.overview.total_events,
        uniqueIps: response.overview.unique_ips,
        uniqueActors: response.overview.unique_actors,
        highRiskEvents: response.overview.high_risk_events,
        criticalRiskEvents: response.overview.critical_risk_events,
        failedAuthEvents: response.overview.failed_auth_events,
        payoutsFailed: response.overview.payouts_failed,
        refundsRecorded: response.overview.refunds_recorded,
        disputeEvents: response.overview.dispute_events,
      },
      note: response.note,
    }
  }

  async listComplianceAccessPatterns(options?: { hours?: number; limit?: number }): Promise<ComplianceAccessPatternsResponse> {
    const response = await this.requestGet<any>('compliance/access-patterns', {
      hours: options?.hours,
      limit: options?.limit,
    })
    return {
      success: response.success,
      windowHours: response.window_hours,
      count: response.count,
      patterns: (response.patterns || []).map((pattern: any) => ({
        ipAddress: pattern.ip_address,
        hour: pattern.hour,
        requestCount: pattern.request_count,
        uniqueActions: pattern.unique_actions,
        actions: pattern.actions || [],
        maxRiskScore: pattern.max_risk_score,
        failedAuths: pattern.failed_auths,
      })),
    }
  }

  async listComplianceFinancialActivity(options?: { days?: number }): Promise<ComplianceFinancialActivityResponse> {
    const response = await this.requestGet<any>('compliance/financial-activity', {
      days: options?.days,
    })
    return {
      success: response.success,
      windowDays: response.window_days,
      activity: (response.activity || []).map((entry: any) => ({
        date: entry.date,
        payoutsInitiated: entry.payouts_initiated,
        payoutsCompleted: entry.payouts_completed,
        payoutsFailed: entry.payouts_failed,
        salesRecorded: entry.sales_recorded,
        refundsRecorded: entry.refunds_recorded,
        disputeEvents: entry.dispute_events,
      })),
    }
  }

  async listComplianceSecuritySummary(options?: { days?: number }): Promise<ComplianceSecuritySummaryResponse> {
    const response = await this.requestGet<any>('compliance/security-summary', {
      days: options?.days,
    })
    return {
      success: response.success,
      windowDays: response.window_days,
      summary: (response.summary || []).map((entry: any) => ({
        date: entry.date,
        action: entry.action,
        eventCount: entry.event_count,
        uniqueIps: entry.unique_ips,
        uniqueActors: entry.unique_actors,
        avgRiskScore: entry.avg_risk_score,
        maxRiskScore: entry.max_risk_score,
        highRiskCount: entry.high_risk_count,
        criticalRiskCount: entry.critical_risk_count,
      })),
    }
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

  private mapWalletObject(wallet: any): WalletObject {
    return {
      id: wallet.id,
      object: 'wallet',
      walletType: wallet.wallet_type,
      scopeType: wallet.scope_type,
      ownerId: wallet.owner_id ?? null,
      ownerType: wallet.owner_type ?? null,
      participantId: wallet.participant_id ?? null,
      accountType: wallet.account_type,
      name: wallet.name ?? null,
      currency: wallet.currency,
      status: wallet.status,
      balance: wallet.balance,
      heldAmount: wallet.held_amount ?? 0,
      availableBalance: wallet.available_balance ?? wallet.balance,
      redeemable: wallet.redeemable === true,
      transferable: wallet.transferable === true,
      topupSupported: wallet.topup_supported === true,
      payoutSupported: wallet.payout_supported === true,
      createdAt: wallet.created_at ?? null,
      metadata: wallet.metadata || {},
    }
  }

  async listWallets(filters: ListWalletsRequest = {}): Promise<ListWalletsResponse> {
    const response = await this.requestGet<any>('wallets', {
      owner_id: filters.ownerId,
      owner_type: filters.ownerType,
      wallet_type: filters.walletType,
      limit: filters.limit,
      offset: filters.offset,
    })

    return {
      success: response.success,
      wallets: (response.wallets || []).map((wallet: any) => this.mapWalletObject(wallet)),
      total: response.total,
      limit: response.limit,
      offset: response.offset,
    }
  }

  async createWallet(req: CreateWalletRequest): Promise<CreateWalletResponse> {
    const response = await this.request<any>('wallets', {
      owner_id: req.ownerId,
      participant_id: req.participantId,
      owner_type: req.ownerType,
      wallet_type: req.walletType,
      name: req.name,
      metadata: req.metadata,
    })

    return {
      success: response.success,
      created: response.created === true,
      wallet: this.mapWalletObject(response.wallet),
    }
  }

  async getWallet(walletId: string): Promise<GetWalletResponse> {
    const response = await this.requestGet<any>(`wallets/${walletId}`)
    return {
      success: response.success,
      wallet: this.mapWalletObject(response.wallet),
    }
  }

  async getWalletEntries(walletId: string, options?: { limit?: number; offset?: number }): Promise<WalletEntriesResponse> {
    const response = await this.requestGet<any>(`wallets/${walletId}/entries`, {
      limit: options?.limit,
      offset: options?.offset,
    })

    return {
      success: response.success,
      wallet: response.wallet ? this.mapWalletObject(response.wallet) : null,
      entries: (response.entries || []).map((t: any) => ({
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

  async topUpWallet(req: WalletTopupRequest): Promise<WalletTopupResponse> {
    const response = await this.request<any>(`wallets/${req.walletId}/topups`, {
      amount: req.amount,
      reference_id: req.referenceId,
      description: req.description,
      metadata: req.metadata,
    })

    const topup = response.topup || response.deposit || response
    return {
      success: response.success,
      walletId: topup.wallet_id ?? null,
      ownerId: topup.owner_id ?? null,
      transactionId: topup.transaction_id ?? null,
      balance: topup.balance ?? null,
    }
  }

  async withdrawFromWallet(req: WalletWithdrawRequest): Promise<WalletWithdrawalResponse> {
    const response = await this.request<any>(`wallets/${req.walletId}/withdrawals`, {
      amount: req.amount,
      reference_id: req.referenceId,
      description: req.description,
      metadata: req.metadata,
    })
    const withdrawal = response.withdrawal || response
    return {
      success: response.success,
      walletId: withdrawal.wallet_id ?? null,
      ownerId: withdrawal.owner_id ?? null,
      transactionId: withdrawal.transaction_id ?? null,
      balance: withdrawal.balance ?? null,
    }
  }

  async createTransfer(req: ParticipantTransferRequest): Promise<ParticipantTransferResponse> {
    const response = await this.request<any>('transfers', {
      from_participant_id: req.fromParticipantId,
      to_participant_id: req.toParticipantId,
      amount: req.amount,
      reference_id: req.referenceId,
      description: req.description,
      metadata: req.metadata,
    })
    const transfer = response.transfer || response
    return {
      success: response.success,
      transfer: {
        transactionId: transfer.transaction_id,
        fromParticipantId: req.fromParticipantId,
        toParticipantId: req.toParticipantId,
        fromBalance: transfer.from_balance,
        toBalance: transfer.to_balance,
      },
    }
  }

  async listHolds(options?: HoldQueryOptions): Promise<HeldFundsResponse> {
    const response = await this.requestGet<any>('holds', {
      participant_id: options?.participantId,
      venture_id: options?.ventureId,
      ready_only: options?.readyOnly,
      limit: options?.limit,
    })
    return {
      success: response.success,
      holds: (response.holds || []).map((hold: any) => ({
        id: hold.id,
        participantId: hold.participant_id ?? null,
        participantName: hold.participant_name ?? null,
        amount: hold.amount,
        currency: hold.currency,
        heldSince: hold.held_since,
        daysHeld: hold.days_held,
        holdReason: hold.hold_reason ?? null,
        holdUntil: hold.hold_until ?? null,
        readyForRelease: Boolean(hold.ready_for_release),
        releaseStatus: hold.release_status,
        transactionReference: hold.transaction_reference ?? null,
        productName: hold.product_name ?? null,
        ventureId: hold.venture_id ?? null,
        connectedAccountReady: Boolean(hold.connected_account_ready),
      })),
      count: response.count ?? 0,
    }
  }

  async getHoldSummary(): Promise<HeldFundsSummaryResponse> {
    const response = await this.requestGet<any>('holds/summary')
    return {
      success: response.success,
      summary: response.summary || {},
    }
  }

  async releaseHold(req: ReleaseHoldRequest): Promise<ReleaseHoldResponse> {
    const response = await this.request<any>(`holds/${req.holdId}/release`, {
      execute_transfer: req.executeTransfer !== false,
    })
    const release = response.release || response
    return {
      success: response.success,
      release: {
        id: release.id,
        holdId: release.hold_id ?? req.holdId,
        executed: Boolean(release.executed),
        transferId: release.transfer_id ?? null,
        transferStatus: release.transfer_status ?? null,
        amount: release.amount ?? null,
        currency: release.currency ?? null,
      },
    }
  }

  async createCheckoutSession(
    req: CreateCheckoutSessionRequest,
  ): Promise<CheckoutSessionResourceResponse> {
    const hasPaymentMethod = 'paymentMethodId' in req ? Boolean(req.paymentMethodId || req.sourceId) : false
    if (!hasPaymentMethod && !req.successUrl) {
      throw new Error('Either paymentMethodId/sourceId or successUrl is required')
    }

    const response = await this.request<any>('checkout-sessions', {
      amount: req.amount,
      participant_id: req.participantId,
      currency: req.currency,
      product_id: req.productId,
      product_name: req.productName,
      customer_email: req.customerEmail,
      customer_id: req.customerId,
      payment_method_id: 'paymentMethodId' in req ? req.paymentMethodId : undefined,
      source_id: 'sourceId' in req ? req.sourceId : undefined,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      idempotency_key: 'idempotencyKey' in req ? req.idempotencyKey : undefined,
      metadata: req.metadata,
    })

    const checkoutSession = response.checkout_session || response

    return {
      success: Boolean(response.success),
      checkoutSession: {
        id: checkoutSession.id ?? checkoutSession.payment_id ?? checkoutSession.payment_intent_id,
        mode: checkoutSession.mode === 'session' ? 'session' : 'direct',
        checkoutUrl: checkoutSession.checkout_url ?? null,
        paymentId: checkoutSession.payment_id ?? null,
        paymentIntentId: checkoutSession.payment_intent_id ?? checkoutSession.payment_id ?? null,
        status: checkoutSession.status ?? null,
        requiresAction: Boolean(checkoutSession.requires_action),
        amount: checkoutSession.amount ?? req.amount,
        currency: checkoutSession.currency ?? (req.currency || 'USD'),
        expiresAt: checkoutSession.expires_at ?? null,
        breakdown: checkoutSession.breakdown
          ? {
              grossAmount: checkoutSession.breakdown.gross_amount,
              creatorAmount: checkoutSession.breakdown.creator_amount,
              platformAmount: checkoutSession.breakdown.platform_amount,
              creatorPercent: checkoutSession.breakdown.creator_percent,
            }
          : null,
      },
    }
  }

  async createPayout(req: CreatePayoutRequest): Promise<PayoutResourceResponse> {
    const response = await this.request<any>('payouts', {
      participant_id: req.participantId,
      wallet_id: req.walletId,
      amount: req.amount,
      reference_id: req.referenceId,
      reference_type: req.referenceType,
      description: req.description,
      payout_method: req.payoutMethod,
      fees: req.fees,
      fees_paid_by: req.feesPaidBy,
      metadata: req.metadata,
    })
    const payout = response.payout || response
    return {
      success: response.success,
      payout: {
        id: payout.id,
        transactionId: payout.transaction_id,
        grossAmount: payout.gross_amount ?? null,
        fees: payout.fees ?? null,
        netAmount: payout.net_amount ?? null,
        previousBalance: payout.previous_balance ?? null,
        newBalance: payout.new_balance ?? null,
      },
    }
  }

  async createRefund(req: CreateRefundRequest): Promise<RefundResourceResponse> {
    const response = await this.request<any>('refunds', {
      sale_reference: req.saleReference,
      reason: req.reason,
      amount: req.amount,
      refund_from: req.refundFrom,
      external_refund_id: req.externalRefundId,
      idempotency_key: req.idempotencyKey,
      mode: req.mode,
      processor_payment_id: req.processorPaymentId,
      metadata: req.metadata,
    })
    const refund = response.refund || response
    return {
      success: response.success,
      warning: response.warning ?? null,
      warningCode: response.warning_code ?? null,
      refund: {
        id: refund.id ?? refund.reference_id ?? refund.transaction_id ?? '',
        transactionId: refund.transaction_id ?? null,
        referenceId: refund.reference_id ?? null,
        saleReference: refund.sale_reference ?? null,
        refundedAmount: refund.refunded_amount ?? null,
        currency: refund.currency ?? null,
        status: refund.status ?? null,
        breakdown: refund.breakdown
          ? {
              fromCreator: refund.breakdown.from_creator,
              fromPlatform: refund.breakdown.from_platform,
            }
          : null,
        isFullRefund: refund.is_full_refund ?? null,
        repairPending: refund.repair_pending ?? null,
      },
    }
  }

  async listRefunds(req: ListRefundsRequest = {}): Promise<ListRefundsResponse> {
    const response = await this.requestGet<any>('refunds', {
      sale_reference: req.saleReference,
      limit: req.limit,
    })

    return {
      success: response.success,
      count: response.count ?? (response.refunds || []).length,
      refunds: (response.refunds || []).map((refund: any) => ({
        id: refund.id,
        transactionId: refund.transaction_id ?? null,
        referenceId: refund.reference_id ?? null,
        saleReference: refund.sale_reference ?? null,
        refundedAmount: refund.refunded_amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason ?? null,
        refundFrom: refund.refund_from ?? null,
        externalRefundId: refund.external_refund_id ?? null,
        createdAt: refund.created_at ?? null,
        breakdown: refund.breakdown
          ? {
              fromCreator: refund.breakdown.from_creator,
              fromPlatform: refund.breakdown.from_platform,
            }
          : null,
        repairPending: refund.repair_pending ?? null,
        lastError: refund.last_error ?? null,
      })),
    }
  }

  // === INVOICES ===

  async createInvoice(req: CreateInvoiceRequest) {
    return this.request<any>('invoices', {
      customer_name: req.customerName,
      customer_email: req.customerEmail,
      customer_id: req.customerId,
      customer_address: req.customerAddress ? {
        line1: req.customerAddress.line1,
        line2: req.customerAddress.line2,
        city: req.customerAddress.city,
        state: req.customerAddress.state,
        postal_code: req.customerAddress.postalCode,
        country: req.customerAddress.country,
      } : undefined,
      line_items: req.lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        amount: item.amount ?? Math.round(item.quantity * item.unitPrice),
      })),
      due_date: req.dueDate,
      notes: req.notes,
      terms: req.terms,
      reference_id: req.referenceId,
      metadata: req.metadata,
    })
  }

  async listInvoices(options?: { status?: string; customerId?: string; limit?: number; offset?: number }) {
    return this.requestGet<any>('invoices', {
      status: options?.status,
      customer_id: options?.customerId,
      limit: options?.limit,
      offset: options?.offset,
    })
  }

  async getInvoice(invoiceId: string) {
    return this.requestGet<any>(`invoices/${invoiceId}`)
  }

  async sendInvoice(invoiceId: string) {
    return this.request<any>(`invoices/${invoiceId}/send`, {})
  }

  async recordInvoicePayment(invoiceId: string, req: RecordInvoicePaymentRequest) {
    return this.request<any>(`invoices/${invoiceId}/record-payment`, {
      amount: req.amount,
      payment_method: req.paymentMethod,
      payment_date: req.paymentDate,
      reference_id: req.referenceId,
      notes: req.notes,
    })
  }

  async voidInvoice(invoiceId: string, reason?: string) {
    return this.request<any>(`invoices/${invoiceId}/void`, { reason })
  }

  // === PAY BILL ===

  async payBill(req: PayBillRequest) {
    return this.request<any>('pay-bill', {
      bill_transaction_id: req.billTransactionId,
      amount: req.amount,
      vendor_name: req.vendorName,
      reference_id: req.referenceId,
      payment_method: req.paymentMethod,
      payment_date: req.paymentDate,
      metadata: req.metadata,
    })
  }

  // === BUDGETS ===

  async createBudget(req: CreateBudgetRequest) {
    return this.request<any>('manage-budgets', {
      name: req.name,
      category_code: req.categoryCode,
      budget_amount: req.budgetAmount,
      budget_period: req.budgetPeriod,
      alert_at_percentage: req.alertAtPercentage,
    })
  }

  async listBudgets() {
    return this.requestGet<any>('manage-budgets')
  }

  // === RECURRING EXPENSES ===

  async createRecurring(req: CreateRecurringRequest) {
    return this.request<any>('manage-recurring', {
      name: req.name,
      merchant_name: req.merchantName,
      category_code: req.categoryCode,
      amount: req.amount,
      recurrence_interval: req.recurrenceInterval,
      recurrence_day: req.recurrenceDay,
      start_date: req.startDate,
      end_date: req.endDate,
      business_purpose: req.businessPurpose,
      is_variable_amount: req.isVariableAmount,
    })
  }

  async listRecurring() {
    return this.requestGet<any>('manage-recurring')
  }

  async getDueRecurring(days?: number) {
    return this.requestGet<any>('manage-recurring/due', { days })
  }

  // === CONTRACTORS ===

  async createContractor(req: CreateContractorRequest) {
    return this.request<any>('manage-contractors', {
      name: req.name,
      email: req.email,
      company_name: req.companyName,
    })
  }

  async listContractors() {
    return this.requestGet<any>('manage-contractors')
  }

  async recordContractorPayment(req: RecordContractorPaymentRequest) {
    return this.request<any>('manage-contractors/payment', {
      contractor_id: req.contractorId,
      amount: req.amount,
      payment_date: req.paymentDate,
      payment_method: req.paymentMethod,
      payment_reference: req.paymentReference,
      description: req.description,
    })
  }

  // === BANK ACCOUNTS ===

  async createBankAccount(req: CreateBankAccountRequest) {
    return this.request<any>('manage-bank-accounts', {
      bank_name: req.bankName,
      account_name: req.accountName,
      account_type: req.accountType,
      account_last_four: req.accountLastFour,
    })
  }

  async listBankAccounts() {
    return this.requestGet<any>('manage-bank-accounts')
  }

  // === LEDGER LISTING ===

  async listLedgers() {
    return this.requestGet<any>('list-ledgers')
  }

  // === DELETE CREATOR ===

  async deleteCreator(creatorId: string) {
    return this.request<any>('delete-creator', {
      creator_id: creatorId,
    })
  }

  // === TAX INFO ===

  async submitTaxInfo(req: SubmitTaxInfoRequest) {
    return this.request<any>('submit-tax-info', {
      participant_id: req.participantId,
      legal_name: req.legalName,
      tax_id_type: req.taxIdType,
      tax_id_last4: req.taxIdLast4,
      business_type: req.businessType,
      address: req.address ? {
        line1: req.address.line1,
        line2: req.address.line2,
        city: req.address.city,
        state: req.address.state,
        postal_code: req.address.postalCode,
        country: req.address.country,
      } : undefined,
      certify: req.certify,
    })
  }

  // === BANK STATEMENT IMPORT ===

  async importBankStatement(req: ImportBankStatementRequest) {
    return this.request<any>('import-bank-statement', {
      bank_account_id: req.bankAccountId,
      lines: req.lines.map(line => ({
        transaction_date: line.transactionDate,
        post_date: line.postDate,
        description: line.description,
        amount: line.amount,
        reference_number: line.referenceNumber,
        check_number: line.checkNumber,
        merchant_name: line.merchantName,
        category_hint: line.categoryHint,
      })),
      auto_match: req.autoMatch,
    })
  }
}

export default Soledgic
