// Soledgic: Payment Provider Abstraction
// Shared interface for charge-side payment operations
// Currently supports Stripe; designed for future provider extensibility

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentIntentParams {
  amount: number                          // In smallest currency unit (cents)
  currency: string                        // ISO currency code
  metadata: Record<string, string>
  description?: string
  receipt_email?: string
  capture_method?: 'automatic' | 'manual'
  setup_future_usage?: 'off_session' | 'on_session'
}

export interface PaymentIntentResult {
  success: boolean
  id?: string
  client_secret?: string
  status?: string
  error?: string
}

export interface CaptureResult {
  success: boolean
  id?: string
  amount_captured?: number
  error?: string
}

export interface RefundParams {
  payment_intent_id: string
  amount?: number                         // Partial refund amount in cents; omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  metadata?: Record<string, string>
}

export interface RefundResult {
  success: boolean
  refund_id?: string
  amount?: number
  status?: string
  error?: string
}

export interface PaymentStatus {
  success: boolean
  id?: string
  status?: string
  amount?: number
  currency?: string
  error?: string
}

// ============================================================================
// INTERFACE
// ============================================================================

export interface PaymentProvider {
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult>
  capturePayment(paymentIntentId: string): Promise<CaptureResult>
  refund(params: RefundParams): Promise<RefundResult>
  getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus>
}

// ============================================================================
// STRIPE IMPLEMENTATION
// ============================================================================

export class StripePaymentProvider implements PaymentProvider {
  private apiKey: string
  private apiVersion = '2023-10-16'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async stripeRequest(
    path: string,
    method: 'GET' | 'POST' = 'POST',
    body?: URLSearchParams
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Stripe-Version': this.apiVersion,
        },
      }

      if (body) {
        options.headers = {
          ...options.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
        options.body = body.toString()
      }

      const response = await fetch(`https://api.stripe.com${path}`, options)
      const data = await response.json()

      if (data.error) {
        return {
          success: false,
          error: data.error.message || 'Stripe API error',
        }
      }

      return { success: true, data }
    } catch (err: any) {
      return {
        success: false,
        error: `Stripe request failed: ${err.message}`,
      }
    }
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    const body = new URLSearchParams()
    body.append('amount', params.amount.toString())
    body.append('currency', params.currency.toLowerCase())
    body.append('automatic_payment_methods[enabled]', 'true')

    if (params.capture_method) {
      body.append('capture_method', params.capture_method)
    }
    if (params.setup_future_usage) {
      body.append('setup_future_usage', params.setup_future_usage)
    }
    if (params.description) {
      body.append('description', params.description)
    }
    if (params.receipt_email) {
      body.append('receipt_email', params.receipt_email)
    }

    for (const [key, value] of Object.entries(params.metadata)) {
      if (value !== undefined && value !== null) {
        body.append(`metadata[${key}]`, String(value))
      }
    }

    const result = await this.stripeRequest('/v1/payment_intents', 'POST', body)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      id: result.data.id,
      client_secret: result.data.client_secret,
      status: result.data.status,
    }
  }

  async capturePayment(paymentIntentId: string): Promise<CaptureResult> {
    const result = await this.stripeRequest(
      `/v1/payment_intents/${paymentIntentId}/capture`,
      'POST'
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      id: result.data.id,
      amount_captured: result.data.amount_received,
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const body = new URLSearchParams()
    body.append('payment_intent', params.payment_intent_id)

    if (params.amount !== undefined) {
      body.append('amount', params.amount.toString())
    }
    if (params.reason) {
      body.append('reason', params.reason)
    }
    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        if (value !== undefined && value !== null) {
          body.append(`metadata[${key}]`, String(value))
        }
      }
    }

    const result = await this.stripeRequest('/v1/refunds', 'POST', body)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      refund_id: result.data.id,
      amount: result.data.amount,
      status: result.data.status,
    }
  }

  async getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
    const result = await this.stripeRequest(
      `/v1/payment_intents/${paymentIntentId}`,
      'GET'
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      id: result.data.id,
      status: result.data.status,
      amount: result.data.amount,
      currency: result.data.currency,
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the Stripe secret key for a ledger.
 * Tries: Vault → ledger settings → environment variable
 */
export async function getStripeSecretKey(
  supabase: SupabaseClient,
  ledgerId: string
): Promise<string | null> {
  // 1. Try Vault (preferred, secure storage)
  try {
    const { data: vaultKey } = await supabase.rpc('get_stripe_secret_key_from_vault', {
      p_ledger_id: ledgerId,
    })
    if (vaultKey) return vaultKey
  } catch {
    // Vault function might not exist yet, fall through
  }

  // 2. Try ledger settings (legacy)
  try {
    const { data: ledger } = await supabase
      .from('ledgers')
      .select('settings')
      .eq('id', ledgerId)
      .single()

    const settings = ledger?.settings as Record<string, any> | null
    if (settings?.stripe_secret_key) {
      return settings.stripe_secret_key
    }
  } catch {
    // Fall through
  }

  // 3. Fall back to environment variable (global key)
  return Deno.env.get('STRIPE_SECRET_KEY') || null
}

/**
 * Factory function to get a payment provider by name
 */
export function getPaymentProvider(name: string, apiKey: string): PaymentProvider {
  switch (name) {
    case 'stripe':
      return new StripePaymentProvider(apiKey)
    default:
      throw new Error(`Unsupported payment provider: ${name}`)
  }
}
