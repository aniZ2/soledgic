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
  /** Reference type (e.g., 'stripe_payment', 'manual') */
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
  captureMethod?: 'automatic' | 'manual'
  setupFutureUsage?: 'off_session' | 'on_session'
  paymentProvider?: 'card' | 'stripe'
  paymentMethodId?: string
  sourceId?: string
  merchantId?: string
  metadata?: Record<string, string>
}

export interface ProcessPayoutRequest {
  /** Creator to pay */
  creatorId: string
  /** Payment method */
  paymentMethod: 'card' | 'manual'
  /** Amount in cents (optional - defaults to full balance) */
  amount?: number
  /** External payment reference (payout ID, transfer ID, etc.) */
  paymentReference?: string
  /** Payout description */
  description?: string
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
  total: number
  creatorAmount: number
  platformAmount: number
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
  provider?: 'card' | 'stripe'
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
