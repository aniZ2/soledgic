// SERVICE_ID: SVC_STRIPE_REST
// Soledgic: Deno-compatible Stripe REST client
// No SDK dependency — uses form-url-encoded POST bodies with Bearer auth.

export interface StripeRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  params?: Record<string, unknown>
  idempotencyKey?: string
}

export interface StripeError {
  type: string
  code?: string
  message: string
  param?: string
}

export interface StripeResponse<T = Record<string, unknown>> {
  ok: boolean
  status: number
  data?: T
  error?: StripeError
}

function getTimeoutMs(): number {
  const raw = Number(Deno.env.get('STRIPE_REQUEST_TIMEOUT_MS') || 30000)
  if (!Number.isFinite(raw) || raw < 1000) return 30000
  return Math.floor(raw)
}

function getSecretKey(): string | null {
  const key = (Deno.env.get('STRIPE_SECRET_KEY') || '').trim()
  return key || null
}

/**
 * Flatten a nested object into Stripe's bracket-notation form-encoded params.
 * e.g. { metadata: { foo: 'bar' } } → 'metadata[foo]=bar'
 */
function flattenParams(
  obj: Record<string, unknown>,
  prefix = ''
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key

    if (value === null || value === undefined) continue

    if (typeof value === 'object' && !Array.isArray(value)) {
      pairs.push(...flattenParams(value as Record<string, unknown>, fullKey))
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'object' && value[i] !== null) {
          pairs.push(...flattenParams(value[i] as Record<string, unknown>, `${fullKey}[${i}]`))
        } else {
          pairs.push([`${fullKey}[${i}]`, String(value[i])])
        }
      }
    } else {
      pairs.push([fullKey, String(value)])
    }
  }

  return pairs
}

function encodeFormBody(params: Record<string, unknown>): string {
  return flattenParams(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

function parseStripeError(data: Record<string, unknown>): StripeError | undefined {
  const err = data?.error
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  return {
    type: String(e.type || 'api_error'),
    code: typeof e.code === 'string' ? e.code : undefined,
    message: String(e.message || 'Unknown Stripe error'),
    param: typeof e.param === 'string' ? e.param : undefined,
  }
}

const STRIPE_API_BASE = 'https://api.stripe.com'

/** Detect raw card numbers in any value — catches spaced, dashed, or plain 13-19 digit sequences. */
function looksLikeCardNumber(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const stripped = value.replace(/[\s\-]/g, '')
  return /^\d{13,19}$/.test(stripped)
}

/** Deep-scan params for anything that smells like raw card data. Returns the offending field name or null. */
function containsRawCardData(obj: Record<string, unknown>, prefix = ''): string | null {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (looksLikeCardNumber(value)) return path

    // Check suspicious field names with numeric values
    const lower = key.toLowerCase()
    if ((lower === 'number' || lower === 'card_number' || lower === 'pan') && typeof value === 'string' && value.length >= 13) {
      return path
    }

    // Recurse into nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = containsRawCardData(value as Record<string, unknown>, path)
      if (nested) return nested
    }
  }
  return null
}

export async function stripeRequest<T = Record<string, unknown>>(
  path: string,
  options: StripeRequestOptions = {}
): Promise<StripeResponse<T>> {
  const { method = 'GET', params, idempotencyKey } = options

  // SAFETY: Never send raw card numbers to Stripe. Block at the client level.
  if (params) {
    const blocked = containsRawCardData(params)
    if (blocked) {
      console.error('BLOCKED RAW CARD DATA ATTEMPT — request rejected before reaching Stripe.', {
        path,
        method,
        field: blocked,
      })
      return {
        ok: false,
        status: 0,
        error: { type: 'safety_block', message: 'Raw card numbers must never be sent to Stripe. Use tokens (tok_visa) or Payment Methods.' },
      }
    }
  }

  const secretKey = getSecretKey()

  if (!secretKey) {
    return {
      ok: false,
      status: 0,
      error: { type: 'configuration_error', message: 'STRIPE_SECRET_KEY is not configured' },
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': '2025-02-24.acacia',
  }

  let url = `${STRIPE_API_BASE}${path}`
  let body: string | undefined

  if (method === 'GET' && params) {
    const qs = encodeFormBody(params)
    if (qs) url += `?${qs}`
  } else if (params && (method === 'POST' || method === 'DELETE')) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = encodeFormBody(params)
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(getTimeoutMs()),
    })

    const data = await response.json().catch(() => ({})) as Record<string, unknown>

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: parseStripeError(data) || {
          type: 'api_error',
          message: `Stripe request failed (${response.status})`,
        },
      }
    }

    return { ok: true, status: response.status, data: data as T }
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return {
        ok: false,
        status: 0,
        error: { type: 'timeout', message: 'Stripe request timed out' },
      }
    }
    return {
      ok: false,
      status: 0,
      error: {
        type: 'network_error',
        message: err instanceof Error ? err.message : 'Stripe request failed',
      },
    }
  }
}
