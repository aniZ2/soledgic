// Soledgic: Payment Provider Abstraction
// Shared interface for charge-side payment operations.
// Supports the primary card processor (active) and Stripe (legacy compatibility).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

// Public provider names are whitelabeled. Internally, the primary processor is Finix.
export type PaymentProviderName = 'card' | 'stripe'

export interface PaymentIntentParams {
  amount: number                          // In smallest currency unit (cents)
  currency: string                        // ISO currency code
  metadata: Record<string, string>
  description?: string
  receipt_email?: string
  capture_method?: 'automatic' | 'manual'
  setup_future_usage?: 'off_session' | 'on_session'
  payment_method_id?: string
  destination_id?: string
  merchant_id?: string
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
  amount?: number                         // Partial refund amount in cents; omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  metadata?: Record<string, string>
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

export interface FinixProviderConfig {
  username?: string | null
  password?: string | null
  apiVersion?: string | null
  environment?: string | null
  baseUrl?: string | null
  sourceId?: string | null
  merchantId?: string | null
  transfersPath?: string | null
}

export interface PaymentProviderFactoryOptions {
  stripeApiKey?: string | null
  finix?: FinixProviderConfig
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
// STRIPE IMPLEMENTATION (LEGACY)
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
          Authorization: `Bearer ${this.apiKey}`,
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
      const data = await response.json().catch(() => ({}))

      if (!response.ok || data.error) {
        return {
          success: false,
          error: data?.error?.message || `Stripe API request failed (${response.status})`,
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
      return { success: false, provider: 'stripe', error: result.error }
    }

    return {
      success: true,
      provider: 'stripe',
      id: result.data.id,
      client_secret: result.data.client_secret,
      status: result.data.status,
      requires_action: Boolean(result.data.status === 'requires_action'),
      raw: result.data,
    }
  }

  async capturePayment(paymentIntentId: string): Promise<CaptureResult> {
    const result = await this.stripeRequest(
      `/v1/payment_intents/${paymentIntentId}/capture`,
      'POST'
    )

    if (!result.success) {
      return { success: false, provider: 'stripe', error: result.error }
    }

    return {
      success: true,
      provider: 'stripe',
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
      return { success: false, provider: 'stripe', error: result.error }
    }

    return {
      success: true,
      provider: 'stripe',
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
      return { success: false, provider: 'stripe', error: result.error }
    }

    return {
      success: true,
      provider: 'stripe',
      id: result.data.id,
      status: result.data.status,
      amount: result.data.amount,
      currency: result.data.currency,
    }
  }
}

// ============================================================================
// FINIX IMPLEMENTATION (ACTIVE)
// ============================================================================

type FinixEnv = 'production' | 'sandbox'

class FinixPaymentProvider implements PaymentProvider {
  private readonly cfg: FinixProviderConfig

  constructor(cfg: FinixProviderConfig = {}) {
    this.cfg = cfg
  }

  private resolveConfig() {
    const envRaw = (this.cfg.environment || Deno.env.get('FINIX_ENV') || 'sandbox').toLowerCase().trim()
    const env: FinixEnv =
      envRaw === 'production' || envRaw === 'prod' || envRaw === 'live' ? 'production' : 'sandbox'

    const baseUrl = (
      this.cfg.baseUrl ||
      Deno.env.get('FINIX_BASE_URL') ||
      (env === 'production'
        ? 'https://finix.live-payments-api.com'
        : 'https://finix.sandbox-payments-api.com')
    ).replace(/\/$/, '')

    let configError: string | null = null
    if (env === 'production' && baseUrl.includes('sandbox')) {
      configError = 'Payment processor misconfiguration: production environment cannot use sandbox base URL'
    }
    if (env === 'sandbox' && baseUrl.includes('live-payments')) {
      configError = 'Payment processor misconfiguration: sandbox environment cannot use live base URL'
    }

    return {
      username: this.cfg.username || Deno.env.get('FINIX_USERNAME'),
      password: this.cfg.password || Deno.env.get('FINIX_PASSWORD'),
      apiVersion: this.cfg.apiVersion || Deno.env.get('FINIX_API_VERSION') || '2022-02-01',
      transfersPath: this.cfg.transfersPath || '/transfers',
      sourceId: this.cfg.sourceId || Deno.env.get('FINIX_SOURCE_ID'),
      merchantId: this.cfg.merchantId || Deno.env.get('FINIX_MERCHANT_ID'),
      baseUrl,
      configError,
    }
  }

  private parseError(data: any, fallback: string): string {
    return (
      data?.error ||
      data?.message ||
      data?._embedded?.errors?.[0]?.message ||
      fallback
    )
  }

  private mapStatus(state: string | undefined): string {
    const normalized = (state || '').toUpperCase()
    if (['SUCCEEDED', 'SETTLED', 'COMPLETED'].includes(normalized)) return 'succeeded'
    if (['FAILED', 'CANCELED', 'REJECTED', 'DECLINED', 'RETURNED'].includes(normalized)) return 'failed'
    if (['PROCESSING', 'PENDING', 'CREATED', 'SENT'].includes(normalized)) return 'processing'
    return 'pending'
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    const { username, password, apiVersion, transfersPath, sourceId, merchantId, baseUrl, configError } = this.resolveConfig()

    if (configError) {
      return { success: false, provider: 'card', error: configError }
    }
    if (!username || !password) {
      return { success: false, provider: 'card', error: 'Payment processor credentials are not configured' }
    }

    const source =
      params.payment_method_id ||
      params.metadata?.finix_source_id ||
      params.metadata?.source_id ||
      sourceId ||
      null

    const merchant =
      params.merchant_id ||
      params.metadata?.finix_merchant_id ||
      merchantId ||
      null

    const destination =
      params.destination_id ||
      params.metadata?.finix_destination_id ||
      params.metadata?.destination_id ||
      merchant ||
      null

    if (!source) {
      return {
        success: false,
        provider: 'card',
        error: 'No payment method configured for checkout',
      }
    }
    if (!destination) {
      return {
        success: false,
        provider: 'card',
        error: 'No destination account configured for checkout',
      }
    }

    const payload: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      source,
      destination,
      tags: {
        ...params.metadata,
        checkout_description: params.description || '',
        checkout_receipt_email: params.receipt_email || '',
      },
    }
    if (merchant) payload.merchant = merchant

    try {
      const response = await fetch(`${baseUrl}${transfersPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          'Finix-Version': apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          provider: 'card',
          error: this.parseError(data, `Processor transfer failed (${response.status})`),
        }
      }

      return {
        success: true,
        provider: 'card',
        id: data?.id,
        status: this.mapStatus(data?.state || data?.status),
        requires_action: false,
        redirect_url: data?._links?.self?.href || undefined,
        raw: data,
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'card',
        error: err.message || 'Processor request failed',
      }
    }
  }

  async capturePayment(_paymentIntentId: string): Promise<CaptureResult> {
    return {
      success: false,
      provider: 'card',
      error: 'Transfer capture is not supported for this flow',
    }
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return {
      success: false,
      provider: 'card',
      error: 'Refunds are not implemented for this provider yet',
    }
  }

  async getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
    const { username, password, apiVersion, transfersPath, baseUrl, configError } = this.resolveConfig()

    if (configError) {
      return { success: false, provider: 'card', error: configError }
    }
    if (!username || !password) {
      return { success: false, provider: 'card', error: 'Payment processor credentials are not configured' }
    }

    try {
      const response = await fetch(`${baseUrl}${transfersPath}/${paymentIntentId}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          'Finix-Version': apiVersion,
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          provider: 'card',
          error: this.parseError(data, `Processor status lookup failed (${response.status})`),
        }
      }

      return {
        success: true,
        provider: 'card',
        id: data?.id,
        status: this.mapStatus(data?.state || data?.status),
        amount: typeof data?.amount === 'number' ? data.amount : undefined,
        currency: data?.currency,
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'card',
        error: err.message || 'Processor status lookup failed',
      }
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the Stripe secret key for a ledger.
 * Tries: Vault -> ledger settings -> environment variable.
 */
export async function getStripeSecretKey(
  supabase: SupabaseClient,
  ledgerId: string
): Promise<string | null> {
  try {
    const { data: vaultKey } = await supabase.rpc('get_stripe_secret_key_from_vault', {
      p_ledger_id: ledgerId,
    })
    if (vaultKey) return vaultKey
  } catch {
    // Vault function might not exist yet, fall through.
  }

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
    // Fall through.
  }

  return Deno.env.get('STRIPE_SECRET_KEY') || null
}

export function normalizePaymentProviderName(value: unknown): PaymentProviderName | null {
  const normalized = String(value || '').toLowerCase().trim()
  if (normalized === 'card' || normalized === 'processor' || normalized === 'primary') return 'card'
  if (normalized === 'finix') return 'card'
  if (normalized === 'stripe') return 'stripe'
  return null
}

/**
 * Factory function to get a payment provider by name.
 * Backward-compatible signature:
 * - getPaymentProvider('stripe', 'sk_live_...')
 * - getPaymentProvider('card', { finix: { ... } })
 */
export function getPaymentProvider(
  name: PaymentProviderName,
  options: string | PaymentProviderFactoryOptions = {}
): PaymentProvider {
  if (name === 'stripe') {
    const apiKey =
      typeof options === 'string'
        ? options
        : options.stripeApiKey || ''
    if (!apiKey) {
      throw new Error('Stripe API key is required')
    }
    return new StripePaymentProvider(apiKey)
  }

  const finixConfig =
    typeof options === 'string'
      ? {}
      : options.finix || {}
  return new FinixPaymentProvider(finixConfig)
}
