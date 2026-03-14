/**
 * TypeScript type definitions for Soledgic frontend API calls.
 *
 * These mirror the request/response shapes used by the backend edge functions
 * and provide compile-time safety for dashboard pages.
 */

// =============================================================================
// Common
// =============================================================================

/** Generic API response wrapper returned by most edge functions. */
export interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  error_code?: string
  data?: T
  message?: string
}

/** Error-specific response fields that some endpoints return inline. */
export interface ApiErrorFields {
  error?: string
  error_code?: string
  transaction_id?: string | null
  idempotent?: boolean
}

// =============================================================================
// Refunds
// =============================================================================

/** Request body sent by record-refund-modal to the `refunds` endpoint. */
export interface RefundRequest {
  sale_reference: string
  amount: number | null
  reason: string
  refund_from: 'both' | 'platform_only' | 'creator_only'
  idempotency_key: string
  mode: 'ledger_only' | 'processor_refund'
  processor_payment_id?: string
  metadata?: Record<string, unknown>
}

/** Successful response from the `refunds` endpoint. */
export interface RefundResponse {
  success: boolean
  error?: string
  error_code?: string
  transaction_id?: string
  idempotent?: boolean
  refund?: {
    id: string
    transaction_id: string
    refunded_amount: number
    breakdown: {
      from_creator: number
      from_platform: number
    }
    is_full_refund: boolean
  }
}

/** Single refund item in a list-refunds response. */
export interface RefundListItem {
  id: string
  transaction_id: string | null
  reference_id: string | null
  sale_reference: string | null
  refunded_amount: number
  currency: string
  status: string
  reason: string | null
  refund_from: string | null
  external_refund_id: string | null
  created_at: string | null
  breakdown: {
    from_creator: number
    from_platform: number
  } | null
  repair_pending?: boolean
  last_error?: string | null
}

// =============================================================================
// Reversals
// =============================================================================

/** Request body sent by reverse-transaction-modal. */
export interface ReversalRequest {
  transaction_id: string
  reason: string
  partial_amount?: number
  idempotency_key: string
  metadata?: Record<string, unknown>
}

/** Successful response from the `reverse-transaction` endpoint. */
export interface ReversalResponse {
  success: boolean
  error?: string
  error_code?: string
  void_type: 'soft_delete' | 'reversing_entry'
  message: string
  reversal_id: string | null
  original_transaction_id?: string
  transaction_id?: string
  reversed_amount?: number
  is_partial?: boolean
  reversed_at?: string
  voided_at?: string
  warning?: string
  idempotent?: boolean
  period?: {
    start: string
    end: string
    status: string
  }
}

// =============================================================================
// Tax (1099 reporting)
// =============================================================================

/** A tax document as returned by the 1099 page query. */
export interface TaxDocument {
  id: string
  document_type: string
  tax_year: number
  recipient_id: string
  recipient_type: string
  gross_amount: number
  transaction_count: number
  monthly_amounts: Record<string, number>
  status: 'calculated' | 'exported' | 'filed' | 'superseded'
  created_at: string
  exported_at: string | null
  pdf_path: string | null
  pdf_generated_at: string | null
  copy_type: string | null
  metadata: Record<string, unknown> | null
}

/** Aggregated stats shown at the top of the 1099 page. */
export interface TaxSummary {
  total: number
  calculated: number
  exported: number
  filed: number
  total_amount: number
}

/** Response from tax/documents/generate. */
export interface TaxGenerateResponse extends ApiResponse {
  generation?: {
    created: number
    skipped: number
  }
}

/** Response from tax/documents/{id}/pdf. */
export interface TaxPdfResponse extends ApiResponse {
  data?: {
    download_url: string
  }
}

/** Response from tax/documents/pdf/batch. */
export interface TaxBatchPdfResponse extends ApiResponse {
  data?: {
    generated: number
    failed: number
  }
}

/** Response from tax/documents/deliver-copy-b. */
export interface TaxDeliverCopyBResponse extends ApiResponse {
  delivery?: {
    sent: number
    failed: number
    skipped: number
  }
}

/** Tax correction — adjusts a previously generated document. */
export interface TaxCorrection {
  id: string
  corrects_document_id: string
  corrected_gross_amount: number
  reason: string
  created_at: string
}

// =============================================================================
// Invoices
// =============================================================================

export interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export interface Invoice {
  id: string
  invoice_number: string
  customer_name: string
  customer_email: string | null
  line_items: InvoiceLineItem[]
  subtotal: number
  total_amount: number
  amount_paid: number
  amount_due: number
  currency: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'voided'
  issue_date: string
  due_date: string
  notes: string | null
  created_at: string
}

export interface InvoiceDetail extends Invoice {
  payments?: InvoicePayment[]
}

export interface InvoicePayment {
  id: string
  amount: number
  payment_method: string | null
  payment_date: string
  reference_id: string | null
  notes: string | null
}

/** Request body for creating an invoice. */
export interface CreateInvoiceRequest {
  customer_name: string
  customer_email?: string
  due_date?: string
  notes?: string
  line_items: Array<{
    description: string
    quantity: number
    unit_price: number
  }>
}

/** Response from creating an invoice. */
export interface CreateInvoiceResponse extends ApiResponse {
  data?: {
    invoice_number: string
    id: string
  }
}

/** Request body for recording an invoice payment. */
export interface RecordPaymentRequest {
  amount: number
  payment_method?: string
  reference_id?: string
  notes?: string
}

/** Response from recording an invoice payment. */
export interface RecordPaymentResponse extends ApiResponse {
  message?: string
}

/** Response from listing invoices. */
export interface ListInvoicesResponse extends ApiResponse {
  data?: Invoice[]
}

// =============================================================================
// Participants (creators)
// =============================================================================

export interface Participant {
  id: string
  entity_id: string
  name: string
  balance: number
  metadata?: {
    email?: string
  }
}

export interface ParticipantDetail {
  id: string
  entity_id: string
  name: string
  created_at: string
  metadata: Record<string, unknown> | null
}

export interface ParticipantStats {
  totalEarnings: number
  totalPayouts: number
  totalWithheld: number
  currentBalance: number
  availableBalance: number
}

export interface TaxInfo {
  id: string
  legal_name: string
  tax_id_type: string
  tax_id_last4: string
  business_type: string
  certified_at: string | null
  address_line1: string | null
  address_city: string | null
  address_state: string | null
  address_postal_code: string | null
}

export interface TaxCalculation {
  participant_id: string
  tax_year: number
  gross_payments: number
  transaction_count: number
  requires_1099: boolean
  monthly_totals: Record<string, number>
  threshold: number
  linked_user_id: string | null
  shared_tax_profile: {
    status: string
    legal_name: string | null
    tax_id_last4: string | null
  } | null
}

// =============================================================================
// Holds
// =============================================================================

export interface HeldFund {
  entry_id: string
  hold_reason: string | null
  held_amount: number
  release_eligible_at: string | null
  release_status: 'held' | 'pending_release'
}

export interface HoldsSummary {
  total_held: number
  hold_count: number
  holds: HeldFund[]
}

// =============================================================================
// Compliance
// =============================================================================

export interface ComplianceOverview {
  window_days: number
  access_window_hours: number
  total_events: number
  unique_ips: number
  unique_actors: number
  high_risk_events: number
  critical_risk_events: number
  failed_auth_events: number
  payouts_failed: number
  refunds_recorded: number
  dispute_events: number
}

export interface AccessPattern {
  ip_address: string
  hour: string
  request_count: number
  unique_actions: number
  actions: string[]
  max_risk_score: number
  failed_auths: number
}

export interface SecuritySummaryEntry {
  date: string
  action: string
  event_count: number
  unique_ips: number
  unique_actors: number
  avg_risk_score: number
  max_risk_score: number
  high_risk_count: number
  critical_risk_count: number
}

export interface ComplianceOverviewResponse extends ApiResponse {
  overview?: ComplianceOverview
}

export interface AccessPatternsResponse extends ApiResponse {
  patterns?: AccessPattern[]
}

export interface SecuritySummaryResponse extends ApiResponse {
  summary?: SecuritySummaryEntry[]
}
