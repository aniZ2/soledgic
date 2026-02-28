const PUBLIC_PRICING_URL = 'https://soledgic.com/pricing'

type JsonRecord = Record<string, unknown>

interface ProcessorIdentity {
  id?: string
  _links?: {
    application?: { href?: string }
    applications?: { href?: string }
  }
  application_id?: string
  application?: string
}

export interface ProcessorOnboardingLinkResponse {
  id?: string
  link_url?: string
  onboarding_link_url?: string
  expires_at?: string
  _embedded?: {
    links?: Array<{ link_url?: string }>
  }
}

interface ProcessorMerchantsResponse {
  _embedded?: {
    merchants?: unknown[]
  }
}

interface ProcessorPaymentInstrumentsResponse {
  _embedded?: {
    payment_instruments?: unknown[]
  }
}

interface ProcessorErrorBody {
  error?: unknown
  message?: unknown
  _embedded?: {
    errors?: Array<{ message?: unknown }>
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getProcessorRequestTimeoutMs(): number {
  const raw = Number(process.env.PROCESSOR_REQUEST_TIMEOUT_MS || 30000)
  if (!Number.isFinite(raw) || raw < 1000) return 30000
  return Math.floor(raw)
}

function extractProcessorErrorMessage(payload: unknown): string | null {
  if (!isJsonRecord(payload)) return null
  const body = payload as ProcessorErrorBody
  if (typeof body.error === 'string' && body.error.trim().length > 0) return body.error
  if (typeof body.message === 'string' && body.message.trim().length > 0) return body.message
  const firstEmbedded = body._embedded?.errors?.[0]
  if (firstEmbedded && typeof firstEmbedded.message === 'string' && firstEmbedded.message.trim().length > 0) {
    return firstEmbedded.message
  }
  return null
}

function getProcessorEnvironment(): 'production' | 'sandbox' {
  const raw = (process.env.PROCESSOR_ENV || '').toLowerCase().trim()
  if (['production', 'prod', 'live'].includes(raw)) return 'production'
  if (['sandbox', 'test', 'testing', 'development', 'dev'].includes(raw)) return 'sandbox'
  return process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
}

function getProcessorBaseUrl() {
  const baseUrl = (process.env.PROCESSOR_BASE_URL || '').trim()
  if (!baseUrl) {
    throw new Error('Payment processor base URL is not configured')
  }
  return baseUrl
}

function getProcessorAuthHeader() {
  const username = process.env.PROCESSOR_USERNAME
  const password = process.env.PROCESSOR_PASSWORD
  if (!username || !password) {
    throw new Error('Payment processor credentials are not configured')
  }

  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${token}`
}

export interface ProcessorRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
}

export async function processorRequest<T = unknown>(
  path: string,
  options: ProcessorRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body } = options
  if (!path.startsWith('/')) {
    throw new Error('Processor request path must start with "/"')
  }

  const baseUrl = getProcessorBaseUrl().replace(/\/$/, '')
  const env = getProcessorEnvironment()

  // Guard against misconfiguration (e.g. sandbox URL with production env).
  if (env === 'production' && /sandbox/i.test(baseUrl)) {
    throw new Error('Payment processor misconfiguration: production environment cannot use sandbox base URL')
  }
  if (env === 'sandbox' && /(live|production)/i.test(baseUrl)) {
    throw new Error('Payment processor misconfiguration: sandbox environment cannot use production base URL')
  }

  const versionHeader = (process.env.PROCESSOR_VERSION_HEADER || '').trim()
  const apiVersion = (process.env.PROCESSOR_API_VERSION || '').trim()
  if ((versionHeader && !apiVersion) || (!versionHeader && apiVersion)) {
    throw new Error('Payment processor versioning is misconfigured (set both PROCESSOR_VERSION_HEADER and PROCESSOR_API_VERSION)')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), getProcessorRequestTimeoutMs())

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: getProcessorAuthHeader(),
        ...(versionHeader ? { [versionHeader]: apiVersion } : {}),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })

    const json: unknown = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = extractProcessorErrorMessage(json) || `Processor request failed (${response.status})`
      throw new Error(message)
    }

    return json as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Processor request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export interface CreateOnboardingLinkParams {
  onboardingFormId: string
  appUrl: string
  identityId?: string | null
  applicationId?: string | null
  expirationInMinutes?: number
  state?: string | null
  returnUrl?: string | null
  expiredSessionUrl?: string | null
}

export async function createOnboardingLink(params: CreateOnboardingLinkParams) {
  const {
    onboardingFormId,
    appUrl,
    identityId,
    applicationId,
    expirationInMinutes = 60,
    state,
    returnUrl,
    expiredSessionUrl,
  } = params

  const returnTarget = (() => {
    if (returnUrl) {
      const next = new URL(returnUrl)
      if (state) next.searchParams.set('state', state)
      return next.toString()
    }

    const next = new URL('/settings/payment-rails', appUrl)
    next.searchParams.set('onboarding', 'success')
    if (state) next.searchParams.set('state', state)
    return next.toString()
  })()

  const expiredTarget = (() => {
    if (expiredSessionUrl) {
      const next = new URL(expiredSessionUrl)
      if (state) next.searchParams.set('state', state)
      return next.toString()
    }

    const next = new URL('/settings/payment-rails', appUrl)
    next.searchParams.set('onboarding', 'expired')
    if (state) next.searchParams.set('state', state)
    return next.toString()
  })()

  const payload: Record<string, unknown> = {
    expiration_in_minutes: expirationInMinutes,
    return_url: returnTarget,
    expired_session_url: expiredTarget,
    // Always send merchants to the public pricing page.
    fee_details_url: PUBLIC_PRICING_URL,
    terms_of_service_url: `${appUrl}/terms`,
    privacy_policy_url: `${appUrl}/privacy`,
  }

  if (identityId) {
    payload.resource_type = 'IDENTITY'
    payload.entity = identityId
  } else if (applicationId) {
    payload.resource_type = 'APPLICATION'
    payload.entity = applicationId
  }

  return processorRequest<ProcessorOnboardingLinkResponse>(`/onboarding_forms/${onboardingFormId}/links`, {
    method: 'POST',
    body: payload,
  })
}

function extractApplicationIdFromHref(href: unknown): string | null {
  if (typeof href !== 'string' || href.length === 0) return null
  const match = href.match(/\/applications\/([^/?#]+)/)
  return match?.[1] || null
}

function extractIdentityApplicationId(identity: ProcessorIdentity): string | null {
  return (
    extractApplicationIdFromHref(identity?._links?.application?.href) ||
    extractApplicationIdFromHref(identity?._links?.applications?.href) ||
    (typeof identity?.application_id === 'string' ? identity.application_id : null) ||
    (typeof identity?.application === 'string' ? identity.application : null) ||
    null
  )
}

export async function fetchProcessorIdentity(identityId: string) {
  const identity = await processorRequest<ProcessorIdentity>(`/identities/${identityId}`)

  // Defense-in-depth: ensure a redirected identity belongs to our configured application.
  const expectedAppId = process.env.PROCESSOR_APPLICATION_ID
  if (expectedAppId) {
    const actualAppId = extractIdentityApplicationId(identity)
    if (!actualAppId) {
      throw new Error('Unable to verify identity application')
    }
    if (actualAppId !== expectedAppId) {
      throw new Error('Identity does not belong to this application')
    }
  }

  return identity
}

export async function fetchProcessorMerchantForIdentity(identityId: string) {
  const response = await processorRequest<ProcessorMerchantsResponse>(`/identities/${identityId}/merchants`)
  const merchants = Array.isArray(response?._embedded?.merchants) ? response._embedded!.merchants : []
  return merchants[0] || null
}

export async function fetchProcessorPaymentInstrumentsForIdentity(identityId: string) {
  const response = await processorRequest<ProcessorPaymentInstrumentsResponse>(`/identities/${identityId}/payment_instruments?limit=20`)
  return Array.isArray(response?._embedded?.payment_instruments)
    ? response._embedded!.payment_instruments
    : []
}
