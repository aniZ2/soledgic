// ============================================================================
// Soledgic SDK Types
// ============================================================================

// ---- Request Types ----

export interface RecordSaleRequest {
  /** Your external sale ID (order ID, payment ID, etc.) */
  referenceId: string
  /** The creator receiving funds */
  creatorId: string
  /** Sale amount in cents */
  amount: number
  /** Currency code (default: USD) */
  currency?: string
  /** Sale description */
  description?: string
  /** Reference type (e.g., 'processor_payment', 'manual') */
  referenceType?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface CreateCheckoutRequest {
  amount: number
  creatorId: string
  currency?: string
  productId?: string
  productName?: string
  customerEmail?: string
  customerId?: string
  /** Buyer payment method / payment instrument id. When provided, performs a direct charge.
   *  When omitted, creates a hosted checkout session (requires successUrl). */
  paymentMethodId?: string
  /** Backward-compat alias for paymentMethodId. Prefer paymentMethodId. */
  sourceId?: string
  /** Unique key to prevent duplicate charges on retries. Required for direct charges, optional for session mode. */
  idempotencyKey?: string
  /** Where to redirect after successful payment (required for session mode). */
  successUrl?: string
  /** Where to redirect if buyer cancels (session mode). */
  cancelUrl?: string
  metadata?: Record<string, string>
}

export interface ProcessPayoutRequest {
  /** Unique reference ID for this payout (required) */
  referenceId: string
  /** Creator to pay */
  creatorId: string
  /** Amount in cents (required) */
  amount: number
  /** Reference type (e.g., 'manual') */
  referenceType?: string
  /** Payout description */
  description?: string
  /** Payout method */
  payoutMethod?: string
  /** Fees in cents */
  fees?: number
  /** Who pays the fees */
  feesPaidBy?: 'platform' | 'creator'
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface ExecutePayoutRequest {
  /** Payout transaction ID returned by processPayout() */
  payoutId: string
  /** Payment rail to use */
  rail?: 'card' | 'wise' | 'manual' | 'crypto'
  /** Rail-specific configuration */
  railConfig?: Record<string, unknown>
}

export interface BatchExecutePayoutRequest {
  /** Array of payout transaction IDs */
  payoutIds: string[]
  /** Payment rail to use */
  rail?: 'card' | 'wise' | 'manual' | 'crypto'
}

export interface RecordRefundRequest {
  /** Reference ID of the original sale */
  originalSaleReference: string
  /** Refund reason (required for audit) */
  reason: string
  /** Amount in cents (optional - defaults to full sale amount) */
  amount?: number
  /** Who absorbs the refund cost */
  refundFrom?: 'both' | 'platform_only' | 'creator_only'
  /** External refund ID (refund ID, transaction ID, etc.) */
  externalRefundId?: string
  /** Idempotency key for processor refund */
  idempotencyKey?: string
  /** Refund mode: 'ledger_only' records without processor settlement,
   *  'processor_refund' records and instructs processor to return funds. Default: 'ledger_only'. */
  mode?: 'ledger_only' | 'processor_refund'
  /** @deprecated Use mode: 'processor_refund' instead */
  executeProcessorRefund?: boolean
  /** Processor payment ID to refund */
  processorPaymentId?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface ReverseTransactionRequest {
  /** Transaction UUID to reverse */
  transactionId: string
  /** Reason for reversal (required for audit) */
  reason: string
  /** Partial reversal amount in cents */
  partialAmount?: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface GetTransactionsRequest {
  /** Filter by creator */
  creatorId?: string
  /** Filter by transaction type */
  type?: 'sale' | 'payout' | 'refund' | 'reversal' | 'fee' | 'adjustment' | 'transfer'
  /** Filter by status */
  status?: 'pending' | 'completed' | 'failed' | 'reversed'
  /** Start date (ISO string) */
  startDate?: string
  /** End date (ISO string) */
  endDate?: string
  /** Page number */
  page?: number
  /** Results per page (max 100) */
  perPage?: number
  /** Include entry details */
  includeEntries?: boolean
}

// ---- Creator Types ----

export interface CreateCreatorRequest {
  /** Unique creator identifier */
  creatorId: string
  /** Display name */
  displayName?: string
  /** Email address */
  email?: string
  /** Default revenue split percentage (0-100) */
  defaultSplitPercent?: number
  /** Tax information */
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
  /** Payout preferences */
  payoutPreferences?: {
    schedule?: 'manual' | 'weekly' | 'biweekly' | 'monthly'
    minimumAmount?: number
    method?: 'card' | 'manual'
  }
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

// ---- Report Types ----

export interface ExportReportRequest {
  /** Report type */
  reportType: 'transaction_detail' | 'creator_earnings' | 'platform_revenue' | 'payout_summary' | 'reconciliation' | 'audit_log'
  /** Export format */
  format: 'csv' | 'json'
  /** Start date (YYYY-MM-DD) */
  startDate?: string
  /** End date (YYYY-MM-DD) */
  endDate?: string
  /** Filter by creator */
  creatorId?: string
}

export interface GenerateReportRequest {
  /** Report type */
  reportType: 'profit_loss' | 'trial_balance' | 'general_ledger' | '1099_summary'
  /** Start date (YYYY-MM-DD) */
  startDate?: string
  /** End date (YYYY-MM-DD) */
  endDate?: string
  /** Filter by creator */
  creatorId?: string
  /** Output format */
  format?: 'json' | 'csv'
}

export interface GeneratePdfRequest {
  /** Report type */
  reportType: 'creator_statement' | 'profit_loss' | 'balance_sheet' | '1099' | 'reconciliation'
  /** Period ID for frozen statements */
  periodId?: string
  /** Creator ID */
  creatorId?: string
  /** Start date (YYYY-MM-DD) */
  startDate?: string
  /** End date (YYYY-MM-DD) */
  endDate?: string
  /** Tax year */
  taxYear?: number
}

// ---- Tax Types ----

export interface GenerateTaxSummaryRequest {
  /** Tax year */
  taxYear: number
  /** Filter by creator */
  creatorId?: string
}

// ---- Webhook Types ----

export interface CreateWebhookEndpointRequest {
  /** Webhook URL */
  url: string
  /** Events to subscribe to */
  events: string[]
  /** Optional description */
  description?: string
}

// ---- Split Configuration Types ----

export interface ManageSplitsRequest {
  /** Action to perform */
  action: 'get' | 'set_default' | 'set_creator' | 'set_product' | 'set_tiers' | 'list_creators'
  /** Creator ID (for set_creator) */
  creatorId?: string
  /** Creator's revenue split percentage (0-100) */
  creatorPercent?: number
  /** Product ID (for set_product) */
  productId?: string
  /** Tiered pricing rules (for set_tiers) */
  tiers?: Array<{
    minAmount: number
    maxAmount?: number
    creatorPercent: number
  }>
}

// ---- Risk Types ----

export interface RiskEvaluationRequest {
  /** Idempotency key for caching */
  idempotencyKey: string
  /** Amount in cents */
  amount: number
  /** Currency code */
  currency?: string
  /** Counterparty name */
  counterpartyName?: string
  /** Authorizing instrument UUID */
  authorizingInstrumentId?: string
  /** Expected date (YYYY-MM-DD) */
  expectedDate?: string
  /** Expense category */
  category?: string
}

// ---- Receipt Types ----

export interface UploadReceiptRequest {
  /** File URL (must be Supabase storage) */
  fileUrl: string
  /** File name */
  fileName?: string
  /** File size in bytes (max 50MB) */
  fileSize?: number
  /** MIME type */
  mimeType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'
  /** Merchant name */
  merchantName?: string
  /** Transaction date (YYYY-MM-DD) */
  transactionDate?: string
  /** Total amount in cents */
  totalAmount?: number
  /** Link to existing transaction */
  transactionId?: string
}

// ---- Invoice Types ----

export interface CreateInvoiceRequest {
  /** Customer ID */
  customerId?: string
  /** Customer name */
  customerName?: string
  /** Customer email */
  customerEmail?: string
  /** Invoice amount in cents */
  amount: number
  /** Line items */
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>
  /** Due date (YYYY-MM-DD) */
  dueDate?: string
  /** Invoice notes */
  notes?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

// ---- Payment Receipt Types ----

export interface ReceivePaymentRequest {
  /** Amount in cents */
  amount: number
  /** Invoice transaction to apply payment to */
  invoiceTransactionId?: string
  /** Customer name */
  customerName?: string
  /** Customer ID */
  customerId?: string
  /** External reference ID */
  referenceId?: string
  /** Payment method used */
  paymentMethod?: string
  /** Payment date (YYYY-MM-DD) */
  paymentDate?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Response Types
// ============================================================================

export interface SaleBreakdown {
  /** Gross sale amount in major currency units (e.g. dollars). */
  total: number
  /** Creator share in major currency units (e.g. dollars). */
  creatorAmount: number
  /** Platform share in major currency units (e.g. dollars). */
  platformAmount: number
  /** Processing fee in major currency units (e.g. dollars). */
  processingFee?: number
}

export interface RecordSaleResponse {
  success: boolean
  transactionId?: string
  breakdown?: SaleBreakdown
  error?: string
}

export interface CheckoutBreakdown {
  grossAmount: number
  creatorAmount: number
  platformAmount: number
  creatorPercent: number
}

export interface CreateCheckoutResponse {
  success: boolean
  provider?: 'card'
  paymentId?: string
  paymentIntentId?: string
  clientSecret?: string | null
  checkoutUrl?: string | null
  status?: string | null
  requiresAction?: boolean
  amount?: number
  currency?: string
  breakdown?: CheckoutBreakdown
  /** Session mode fields — present when paymentMethodId was omitted */
  mode?: 'direct' | 'session'
  sessionId?: string
  expiresAt?: string
  error?: string
}

export interface CreatorBalance {
  creatorId: string
  available: number
  pending: number
  totalEarned: number
  totalPaidOut: number
  currency: string
}

export interface CreatorBalanceSummary {
  creatorId: string
  available: number
  pending: number
  currency: string
}

export interface PlatformSummary {
  totalRevenue: number
  totalOwedCreators: number
  totalPaidOut: number
  cashBalance: number
}

export interface GetBalanceResponse {
  success: boolean
  balance?: CreatorBalance
  balances?: CreatorBalanceSummary[]
  platformSummary?: PlatformSummary
  error?: string
}

export interface ProcessPayoutResponse {
  success: boolean
  payoutId?: string
  transactionId?: string
  amount?: number
  status?: string
  error?: string
}

export interface ExecutePayoutResponse {
  success: boolean
  payoutId?: string
  status?: string
  executionDetails?: Record<string, unknown>
  error?: string
}

export interface BatchExecutePayoutResponse {
  success: boolean
  results?: Array<{
    payoutId: string
    status: string
    error?: string
  }>
  error?: string
}

export interface PayoutStatusResponse {
  success: boolean
  payoutId?: string
  status?: string
  executionDetails?: Record<string, unknown>
  error?: string
}

export interface CheckPayoutEligibilityResponse {
  success: boolean
  eligible?: boolean
  holds?: Array<{ reason: string; amount?: number }>
  minimumBalance?: number
  reason?: string
  error?: string
}

export interface RefundBreakdown {
  fromCreator: number
  fromPlatform: number
}

export interface RecordRefundResponse {
  success: boolean
  transactionId?: string
  refundedAmount?: number
  breakdown?: RefundBreakdown
  error?: string
}

export interface ReverseTransactionResponse {
  success: boolean
  reversalId?: string
  originalTransactionId?: string
  reversedAmount?: number
  error?: string
}

export interface TransactionEntry {
  id: string
  accountId: string
  entryType: 'debit' | 'credit'
  amount: number
  account?: {
    accountType: string
    entityId: string | null
    name: string
  }
}

export interface Transaction {
  id: string
  transactionType: string
  referenceId: string | null
  referenceType: string | null
  description: string | null
  amount: number
  currency: string
  status: string
  metadata: Record<string, unknown>
  createdAt: string
  entries?: TransactionEntry[]
}

export interface Pagination {
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface GetTransactionsResponse {
  success: boolean
  transactions?: Transaction[]
  pagination?: Pagination
  error?: string
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

export interface DeleteCreatorResponse {
  success: boolean
  message?: string
  error?: string
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

export interface GenerateReportResponse {
  success: boolean
  reportData?: Record<string, unknown>
  error?: string
}

export interface GeneratePdfResponse {
  success: boolean
  pdfUrl?: string
  reportId?: string
  error?: string
}

export interface BalanceSheetResponse {
  success: boolean
  asOfDate?: string
  assets?: {
    currentAssets: Record<string, number>
    fixedAssets?: Record<string, number>
    totalAssets: number
  }
  liabilities?: {
    currentLiabilities: Record<string, number>
    totalLiabilities: number
  }
  equity?: {
    retainedEarnings: number
    totalEquity: number
  }
  error?: string
}

export interface ProfitLossResponse {
  success: boolean
  period?: { startDate: string; endDate: string }
  revenue?: Record<string, number>
  expenses?: Record<string, number>
  totalRevenue?: number
  totalExpenses?: number
  netIncome?: number
  monthlyData?: Array<{
    month: string
    revenue: number
    expenses: number
    netIncome: number
  }>
  error?: string
}

export interface TrialBalanceResponse {
  success: boolean
  accounts?: Array<{
    accountType: string
    name: string
    debitBalance: number
    creditBalance: number
  }>
  totals?: {
    debits: number
    credits: number
    difference: number
    isBalanced: boolean
  }
  error?: string
}

export interface AgingBucket {
  range: string
  amount: number
  count: number
}

export interface ApAgingResponse {
  success: boolean
  agingBuckets?: AgingBucket[]
  totalOutstanding?: number
  error?: string
}

export interface ArAgingResponse {
  success: boolean
  agingBuckets?: AgingBucket[]
  totalOutstanding?: number
  error?: string
}

export interface GetRunwayResponse {
  success: boolean
  runwayMonths?: number
  cashPosition?: number
  burnRate?: number
  healthScore?: number
  error?: string
}

export interface GenerateTaxSummaryResponse {
  success: boolean
  taxYear?: number
  note?: string
  summaries?: Array<{
    participantId: string
    linkedUserId?: string | null
    grossEarnings: number
    netEarnings: number
    totalPaidOut: number
    refundsIssued: number
    requires1099?: boolean
  }>
  totals?: {
    totalGross: number
    totalRefunds: number
    totalNet: number
    totalPaid: number
    participantsRequiring1099: number
  }
  error?: string
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

export interface WebhookEndpointResponse {
  success: boolean
  endpointId?: string
  secret?: string
  error?: string
}

export interface ListWebhookEndpointsResponse {
  success: boolean
  endpoints?: Array<{
    id: string
    url: string
    events: string[]
    status: string
    createdAt: string
  }>
  error?: string
}

export interface ManageSplitsResponse {
  success: boolean
  effectiveSplit?: { creatorPercent: number; platformPercent: number }
  tiers?: Array<{ minAmount: number; maxAmount?: number; creatorPercent: number }>
  creators?: Array<{ creatorId: string; creatorPercent: number }>
  error?: string
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

export interface InvoiceResponse {
  success: boolean
  invoiceId?: string
  status?: string
  total?: number
  error?: string
}

export interface ListInvoicesResponse {
  success: boolean
  invoices?: Array<{
    id: string
    customerId: string | null
    customerName: string | null
    amount: number
    status: string
    dueDate: string | null
    createdAt: string
  }>
  error?: string
}

export interface ReceivePaymentResponse {
  success: boolean
  transactionId: string
  amount: number
}

// ============================================================================
// Config Types
// ============================================================================

export interface SoledgicConfig {
  /** Your Soledgic API key */
  apiKey: string
  /** Base URL for Supabase functions */
  baseUrl: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** API version header to pin requests against (default: 2026-03-01) */
  apiVersion?: string
  /** Custom fetch implementation (for testing) */
  fetch?: typeof fetch
}

// ============================================================================
// Error Types
// ============================================================================

export class SoledgicError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'SoledgicError'
  }
}

export class ValidationError extends SoledgicError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends SoledgicError {
  constructor(message: string = 'Invalid API key') {
    super(message, 401, 'AUTHENTICATION_ERROR')
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends SoledgicError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends SoledgicError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
    this.name = 'ConflictError'
  }
}
