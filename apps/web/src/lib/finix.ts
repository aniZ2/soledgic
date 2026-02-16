const DEFAULT_FINIX_VERSION = '2022-02-01'
const PUBLIC_PRICING_URL = 'https://soledgic.com/pricing'

function getFinixEnvironment(): 'production' | 'sandbox' {
  const raw = (process.env.FINIX_ENV || '').toLowerCase().trim()
  if (['production', 'prod', 'live'].includes(raw)) return 'production'
  if (['sandbox', 'test', 'testing', 'development', 'dev'].includes(raw)) return 'sandbox'
  return process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
}

function getFinixBaseUrl() {
  if (process.env.FINIX_BASE_URL) return process.env.FINIX_BASE_URL
  const env = getFinixEnvironment()
  return env === 'production'
    ? 'https://finix.live-payments-api.com'
    : 'https://finix.sandbox-payments-api.com'
}

function getFinixAuthHeader() {
  const username = process.env.FINIX_USERNAME
  const password = process.env.FINIX_PASSWORD
  if (!username || !password) {
    throw new Error('Payment processor credentials are not configured')
  }

  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${token}`
}

export interface FinixRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
}

export async function finixRequest<T = any>(
  path: string,
  options: FinixRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body } = options
  const baseUrl = getFinixBaseUrl().replace(/\/$/, '')
  const env = getFinixEnvironment()

  // Guard against misconfiguration (e.g. sandbox URL with production env).
  if (env === 'production' && baseUrl.includes('sandbox')) {
    throw new Error('Payment processor misconfiguration: production environment cannot use sandbox base URL')
  }
  if (env === 'sandbox' && baseUrl.includes('live-payments')) {
    throw new Error('Payment processor misconfiguration: sandbox environment cannot use live base URL')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: getFinixAuthHeader(),
      'Finix-Version': process.env.FINIX_API_VERSION || DEFAULT_FINIX_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      json?.error ||
      json?.message ||
      json?._embedded?.errors?.[0]?.message ||
      `Processor request failed (${response.status})`
    throw new Error(message)
  }

  return json as T
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

  return finixRequest(`/onboarding_forms/${onboardingFormId}/links`, {
    method: 'POST',
    body: payload,
  })
}

function extractApplicationIdFromHref(href: unknown): string | null {
  if (typeof href !== 'string' || href.length === 0) return null
  const match = href.match(/\/applications\/([^/?#]+)/)
  return match?.[1] || null
}

function extractIdentityApplicationId(identity: any): string | null {
  return (
    extractApplicationIdFromHref(identity?._links?.application?.href) ||
    extractApplicationIdFromHref(identity?._links?.applications?.href) ||
    (typeof identity?.application_id === 'string' ? identity.application_id : null) ||
    (typeof identity?.application === 'string' ? identity.application : null) ||
    null
  )
}

export async function fetchFinixIdentity(identityId: string) {
  const identity = await finixRequest<any>(`/identities/${identityId}`)

  // Defense-in-depth: ensure a redirected identity belongs to our configured Finix application.
  const expectedAppId = process.env.FINIX_APPLICATION_ID
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

export async function fetchFinixMerchantForIdentity(identityId: string) {
  const response = await finixRequest<any>(`/identities/${identityId}/merchants`)
  const merchants = response?._embedded?.merchants || []
  return merchants[0] || null
}

export async function fetchFinixPaymentInstrumentsForIdentity(identityId: string) {
  const response = await finixRequest<any>(`/identities/${identityId}/payment_instruments?limit=20`)
  return response?._embedded?.payment_instruments || []
}
