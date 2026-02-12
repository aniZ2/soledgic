const DEFAULT_FINIX_VERSION = '2022-02-01'

function getFinixBaseUrl() {
  if (process.env.FINIX_BASE_URL) return process.env.FINIX_BASE_URL
  return process.env.NODE_ENV === 'production'
    ? 'https://finix.live-payments-api.com'
    : 'https://finix.sandbox-payments-api.com'
}

function getFinixAuthHeader() {
  const username = process.env.FINIX_USERNAME
  const password = process.env.FINIX_PASSWORD
  if (!username || !password) {
    throw new Error('Finix credentials are not configured')
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
      `Finix request failed (${response.status})`
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
}

export async function createOnboardingLink(params: CreateOnboardingLinkParams) {
  const {
    onboardingFormId,
    appUrl,
    identityId,
    applicationId,
    expirationInMinutes = 60,
  } = params

  const payload: Record<string, unknown> = {
    expiration_in_minutes: expirationInMinutes,
    return_url: `${appUrl}/settings/payment-rails?finix=success`,
    expired_session_url: `${appUrl}/settings/payment-rails?finix=expired`,
    fee_details_url: `${appUrl}/terms`,
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

export async function fetchFinixIdentity(identityId: string) {
  return finixRequest(`/identities/${identityId}`)
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
