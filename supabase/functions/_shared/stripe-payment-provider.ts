// SERVICE_ID: SVC_STRIPE_PAYMENT_PROVIDER
// Soledgic: Stripe implementation of PaymentProvider interface
// Uses stripe-rest.ts for all API calls (no SDK).

import { stripeRequest } from './stripe-rest.ts'
import type {
  PaymentProvider,
  PaymentProviderName,
  PaymentIntentParams,
  PaymentIntentResult,
  CaptureResult,
  RefundParams,
  RefundResult,
  PaymentStatus,
} from './payment-provider-types.ts'

const PROVIDER_NAME: PaymentProviderName = 'card'

function mapStripeStatus(status: string | undefined): string {
  switch (status) {
    case 'succeeded':
    case 'paid':
      return 'succeeded'
    case 'canceled':
    case 'cancelled':
      return 'failed'
    case 'processing':
    case 'pending':
      return 'processing'
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':
      return 'pending'
    default:
      return 'pending'
  }
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly livemode: boolean | undefined

  constructor(livemode?: boolean) {
    this.livemode = livemode
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    // Detect charge vs payout flow by presence of destination_id.
    // Charge → POST /v1/payment_intents (or /v1/charges for simple flows)
    // Payout/CREDIT → POST /v1/transfers (Stripe Connect)
    if (params.destination_id) {
      return this.createTransfer(params)
    }

    if (!params.payment_method_id) {
      return { success: false, provider: PROVIDER_NAME, error: 'payment_method_id is required for charge flows' }
    }

    const stripeParams: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      payment_method: params.payment_method_id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    }

    if (params.description) stripeParams.description = params.description
    if (params.receipt_email) stripeParams.receipt_email = params.receipt_email

    if (params.metadata && Object.keys(params.metadata).length > 0) {
      stripeParams.metadata = params.metadata
    }

    const resp = await stripeRequest<Record<string, unknown>>('/v1/payment_intents', {
      method: 'POST',
      params: stripeParams,
      idempotencyKey: params.idempotency_id,
      livemode: this.livemode,
    })

    if (!resp.ok || !resp.data) {
      return {
        success: false,
        provider: PROVIDER_NAME,
        error: resp.error?.message || 'Stripe payment intent creation failed',
      }
    }

    const data = resp.data
    const requiresAction = data.status === 'requires_action'

    return {
      success: true,
      provider: PROVIDER_NAME,
      id: String(data.id || ''),
      client_secret: typeof data.client_secret === 'string' ? data.client_secret : undefined,
      status: mapStripeStatus(String(data.status || '')),
      requires_action: requiresAction,
      redirect_url: requiresAction
        ? (data.next_action as Record<string, unknown>)?.redirect_to_url as string | undefined
        : undefined,
      raw: data,
    }
  }

  private async createTransfer(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    const stripeParams: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      destination: params.destination_id,
    }

    if (params.description) stripeParams.description = params.description

    if (params.metadata && Object.keys(params.metadata).length > 0) {
      stripeParams.metadata = params.metadata
    }

    const resp = await stripeRequest<Record<string, unknown>>('/v1/transfers', {
      method: 'POST',
      params: stripeParams,
      idempotencyKey: params.idempotency_id,
      livemode: this.livemode,
    })

    if (!resp.ok || !resp.data) {
      return {
        success: false,
        provider: PROVIDER_NAME,
        error: resp.error?.message || 'Stripe transfer creation failed',
      }
    }

    const data = resp.data
    return {
      success: true,
      provider: PROVIDER_NAME,
      id: String(data.id || ''),
      status: mapStripeStatus(String(data.status || 'pending')),
      requires_action: false,
      raw: data,
    }
  }

  async capturePayment(paymentIntentId: string): Promise<CaptureResult> {
    const resp = await stripeRequest<Record<string, unknown>>(
      `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/capture`,
      { method: 'POST', livemode: this.livemode }
    )

    if (!resp.ok || !resp.data) {
      return {
        success: false,
        provider: PROVIDER_NAME,
        error: resp.error?.message || 'Stripe capture failed',
      }
    }

    const data = resp.data
    return {
      success: true,
      provider: PROVIDER_NAME,
      id: String(data.id || ''),
      amount_captured: typeof data.amount_received === 'number' ? data.amount_received : undefined,
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const stripeParams: Record<string, unknown> = {
      payment_intent: params.payment_intent_id,
    }

    if (typeof params.amount === 'number' && Number.isFinite(params.amount) && params.amount > 0) {
      stripeParams.amount = Math.round(params.amount)
    }

    if (params.reason) stripeParams.reason = params.reason

    if (params.metadata && Object.keys(params.metadata).length > 0) {
      stripeParams.metadata = params.metadata
    }

    const resp = await stripeRequest<Record<string, unknown>>('/v1/refunds', {
      method: 'POST',
      params: stripeParams,
      idempotencyKey: params.idempotency_id,
      livemode: this.livemode,
    })

    if (!resp.ok || !resp.data) {
      return {
        success: false,
        provider: PROVIDER_NAME,
        error: resp.error?.message || 'Stripe refund failed',
      }
    }

    const data = resp.data
    return {
      success: true,
      provider: PROVIDER_NAME,
      refund_id: String(data.id || ''),
      amount: typeof data.amount === 'number' ? data.amount : params.amount,
      status: mapStripeStatus(String(data.status || '')),
    }
  }

  async getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
    // Try payment_intent first, fall back to transfer
    const resp = await stripeRequest<Record<string, unknown>>(
      `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { livemode: this.livemode }
    )

    if (resp.ok && resp.data) {
      const data = resp.data
      return {
        success: true,
        provider: PROVIDER_NAME,
        id: String(data.id || ''),
        status: mapStripeStatus(String(data.status || '')),
        amount: typeof data.amount === 'number' ? data.amount : undefined,
        currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
      }
    }

    // If payment_intent lookup fails with 404, try transfers
    if (resp.status === 404 || paymentIntentId.startsWith('tr_')) {
      const transferResp = await stripeRequest<Record<string, unknown>>(
        `/v1/transfers/${encodeURIComponent(paymentIntentId)}`,
        { livemode: this.livemode }
      )

      if (transferResp.ok && transferResp.data) {
        const data = transferResp.data
        return {
          success: true,
          provider: PROVIDER_NAME,
          id: String(data.id || ''),
          status: 'succeeded', // Stripe transfers are immediate
          amount: typeof data.amount === 'number' ? data.amount : undefined,
          currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
        }
      }
    }

    return {
      success: false,
      provider: PROVIDER_NAME,
      error: resp.error?.message || 'Stripe status lookup failed',
    }
  }
}
