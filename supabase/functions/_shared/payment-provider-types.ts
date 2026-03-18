// Soledgic: Payment Provider Types
// Extracted from payment-provider.ts so services that only need types
// don't pull in the full Stripe/Finix implementation.

export type PaymentProviderName = 'card'

export type PaymentProviderBackend = 'stripe' | 'finix'

export interface PaymentIntentParams {
  amount: number
  currency: string
  metadata: Record<string, string>
  description?: string
  receipt_email?: string
  payment_method_id?: string
  destination_id?: string
  idempotency_id?: string
  operation_key?: string
  processor?: string
}

export interface PaymentIntentResult {
  success: boolean
  provider: PaymentProviderName
  id?: string
  client_secret?: string
  status?: string
  requires_action?: boolean
  redirect_url?: string
  error?: string
  raw?: Record<string, unknown>
}

export interface CaptureResult {
  success: boolean
  provider: PaymentProviderName
  id?: string
  amount_captured?: number
  error?: string
}

export interface RefundParams {
  payment_intent_id: string
  amount?: number
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  metadata?: Record<string, string>
  idempotency_id?: string
}

export interface RefundResult {
  success: boolean
  provider: PaymentProviderName
  refund_id?: string
  amount?: number
  status?: string
  error?: string
}

export interface PaymentStatus {
  success: boolean
  provider: PaymentProviderName
  id?: string
  status?: string
  amount?: number
  currency?: string
  error?: string
}

export interface ProcessorProviderConfig {
  merchantId?: string | null
  username?: string | null
  password?: string | null
  apiVersion?: string | null
  versionHeader?: string | null
  environment?: string | null
  baseUrl?: string | null
  transfersPath?: string | null
  refundsPathTemplate?: string | null
}

export interface PaymentProviderFactoryOptions {
  processor?: ProcessorProviderConfig
  livemode?: boolean
}

export interface PaymentProvider {
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult>
  capturePayment(paymentIntentId: string): Promise<CaptureResult>
  refund(params: RefundParams): Promise<RefundResult>
  getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus>
}
