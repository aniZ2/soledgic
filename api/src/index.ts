// Soledgic legacy compatibility client
// https://soledgic.com

export { Soledgic } from './client'

export {
  // Config
  SoledgicConfig,

  // Request types — Payments
  CreateCheckoutRequest,
  RecordSaleRequest,
  ProcessPayoutRequest,
  ExecutePayoutRequest,
  BatchExecutePayoutRequest,
  RecordRefundRequest,
  ReverseTransactionRequest,

  // Request types — Queries
  GetTransactionsRequest,

  // Request types — Creators
  CreateCreatorRequest,

  // Request types — Reports
  ExportReportRequest,
  GenerateReportRequest,
  GeneratePdfRequest,

  // Request types — Tax
  GenerateTaxSummaryRequest,

  // Request types — Risk
  RiskEvaluationRequest,

  // Request types — Webhooks
  CreateWebhookEndpointRequest,

  // Request types — Splits
  ManageSplitsRequest,

  // Request types — Invoices
  CreateInvoiceRequest,
  ReceivePaymentRequest,

  // Request types — Receipts
  UploadReceiptRequest,

  // Response types — Payments
  CreateCheckoutResponse,
  RecordSaleResponse,
  ProcessPayoutResponse,
  ExecutePayoutResponse,
  BatchExecutePayoutResponse,
  PayoutStatusResponse,
  CheckPayoutEligibilityResponse,
  RecordRefundResponse,
  ReverseTransactionResponse,

  // Response types — Balances
  GetBalanceResponse,

  // Response types — Transactions
  GetTransactionsResponse,

  // Response types — Creators
  CreateCreatorResponse,
  DeleteCreatorResponse,

  // Response types — Reports
  ExportReportJsonResponse,
  ExportReportCsvResponse,
  GenerateReportResponse,
  GeneratePdfResponse,
  BalanceSheetResponse,
  ProfitLossResponse,
  TrialBalanceResponse,
  ApAgingResponse,
  ArAgingResponse,
  GetRunwayResponse,

  // Response types — Tax
  GenerateTaxSummaryResponse,

  // Response types — Risk
  RiskEvaluationResponse,

  // Response types — Webhooks
  WebhookEndpointResponse,
  ListWebhookEndpointsResponse,

  // Response types — Splits
  ManageSplitsResponse,

  // Response types — Invoices
  InvoiceResponse,
  ListInvoicesResponse,
  ReceivePaymentResponse,

  // Response types — Receipts
  UploadReceiptResponse,

  // Data types
  CheckoutBreakdown,
  SaleBreakdown,
  CreatorBalance,
  CreatorBalanceSummary,
  PlatformSummary,
  RefundBreakdown,
  Transaction,
  TransactionEntry,
  Pagination,
  AgingBucket,

  // Errors
  SoledgicError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
} from './types'

// Default export for convenience
export { Soledgic as default } from './client'
