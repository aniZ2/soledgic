// Soledgic SDK - Double-Entry Accounting for Creator Platforms
// https://soledgic.com

export { Soledgic } from './client'

export {
  // Config
  SoledgicConfig,
  
  // Request types
  RecordSaleRequest,
  ProcessPayoutRequest,
  RecordRefundRequest,
  ReverseTransactionRequest,
  GetTransactionsRequest,
  
  // Response types
  RecordSaleResponse,
  GetBalanceResponse,
  ProcessPayoutResponse,
  RecordRefundResponse,
  ReverseTransactionResponse,
  GetTransactionsResponse,
  
  // Data types
  SaleBreakdown,
  CreatorBalance,
  CreatorBalanceSummary,
  PlatformSummary,
  RefundBreakdown,
  Transaction,
  TransactionEntry,
  Pagination,
  
  // Errors
  SoledgicError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
} from './types'

// Default export for convenience
export { Soledgic as default } from './client'
