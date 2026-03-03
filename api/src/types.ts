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
  /** Override default platform fee percentage */
  platformFeePercent?: number
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
  /** Buyer payment method / payment instrument id (required). */
  paymentMethodId?: string
  /** Backward-compat alias for paymentMethodId. Prefer paymentMethodId. */
  sourceId?: string
  /** Unique key to prevent duplicate charges on retries. Required for direct charges, optional for session mode. */
  idempotencyKey?: string
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

// ---- Response Types ----

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

// ---- Creator & Ledger Types ----

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

export interface CreateLedgerRequest {
  /** Business name */
  businessName: string
  /** Owner email */
  ownerEmail: string
  /** Ledger mode */
  ledgerMode?: 'standard' | 'platform'
  /** Ledger settings */
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

// ---- Accounting Types ----

export interface RecordAdjustmentRequest {
  /** Type of adjustment */
  adjustmentType: 'correction' | 'reclassification' | 'accrual' | 'deferral' | 'depreciation' | 'write_off' | 'year_end' | 'opening_balance' | 'other'
  /** Journal entries (min 2, must balance) */
  entries: Array<{
    accountType: string
    entityId?: string
    entryType: 'debit' | 'credit'
    amount: number
  }>
  /** Reason for adjustment (required for audit) */
  reason: string
  /** Adjustment date (YYYY-MM-DD) */
  adjustmentDate?: string
  /** Original transaction being corrected */
  originalTransactionId?: string
  /** Supporting documentation */
  supportingDocumentation?: string
  /** Person who prepared the adjustment */
  preparedBy: string
}

export interface RecordOpeningBalanceRequest {
  /** As-of date (YYYY-MM-DD) */
  asOfDate: string
  /** Source of the opening balance */
  source: 'manual' | 'imported' | 'migrated' | 'year_start'
  /** Description of source */
  sourceDescription?: string
  /** Account balances to set */
  balances: Array<{
    accountType: string
    entityId?: string
    balance: number
  }>
}

export interface RecordTransferRequest {
  /** Source account type */
  fromAccountType: string
  /** Destination account type */
  toAccountType: string
  /** Amount in cents */
  amount: number
  /** Transfer type */
  transferType: 'tax_reserve' | 'payout_reserve' | 'owner_draw' | 'owner_contribution' | 'operating' | 'savings' | 'investment' | 'other'
  /** Transfer description */
  description?: string
  /** External reference ID */
  referenceId?: string
}

// ---- Risk & Tax Types ----

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

// ---- Additional Response Types ----

export interface RecordAdjustmentResponse {
  success: boolean
  transactionId: string
  adjustmentId: string
  entriesCreated: number
}

export interface RecordOpeningBalanceResponse {
  success: boolean
  openingBalanceId: string
  transactionId: string
  summary: {
    asOfDate: string
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    accountsSet: number
  }
}

export interface RecordTransferResponse {
  success: boolean
  transferId: string
  transactionId: string
  amount: number
  fromAccount: string
  toAccount: string
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

// ---- Config Types ----

export interface SoledgicConfig {
  /** Your Soledgic API key */
  apiKey: string
  /** Base URL for Supabase functions (optional) */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Custom fetch implementation (for testing) */
  fetch?: typeof fetch
}

// ---- Error Types ----

export class SoledgicError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
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
