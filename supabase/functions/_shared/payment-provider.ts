// Soledgic: Payment Provider Abstraction
// Shared interface for charge-side payment operations.
//
// Merchant-of-record invariant (shared merchant):
// - Merchant selection is platform-managed (env) and cannot be overridden.
// - Requests must provide a buyer payment method id for charge-side flows.

// ============================================================================
// TYPES
// ============================================================================

// Public provider names are whitelabeled.
export type PaymentProviderName = 'card'

export interface PaymentIntentParams {
  amount: number // In smallest currency unit (cents)
  currency: string // ISO currency code
  metadata: Record<string, string>
  description?: string
  receipt_email?: string
  // For charge-side DEBIT flows.
  payment_method_id?: string
  // Reserved for CREDIT flows (not used by Soledgic charge-side today).
  destination_id?: string
  // Prevents duplicate transfers at the processor level.
  idempotency_id?: string
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
// TAG SANITIZATION (Finix constraints: keys ≤40 chars, values ≤500 chars, ≤50 pairs)
// ============================================================================

/** Normalize a tag key to Finix constraints: lowercase alphanumeric + underscores, max 40 chars. */
function sanitizeTagKey(key: string): string {
  const cleaned = key
    .replace(/[^a-zA-Z0-9_]/g, '_') // replace invalid chars with underscore
    .replace(/_+/g, '_')            // collapse consecutive underscores
    .replace(/^_|_$/g, '')          // trim leading/trailing underscores
    .toLowerCase()
    .slice(0, 40)
  return cleaned
}

/** Sanitize a tags object for Finix: normalize keys, truncate values, cap at 50 entries. */
function sanitizeTags(raw: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  let count = 0
  for (const [k, v] of Object.entries(raw)) {
    if (count >= 50) break
    const safeKey = sanitizeTagKey(k)
    if (!safeKey) continue
    const safeValue = typeof v === 'string' ? v.slice(0, 500) : String(v ?? '').slice(0, 500)
    result[safeKey] = safeValue
    count++
  }
  return result
}

// ============================================================================
// CARD PROCESSOR IMPLEMENTATION (ACTIVE)
// ============================================================================

type ProcessorEnv = 'production' | 'sandbox'

class CardPaymentProvider implements PaymentProvider {
  private readonly cfg: ProcessorProviderConfig

  constructor(cfg: ProcessorProviderConfig = {}) {
    this.cfg = cfg
  }

  private getTimeoutMs(): number {
    const raw = Number(Deno.env.get('PROCESSOR_REQUEST_TIMEOUT_MS') || 30000)
    if (!Number.isFinite(raw) || raw < 1000) return 30000
    return Math.floor(raw)
  }

  private resolveConfig() {
    const envRaw = (this.cfg.environment || Deno.env.get('PROCESSOR_ENV') || 'sandbox').toLowerCase().trim()
    const env: ProcessorEnv =
      envRaw === 'production' || envRaw === 'prod' || envRaw === 'live' ? 'production' : 'sandbox'

    let configError: string | null = null
    const baseUrl = (this.cfg.baseUrl || Deno.env.get('PROCESSOR_BASE_URL') || '').trim().replace(/\/$/, '')
    if (!baseUrl) {
      configError = 'Payment processor base URL is not configured'
    } else {
      if (env === 'production' && /sandbox/i.test(baseUrl)) {
        configError = 'Payment processor misconfiguration: production environment cannot use sandbox base URL'
      }
      if (env === 'sandbox' && /(production|prod)/i.test(baseUrl)) {
        configError = 'Payment processor misconfiguration: sandbox environment cannot use production base URL'
      }
    }

    const versionHeader = (this.cfg.versionHeader || Deno.env.get('PROCESSOR_VERSION_HEADER') || '').trim() || 'Finix-Version'
    const apiVersion = (this.cfg.apiVersion || Deno.env.get('PROCESSOR_API_VERSION') || '').trim() || '2022-02-01'

    return {
      merchantId: (this.cfg.merchantId || Deno.env.get('PROCESSOR_MERCHANT_ID') || '').trim() || null,
      username: this.cfg.username || Deno.env.get('PROCESSOR_USERNAME'),
      password: this.cfg.password || Deno.env.get('PROCESSOR_PASSWORD'),
      versionHeader: versionHeader || null,
      apiVersion: apiVersion || null,
      transfersPath: this.cfg.transfersPath || Deno.env.get('PROCESSOR_TRANSFERS_PATH') || '/transfers',
      refundsPathTemplate:
        (this.cfg.refundsPathTemplate || Deno.env.get('PROCESSOR_REFUNDS_PATH_TEMPLATE') || '').trim() || null,
      baseUrl,
      configError,
    }
  }

  private parseError(data: any, fallback: string): string {
    return data?.error || data?.message || data?._embedded?.errors?.[0]?.message || fallback
  }

  private mapStatus(state: string | undefined): string {
    const normalized = (state || '').toUpperCase()
    if (['SUCCEEDED', 'SETTLED', 'COMPLETED'].includes(normalized)) return 'succeeded'
    if (['FAILED', 'CANCELED', 'CANCELLED', 'REJECTED', 'DECLINED', 'RETURNED'].includes(normalized)) return 'failed'
    if (['PROCESSING', 'PENDING', 'CREATED', 'SENT'].includes(normalized)) return 'processing'
    return 'pending'
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    const { username, password, apiVersion, versionHeader, transfersPath, merchantId, baseUrl, configError } =
      this.resolveConfig()

    if (configError) return { success: false, provider: 'card', error: configError }
    if (!username || !password) {
      return { success: false, provider: 'card', error: 'Payment processor credentials are not configured' }
    }
    if (!merchantId) {
      return { success: false, provider: 'card', error: 'Payment processor merchant is not configured' }
    }

    // Merchant-of-record invariant: do not allow any merchant overrides.
    if (typeof (params as any)?.merchant_id === 'string' && (params as any).merchant_id.trim().length > 0) {
      return { success: false, provider: 'card', error: 'Merchant override is not allowed' }
    }

    // Processor transfer rules (mutually exclusive per Finix spec):
    // - DEBIT transfers use `source` (payment_method_id)
    // - CREDIT transfers use `destination` (destination_id)
    const source = params.payment_method_id || null
    const destination = params.destination_id || null

    if (!source && !destination) {
      return { success: false, provider: 'card', error: 'payment_method_id or destination_id is required' }
    }

    const rawTags: Record<string, unknown> = {
      ...params.metadata,
      checkout_description: params.description || '',
      checkout_receipt_email: params.receipt_email || '',
    }
    const payload: Record<string, unknown> = {
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      merchant: merchantId,
      tags: sanitizeTags(rawTags),
    }

    // source and destination are mutually exclusive: DEBIT uses source, CREDIT uses destination.
    if (destination) {
      payload.destination = destination
    } else {
      payload.source = source
    }
    if (params.idempotency_id) payload.idempotency_id = params.idempotency_id

    try {
      const versioning = { [versionHeader]: apiVersion }
      const response = await fetch(`${baseUrl}${transfersPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          ...versioning,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.getTimeoutMs()),
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
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        return { success: false, provider: 'card', error: 'Processor request timed out' }
      }
      return { success: false, provider: 'card', error: err?.message || 'Processor request failed' }
    }
  }

  async capturePayment(_paymentIntentId: string): Promise<CaptureResult> {
    return {
      success: false,
      provider: 'card',
      error: 'Capture is not supported for this flow',
    }
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    const { username, password, apiVersion, versionHeader, transfersPath, refundsPathTemplate, baseUrl, configError } =
      this.resolveConfig()

    if (configError) return { success: false, provider: 'card', error: configError }
    if (!username || !password) {
      return { success: false, provider: 'card', error: 'Payment processor credentials are not configured' }
    }

    const paymentId = (_params?.payment_intent_id || '').trim()
    if (!paymentId) {
      return { success: false, provider: 'card', error: 'payment_intent_id is required' }
    }

    const path =
      refundsPathTemplate?.length
        ? refundsPathTemplate.replaceAll('{id}', paymentId)
        : `${transfersPath}/${paymentId}/reversals`

    const payload: Record<string, unknown> = {}
    if (typeof _params.amount === 'number' && Number.isFinite(_params.amount) && _params.amount > 0) {
      payload.refund_amount = Math.round(_params.amount)
    }

    const rawRefundTags: Record<string, unknown> = {}
    if (_params.metadata && typeof _params.metadata === 'object') {
      Object.assign(rawRefundTags, _params.metadata)
    }
    if (_params.reason) rawRefundTags.refund_reason = _params.reason
    const refundTags = sanitizeTags(rawRefundTags)
    if (Object.keys(refundTags).length > 0) payload.tags = refundTags
    if (_params.idempotency_id) payload.idempotency_id = _params.idempotency_id

    try {
      const versioning = { [versionHeader]: apiVersion }
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          ...versioning,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          provider: 'card',
          error: this.parseError(data, `Processor refund failed (${response.status})`),
        }
      }

      const amount = typeof data?.amount === 'number' ? data.amount : _params.amount
      return {
        success: true,
        provider: 'card',
        refund_id: data?.id,
        amount,
        status: this.mapStatus(data?.state || data?.status),
      }
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        return { success: false, provider: 'card', error: 'Processor refund request timed out' }
      }
      return { success: false, provider: 'card', error: err?.message || 'Processor refund failed' }
    }
  }

  async getPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
    const { username, password, apiVersion, versionHeader, transfersPath, baseUrl, configError } =
      this.resolveConfig()

    if (configError) return { success: false, provider: 'card', error: configError }
    if (!username || !password) {
      return { success: false, provider: 'card', error: 'Payment processor credentials are not configured' }
    }

    try {
      const versioning = { [versionHeader]: apiVersion }
      const response = await fetch(`${baseUrl}${transfersPath}/${paymentIntentId}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          ...versioning,
        },
        signal: AbortSignal.timeout(this.getTimeoutMs()),
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
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        return { success: false, provider: 'card', error: 'Processor status request timed out' }
      }
      return { success: false, provider: 'card', error: err?.message || 'Processor status lookup failed' }
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

export function normalizePaymentProviderName(value: unknown): PaymentProviderName | null {
  const normalized = String(value || '').toLowerCase().trim()
  if (normalized === 'card' || normalized === 'processor' || normalized === 'primary') return 'card'
  return null
}

export function getPaymentProvider(
  _name: PaymentProviderName,
  options: PaymentProviderFactoryOptions = {}
): PaymentProvider {
  const cfg = options.processor || options.processor === null ? options.processor || {} : {}
  return new CardPaymentProvider(cfg)
}
