/**
 * Soledgic SDK Type Definitions
 * All request/response interfaces and type aliases
 */

export interface SoledgicConfig {
  apiKey: string
  baseUrl: string
  /** Request timeout in milliseconds. Default: 30000 (30s). */
  timeout?: number
  /** API version header to send with requests. Default: 2026-03-01. */
  apiVersion?: string
}

export type WebhookPayloadInput =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Record<string, unknown>

export interface VerifyWebhookSignatureOptions {
  toleranceSeconds?: number
  now?: number | Date
}

export interface ParsedWebhookEvent<T = Record<string, unknown>> {
  id: string | null
  type: string
  createdAt: string | null
  livemode: boolean | null
  data: T | null
  raw: Record<string, unknown>
}

export interface WebhookEndpoint {
  id: string
  url: string
  description: string | null
  events: string[]
  isActive: boolean
  createdAt: string
  secretRotatedAt: string | null
}

export interface WebhookEndpointSecretResult extends WebhookEndpoint {
  secret: string | null
}

export interface WebhookDelivery {
  id: string
  endpointId: string | null
  endpointUrl: string | null
  eventType: string
  status: string
  attempts: number
  maxAttempts: number | null
  responseStatus: number | null
  responseBody: string | null
  responseTimeMs: number | null
  createdAt: string
  deliveredAt: string | null
  nextRetryAt: string | null
  payload: Record<string, unknown> | null
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

export interface RecordRefundResponse {
  success: boolean
  transactionId: string | null
  referenceId: string | null
  saleReference: string | null
  refundedAmount: number | null
  currency: string | null
  status: string | null
  breakdown: {
    fromCreator: number
    fromPlatform: number
  } | null
  isFullRefund: boolean | null
  repairPending?: boolean | null
  warning?: string | null
  warningCode?: string | null
}

export interface ListRefundsRequest {
  saleReference?: string
  limit?: number
}

export interface RefundSummary {
  id: string
  transactionId: string | null
  referenceId: string | null
  saleReference: string | null
  refundedAmount: number
  currency: string
  status: string
  reason: string | null
  refundFrom: string | null
  externalRefundId: string | null
  createdAt: string | null
  breakdown: {
    fromCreator: number
    fromPlatform: number
  } | null
  repairPending?: boolean | null
  lastError?: string | null
}

export interface ListRefundsResponse {
  success: boolean
  refunds: RefundSummary[]
  count: number
}

export interface ReverseTransactionRequest {
  transactionId: string
  reason: string
  partialAmount?: number
  idempotencyKey?: string
  metadata?: Record<string, unknown>
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

export interface CreateParticipantRequest {
  participantId: string
  userId?: string
  displayName?: string
  email?: string
  defaultSplitPercent?: number
  taxInfo?: CreateCreatorRequest['taxInfo']
  payoutPreferences?: CreateCreatorRequest['payoutPreferences']
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

export interface ParticipantWalletMutationRequest {
  participantId: string
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface ParticipantTransferRequest {
  fromParticipantId: string
  toParticipantId: string
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface HoldQueryOptions {
  participantId?: string
  ventureId?: string
  readyOnly?: boolean
  limit?: number
}

export interface ReleaseHoldRequest {
  holdId: string
  executeTransfer?: boolean
}

export type CreateCheckoutSessionRequest = {
  participantId: string
  amount: number
  currency?: string
  productId?: string
  productName?: string
  customerEmail?: string
  customerId?: string
  metadata?: Record<string, string>
} & (
  { paymentMethodId: string; sourceId?: string; idempotencyKey: string; successUrl?: string; cancelUrl?: string } |
  { paymentMethodId?: string; sourceId: string; idempotencyKey: string; successUrl?: string; cancelUrl?: string } |
  { paymentMethodId?: undefined; sourceId?: undefined; successUrl: string; cancelUrl?: string; idempotencyKey?: string }
)

export interface CreatePayoutRequest {
  participantId: string
  walletId?: string
  amount: number
  referenceId: string
  referenceType?: string
  description?: string
  payoutMethod?: string
  fees?: number
  feesPaidBy?: 'platform' | 'creator'
  metadata?: Record<string, unknown>
}

export interface CreateRefundRequest {
  saleReference: string
  reason: string
  amount?: number
  refundFrom?: 'both' | 'platform_only' | 'creator_only'
  externalRefundId?: string
  idempotencyKey?: string
  mode?: 'ledger_only' | 'processor_refund'
  processorPaymentId?: string
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

// === INVOICE TYPES ===

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount?: number
}

export interface CreateInvoiceRequest {
  customerName: string
  customerEmail?: string
  customerId?: string
  customerAddress?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  lineItems: InvoiceLineItem[]
  dueDate?: string
  notes?: string
  terms?: string
  referenceId?: string
  metadata?: Record<string, unknown>
}

export interface RecordInvoicePaymentRequest {
  amount: number
  paymentMethod?: string
  paymentDate?: string
  referenceId?: string
  notes?: string
}

export interface PayBillRequest {
  billTransactionId?: string
  amount: number
  vendorName?: string
  referenceId?: string
  paymentMethod?: string
  paymentDate?: string
  metadata?: Record<string, unknown>
}

export interface CreateBudgetRequest {
  name: string
  categoryCode?: string
  budgetAmount: number
  budgetPeriod: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  alertAtPercentage?: number
}

export interface CreateRecurringRequest {
  name: string
  merchantName: string
  categoryCode: string
  amount: number
  recurrenceInterval: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  recurrenceDay?: number
  startDate: string
  endDate?: string
  businessPurpose: string
  isVariableAmount?: boolean
}

export interface CreateContractorRequest {
  name: string
  email?: string
  companyName?: string
}

export interface RecordContractorPaymentRequest {
  contractorId: string
  amount: number
  paymentDate: string
  paymentMethod?: string
  paymentReference?: string
  description?: string
}

export interface CreateBankAccountRequest {
  bankName: string
  accountName: string
  accountType: 'checking' | 'savings' | 'credit_card' | 'other'
  accountLastFour?: string
}

export interface SubmitTaxInfoRequest {
  participantId: string
  legalName: string
  taxIdType: 'ssn' | 'ein' | 'itin'
  taxIdLast4: string
  businessType: 'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  certify: boolean
}

export interface ImportBankStatementLine {
  transactionDate: string
  postDate?: string
  description: string
  amount: number
  referenceNumber?: string
  checkNumber?: string
  merchantName?: string
  categoryHint?: string
}

export interface ImportBankStatementRequest {
  bankAccountId: string
  lines: ImportBankStatementLine[]
  autoMatch?: boolean
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

export interface ReverseResponse {
  success: boolean
  voidType: string
  message: string
  transactionId: string
  reversalId: string | null
  reversedAmount: number | null
  isPartial: boolean | null
  voidedAt: string | null
  reversedAt: string | null
  warning: string | null
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

export interface ParticipantSummary {
  id: string
  linkedUserId: string | null
  name: string | null
  tier: string | null
  ledgerBalance: number
  heldAmount: number
  availableBalance: number
}

export interface ParticipantDetail {
  id: string
  linkedUserId: string | null
  name: string | null
  tier: string | null
  customSplitPercent: number | null
  ledgerBalance: number
  heldAmount: number
  availableBalance: number
  holds: Array<{
    amount: number
    reason: string | null
    releaseDate: string | null
    status: string
  }>
}

export interface CreateParticipantResponse {
  success: boolean
  participant: {
    id: string
    accountId: string
    linkedUserId: string | null
    displayName: string | null
    email: string | null
    defaultSplitPercent: number
    payoutPreferences: Record<string, unknown>
    createdAt: string
  }
}

export interface ParticipantPayoutEligibilityResponse {
  success: boolean
  eligibility: {
    participantId: string
    eligible: boolean
    availableBalance: number
    issues: string[]
    requirements: Record<string, unknown>
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

export interface FraudPolicyResource {
  id: string
  type: PolicyType
  severity: PolicySeverity
  priority: number
  isActive: boolean
  config: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

export interface FraudPolicyListResponse {
  success: boolean
  policies: FraudPolicyResource[]
}

export interface FraudPolicyResponse {
  success: boolean
  policy: FraudPolicyResource
}

export interface FraudPolicyDeleteResponse {
  success: boolean
  deleted: boolean
  policyId: string
}

export interface ReconciliationMatchResponse {
  success: boolean
  match: {
    id: string
    transactionId: string
    bankTransactionId: string
    status: string
    matchedAt: string
  }
}

export interface ReconciliationUnmatchResponse {
  success: boolean
  deleted: boolean
  transactionId: string
}

export interface UnmatchedTransactionsResponse {
  success: boolean
  unmatchedCount: number
  transactions: Array<{
    id: string
    referenceId: string | null
    description: string | null
    amount: number
    currency: string
    createdAt: string
    status: string
    metadata: Record<string, unknown>
  }>
}

export interface AutoMatchReconciliationResponse {
  success: boolean
  result: {
    matched: boolean
    matchType: string | null
    matchedTransactionId: string | null
    bankAggregatorTransactionId: string
  }
}

export interface TaxDocumentsResponse {
  success: boolean
  taxYear: number
  summary: {
    totalDocuments: number
    totalAmount: number
    byStatus: {
      calculated: number
      exported: number
      filed: number
    }
  }
  documents: any[]
}

export interface TaxDocumentResponse {
  success: boolean
  document: any
}

export interface TaxDocumentGenerationResponse {
  success: boolean
  generation: {
    taxYear: number
    created: number
    skipped: number
    totalAmount: number
  }
}

export interface TaxCalculationResponse {
  success: boolean
  calculation: {
    participantId: string
    taxYear: number
    grossPayments: number
    transactionCount: number
    requires1099: boolean
    monthlyTotals: Record<string, unknown>
    threshold: number
    linkedUserId: string | null
    sharedTaxProfile: {
      status: string
      legalName: string | null
      taxIdLast4: string | null
    } | null
  }
}

export interface TaxSummaryResponse {
  success: boolean
  taxYear: number
  note: string
  summaries: Array<{
    participantId: string
    linkedUserId: string | null
    grossEarnings: number
    refundsIssued: number
    netEarnings: number
    totalPaidOut: number
    requires1099: boolean
    sharedTaxProfile: {
      status: string
      legalName: string | null
      taxIdLast4: string | null
    } | null
  }>
  totals: {
    totalGross: number
    totalRefunds: number
    totalNet: number
    totalPaid: number
    participantsRequiring1099: number
  }
}

export interface ComplianceOverviewResponse {
  success: boolean
  overview: {
    windowDays: number
    accessWindowHours: number
    totalEvents: number
    uniqueIps: number
    uniqueActors: number
    highRiskEvents: number
    criticalRiskEvents: number
    failedAuthEvents: number
    payoutsFailed: number
    refundsRecorded: number
    disputeEvents: number
  }
  note: string
}

export interface ComplianceAccessPatternsResponse {
  success: boolean
  windowHours: number
  count: number
  patterns: Array<{
    ipAddress: string
    hour: string
    requestCount: number
    uniqueActions: number
    actions: string[]
    maxRiskScore: number
    failedAuths: number
  }>
}

export interface ComplianceFinancialActivityResponse {
  success: boolean
  windowDays: number
  activity: Array<{
    date: string
    payoutsInitiated: number
    payoutsCompleted: number
    payoutsFailed: number
    salesRecorded: number
    refundsRecorded: number
    disputeEvents: number
  }>
}

export interface ComplianceSecuritySummaryResponse {
  success: boolean
  windowDays: number
  summary: Array<{
    date: string
    action: string
    eventCount: number
    uniqueIps: number
    uniqueActors: number
    avgRiskScore: number
    maxRiskScore: number
    highRiskCount: number
    criticalRiskCount: number
  }>
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

export interface WalletObject {
  id: string
  object: 'wallet'
  walletType: 'consumer_credit' | 'creator_earnings'
  scopeType: 'customer' | 'participant'
  ownerId: string | null
  ownerType: string | null
  participantId: string | null
  accountType: string
  name: string | null
  currency: string
  status: string
  balance: number
  heldAmount: number
  availableBalance: number
  redeemable: boolean
  transferable: boolean
  topupSupported: boolean
  payoutSupported: boolean
  createdAt: string | null
  metadata: Record<string, unknown>
}

export interface ListWalletsRequest {
  ownerId?: string
  ownerType?: string
  walletType?: WalletObject['walletType']
  limit?: number
  offset?: number
}

export interface ListWalletsResponse {
  success: boolean
  wallets: WalletObject[]
  total: number
  limit: number
  offset: number
}

export interface CreateWalletRequest {
  ownerId?: string
  participantId?: string
  ownerType?: string
  walletType: WalletObject['walletType']
  name?: string
  metadata?: Record<string, unknown>
}

export interface CreateWalletResponse {
  success: boolean
  created: boolean
  wallet: WalletObject
}

export interface GetWalletResponse {
  success: boolean
  wallet: WalletObject
}

export interface WalletEntriesResponse {
  success: boolean
  wallet: WalletObject | null
  entries: WalletHistoryEntry[]
  total: number
  limit: number
  offset: number
}

export interface WalletTopupRequest {
  walletId: string
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface WalletTopupResponse {
  success: boolean
  walletId: string | null
  ownerId: string | null
  transactionId: string | null
  balance: number | null
}

export interface WalletWithdrawRequest {
  walletId: string
  /** Amount in cents */
  amount: number
  referenceId: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface WalletWithdrawalResponse {
  success: boolean
  walletId: string | null
  ownerId: string | null
  transactionId: string | null
  balance: number | null
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

export interface ParticipantTransferResponse {
  success: boolean
  transfer: {
    transactionId: string
    fromParticipantId: string
    toParticipantId: string
    fromBalance: number
    toBalance: number
  }
}

export interface HeldFund {
  id: string
  participantId: string | null
  participantName: string | null
  amount: number
  currency: string
  heldSince: string
  daysHeld: number
  holdReason: string | null
  holdUntil: string | null
  readyForRelease: boolean
  releaseStatus: string
  transactionReference: string | null
  productName: string | null
  ventureId: string | null
  connectedAccountReady: boolean
}

export interface HeldFundsResponse {
  success: boolean
  holds: HeldFund[]
  count: number
}

export interface HeldFundsSummaryResponse {
  success: boolean
  summary: Record<string, unknown>
}

export interface ReleaseHoldResponse {
  success: boolean
  release: {
    id: string
    holdId: string
    executed: boolean
    transferId: string | null
    transferStatus: string | null
    amount: number | null
    currency: string | null
  }
}

export interface CheckoutSessionResourceResponse {
  success: boolean
  checkoutSession: {
    id: string
    mode: 'session' | 'direct' | string
    checkoutUrl: string | null
    paymentId: string | null
    paymentIntentId: string | null
    status: string | null
    requiresAction: boolean
    amount: number
    currency: string
    expiresAt: string | null
    breakdown: CheckoutBreakdown | null
  }
}

export interface PayoutResourceResponse {
  success: boolean
  payout: {
    id: string
    transactionId: string
    grossAmount: number | null
    fees: number | null
    netAmount: number | null
    previousBalance: number | null
    newBalance: number | null
  }
}

export interface RefundResourceResponse {
  success: boolean
  refund: {
    id: string
    transactionId: string | null
    referenceId: string | null
    saleReference: string | null
    refundedAmount: number | null
    currency: string | null
    status: string | null
    breakdown: {
      fromCreator: number
      fromPlatform: number
    } | null
    isFullRefund: boolean | null
    repairPending?: boolean | null
  }
  warning?: string | null
  warningCode?: string | null
}
