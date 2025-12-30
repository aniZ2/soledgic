/**
 * Soledgic TypeScript SDK
 * Double-entry accounting API for creator platforms
 * Full accounting compliance with period locking, reconciliation, and frozen statements
 */

export interface SoledgicConfig {
  apiKey: string
  baseUrl?: string
}

// === REQUEST TYPES ===

export interface RecordSaleRequest {
  referenceId: string
  creatorId: string
  amount: number
  processingFee?: number
  productId?: string
  productName?: string
  creatorName?: string
  transactionDate?: string // For backdated entries
}

export interface RecordIncomeRequest {
  referenceId: string
  amount: number
  description?: string
  category?: string
  customerName?: string
  transactionDate?: string
}

export interface RecordExpenseRequest {
  referenceId: string
  amount: number
  description?: string
  category?: string
  vendorName?: string
  paidFrom?: 'cash' | 'credit_card'
  transactionDate?: string
  authorizingInstrumentId?: string  // Optional: link to authorizing instrument for validation
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
  authorizingInstrumentId?: string  // Optional: link to authorizing instrument for validation
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

export interface ProcessPayoutRequest {
  referenceId: string
  creatorId: string
  amount: number
  payoutMethod?: string
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
    withheldAmount: number
  }
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

export class Soledgic {
  private apiKey: string
  private baseUrl: string

  constructor(config: SoledgicConfig | string) {
    if (typeof config === 'string') {
      this.apiKey = config
      this.baseUrl = 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
    } else {
      this.apiKey = config.apiKey
      this.baseUrl = config.baseUrl || 'https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1'
    }
  }

  private async request<T>(endpoint: string, body: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      const error = new Error(data.error || `Request failed: ${response.status}`) as any
      error.status = response.status
      error.period = data.period // For locked period errors
      error.details = data
      throw error
    }
    return data
  }

  // === MARKETPLACE MODE - SALES & PAYOUTS ===

  async recordSale(req: RecordSaleRequest): Promise<SaleResponse> {
    return this.request('record-sale', {
      reference_id: req.referenceId,
      creator_id: req.creatorId,
      amount: req.amount,
      processing_fee: req.processingFee,
      product_id: req.productId,
      product_name: req.productName,
      creator_name: req.creatorName,
      transaction_date: req.transactionDate,
    })
  }

  async processPayout(req: ProcessPayoutRequest) {
    return this.request('process-payout', {
      reference_id: req.referenceId,
      creator_id: req.creatorId,
      amount: req.amount,
      payout_method: req.payoutMethod,
    })
  }

  // === STANDARD MODE - INCOME & EXPENSES ===

  async recordIncome(req: RecordIncomeRequest) {
    return this.request('record-income', {
      reference_id: req.referenceId,
      amount: req.amount,
      description: req.description,
      category: req.category,
      customer_name: req.customerName,
      transaction_date: req.transactionDate,
    })
  }

  async recordExpense(req: RecordExpenseRequest) {
    return this.request('record-expense', {
      reference_id: req.referenceId,
      amount: req.amount,
      description: req.description,
      category: req.category,
      vendor_name: req.vendorName,
      paid_from: req.paidFrom,
      transaction_date: req.transactionDate,
      authorizing_instrument_id: req.authorizingInstrumentId,
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
      authorizing_instrument_id: req.authorizingInstrumentId,
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

  async configurePayoutRail(rail: 'stripe_connect' | 'plaid_transfer' | 'paypal' | 'wise' | 'manual' | 'crypto', config: {
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

  // === STRIPE RECONCILIATION ===

  async listStripeTransactions() {
    return this.request('stripe', { action: 'list_transactions' })
  }

  async listStripeEvents() {
    return this.request('stripe', { action: 'list_events' })
  }

  async getStripeReconciliationSummary() {
    return this.request('stripe', { action: 'get_summary' })
  }

  async matchStripeTransaction(stripeTransactionId: string, ledgerTransactionId: string) {
    return this.request('stripe', {
      action: 'match',
      stripe_transaction_id: stripeTransactionId,
      ledger_transaction_id: ledgerTransactionId,
    })
  }

  async unmatchStripeTransaction(stripeTransactionId: string) {
    return this.request('stripe', {
      action: 'unmatch',
      stripe_transaction_id: stripeTransactionId,
    })
  }

  async excludeStripeTransaction(stripeTransactionId: string) {
    return this.request('stripe', {
      action: 'exclude',
      stripe_transaction_id: stripeTransactionId,
    })
  }

  async markStripeTransactionReviewed(stripeTransactionId: string) {
    return this.request('stripe', {
      action: 'mark_reviewed',
      stripe_transaction_id: stripeTransactionId,
    })
  }

  async restoreStripeTransaction(stripeTransactionId: string) {
    return this.request('stripe', {
      action: 'restore',
      stripe_transaction_id: stripeTransactionId,
    })
  }

  async reprocessStripeEvent(eventId: string) {
    return this.request('stripe', {
      action: 'reprocess_event',
      event_id: eventId,
    })
  }

  // === PAYOUT ↔ BANK RECONCILIATION ===

  async matchPayoutsToBank() {
    return this.request('stripe', { action: 'match_payouts_to_bank' })
  }

  async getPayoutReconciliation() {
    return this.request('stripe', { action: 'get_payout_reconciliation' })
  }

  async linkPayoutToBank(stripeTransactionId: string, bankTransactionId: string) {
    return this.request('stripe', {
      action: 'link_payout_to_bank',
      stripe_transaction_id: stripeTransactionId,
      bank_transaction_id: bankTransactionId,
    })
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
}

export default Soledgic
