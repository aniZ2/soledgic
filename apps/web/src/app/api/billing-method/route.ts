import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { getPublicAppUrl } from '@/lib/public-url'
import {
  createOnboardingLink,
  fetchProcessorIdentity,
  fetchProcessorPaymentInstrumentsForIdentity,
} from '@/lib/processor'

interface BillingMethodRequest {
  action: 'status' | 'create_setup_link' | 'save_billing_method'
  identity_id?: string
  state?: string
}

interface OrganizationSettings {
  billing?: {
    identity_id?: string | null
    payment_method_id?: string | null
    payment_method_type?: string | null
    payment_method_label?: string | null
    payment_method_last4?: string | null
    payment_method_brand?: string | null
    payment_method_exp_month?: number | null
    payment_method_exp_year?: number | null

    onboarding_form_id?: string | null
    last_setup_link_id?: string | null
    last_setup_link_url?: string | null
    last_setup_link_expires_at?: string | null
    last_setup_state?: string | null
    last_setup_state_expires_at?: string | null
    last_updated_at?: string | null
  }
  [key: string]: unknown
}

type JsonRecord = Record<string, unknown>

interface BillingInstrumentSelection {
  id: string
  type: string
  label: string | null
  last4: string | null
  brand: string | null
  exp_month: number | null
  exp_year: number | null
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNestedValue(value: unknown, ...path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!isJsonRecord(current)) return null
    current = current[key]
  }
  return current
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return fallback
}

function getAppUrl() {
  return getPublicAppUrl()
}

function normalizeOnboardingFormId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^obf_[A-Za-z0-9]+$/.test(trimmed)) return null
  return trimmed
}

function isExpired(iso: string | null | undefined) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t <= Date.now() : false
}

function requireActiveSetupState(
  expected: string | null | undefined,
  expectedExpiresAt: string | null | undefined,
  provided: string | null | undefined
) {
  if (!expected || !provided || expected !== provided) {
    throw new Error('Invalid billing setup state')
  }
  if (isExpired(expectedExpiresAt || null)) {
    throw new Error('Billing setup session expired. Start setup again.')
  }
}

function normalizePaymentInstrumentType(pi: unknown): string {
  const type = String(getNestedValue(pi, 'type') || getNestedValue(pi, 'instrument_type') || '').toUpperCase()
  if (type.includes('CARD')) return 'card'
  if (type.includes('BANK')) return 'bank_account'
  return type ? type.toLowerCase() : 'unknown'
}

function extractLast4(pi: unknown): string | null {
  const candidates = [
    getNestedValue(pi, 'card', 'last4'),
    getNestedValue(pi, 'last4'),
    getNestedValue(pi, 'last_four'),
    getNestedValue(pi, 'account_last4'),
    getNestedValue(pi, 'bank_account', 'last4'),
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length === 4) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) {
      const s = String(v)
      if (s.length === 4) return s
    }
  }
  return null
}

function extractCardBrand(pi: unknown): string | null {
  const candidates = [
    getNestedValue(pi, 'card', 'brand'),
    getNestedValue(pi, 'brand'),
    getNestedValue(pi, 'card_brand'),
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

function extractExpMonth(pi: unknown): number | null {
  const candidates = [getNestedValue(pi, 'card', 'exp_month'), getNestedValue(pi, 'exp_month')]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 12) return v
  }
  return null
}

function extractExpYear(pi: unknown): number | null {
  const candidates = [getNestedValue(pi, 'card', 'exp_year'), getNestedValue(pi, 'exp_year')]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 2020 && v <= 3000) return v
  }
  return null
}

function buildMethodLabel(pi: unknown): string | null {
  const type = normalizePaymentInstrumentType(pi)
  const last4 = extractLast4(pi)
  const brand = extractCardBrand(pi)

  if (type === 'card') {
    const prefix = brand ? brand : 'Card'
    return last4 ? `${prefix} •••• ${last4}` : `${prefix}`
  }

  if (type === 'bank_account') {
    return last4 ? `Bank account •••• ${last4}` : 'Bank account'
  }

  return null
}

function pickBillingInstrument(instruments: unknown[]): BillingInstrumentSelection | null {
  if (!Array.isArray(instruments) || instruments.length === 0) return null
  const enabled = instruments.filter((pi) => getNestedValue(pi, 'enabled') !== false)
  const list = enabled.length > 0 ? enabled : instruments

  const cards = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'card')
  const bankAccounts = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'bank_account')
  const first = cards[0] || bankAccounts[0] || list[0]

  const idRaw = getNestedValue(first, 'id')
  if (typeof idRaw !== 'string' || idRaw.trim().length === 0) return null
  return {
    id: idRaw,
    type: normalizePaymentInstrumentType(first),
    label: buildMethodLabel(first),
    last4: extractLast4(first),
    brand: extractCardBrand(first),
    exp_month: extractExpMonth(first),
    exp_year: extractExpYear(first),
  }
}

async function getUserOrganization(userId: string) {
  const supabase = await createClient()
  const { data: membership } = await supabase
    .from('organization_members')
    .select(
      `
      role,
      organization:organizations(id, name, settings)
    `
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!membership) return null

  const orgRaw = (membership as { organization?: unknown }).organization
  const organization = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
  if (!isJsonRecord(organization)) return null
  const organizationId = typeof organization.id === 'string' ? organization.id : null
  const organizationName = typeof organization.name === 'string' ? organization.name : null
  if (!organizationId || !organizationName) return null

  const settings = isJsonRecord(organization.settings)
    ? (organization.settings as OrganizationSettings)
    : null

  return {
    role: membership.role as string,
    isOwner: membership.role === 'owner',
    organization: {
      id: organizationId,
      name: organizationName,
      settings,
    },
  }
}

async function mergeOrgSettingsKey(orgId: string, key: string, patch: Record<string, unknown>) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('merge_organization_settings_key', {
    p_organization_id: orgId,
    p_settings_key: key,
    p_patch: patch,
  })

  if (error) {
    throw new Error(error.message || 'Failed updating organization settings')
  }

  return (data || {}) as Record<string, unknown>
}

async function saveBillingSettings(orgId: string, patch: Partial<OrganizationSettings['billing']>) {
  const payload = {
    ...(patch || {}),
    last_updated_at: new Date().toISOString(),
  } as Record<string, unknown>

  const billing = await mergeOrgSettingsKey(orgId, 'billing', payload)
  return billing as OrganizationSettings['billing']
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<BillingMethodRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const membership = await getUserOrganization(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const { organization, isOwner } = membership
    const billingSettings = organization.settings?.billing || {}

    if (body.action === 'status') {
      return NextResponse.json({
        success: true,
        data: {
          configured:
            typeof billingSettings.payment_method_id === 'string' &&
            billingSettings.payment_method_id.trim().length > 0,
          payment_method_label: billingSettings.payment_method_label || null,
          payment_method_type: billingSettings.payment_method_type || null,
          identity_id: billingSettings.identity_id || null,
          last_updated_at: billingSettings.last_updated_at || null,
        },
      })
    }

    if (!isOwner) {
      return NextResponse.json(
        { error: 'Only organization owners can perform this action' },
        { status: 403 }
      )
    }

    if (body.action === 'create_setup_link') {
      const onboardingFormId = normalizeOnboardingFormId(
        process.env.PROCESSOR_BILLING_ONBOARDING_FORM_ID ||
          process.env.PROCESSOR_ONBOARDING_FORM_ID ||
          null
      )
      if (!onboardingFormId) {
        return NextResponse.json(
          { error: 'Billing setup form id is not configured (expected obf_xxx format)' },
          { status: 503 }
        )
      }

      const setupState = crypto.randomUUID()
      const expirationInMinutes = 60
      const expiresAt = new Date(Date.now() + expirationInMinutes * 60 * 1000).toISOString()

      const appUrl = getAppUrl()
      const returnUrl = new URL('/billing', appUrl)
      returnUrl.searchParams.set('billing_setup', 'success')

      const expiredUrl = new URL('/billing', appUrl)
      expiredUrl.searchParams.set('billing_setup', 'expired')

      const link = await createOnboardingLink({
        onboardingFormId,
        appUrl,
        identityId: billingSettings.identity_id || null,
        applicationId: process.env.PROCESSOR_APPLICATION_ID || null,
        expirationInMinutes,
        state: setupState,
        returnUrl: returnUrl.toString(),
        expiredSessionUrl: expiredUrl.toString(),
      })

      const linkUrl =
        link?.link_url ||
        link?.onboarding_link_url ||
        link?._embedded?.links?.[0]?.link_url

      if (!linkUrl) {
        return NextResponse.json({ error: 'Failed to create billing setup link' }, { status: 500 })
      }

      await saveBillingSettings(organization.id, {
        onboarding_form_id: onboardingFormId,
        last_setup_link_id: link.id || null,
        last_setup_link_url: linkUrl,
        last_setup_link_expires_at: link.expires_at || null,
        last_setup_state: setupState,
        last_setup_state_expires_at: expiresAt,
      })

      return NextResponse.json({ success: true, data: { url: linkUrl } })
    }

    if (body.action === 'save_billing_method') {
      try {
        requireActiveSetupState(
          billingSettings.last_setup_state || null,
          billingSettings.last_setup_state_expires_at || null,
          body.state || null
        )
      } catch (err: unknown) {
        return NextResponse.json(
          { error: getErrorMessage(err, 'Invalid billing setup state') },
          { status: 403 }
        )
      }

      const identityId = body.identity_id || billingSettings.identity_id
      if (!identityId) {
        return NextResponse.json({ error: 'identity_id is required' }, { status: 400 })
      }

      let identity: { id?: string }
      try {
        identity = await fetchProcessorIdentity(identityId)
      } catch (err: unknown) {
        return NextResponse.json({ error: getErrorMessage(err, 'Invalid identity') }, { status: 400 })
      }

      const instruments = await fetchProcessorPaymentInstrumentsForIdentity(identityId).catch(() => [])
      const chosen = pickBillingInstrument(instruments)
      if (!chosen) {
        return NextResponse.json(
          { error: 'No billing payment method found for this identity' },
          { status: 400 }
        )
      }

      const saved = await saveBillingSettings(organization.id, {
        identity_id: identity.id || identityId,
        payment_method_id: chosen.id,
        payment_method_type: chosen.type,
        payment_method_label: chosen.label,
        payment_method_last4: chosen.last4,
        payment_method_brand: chosen.brand,
        payment_method_exp_month: chosen.exp_month,
        payment_method_exp_year: chosen.exp_year,
        // Clear state to prevent replay of the redirect URL.
        last_setup_state: null,
        last_setup_state_expires_at: null,
      })

      return NextResponse.json({
        success: true,
        data: {
          configured:
            typeof saved?.payment_method_id === 'string' && saved.payment_method_id.trim().length > 0,
          payment_method_label: saved?.payment_method_label || null,
          payment_method_type: saved?.payment_method_type || null,
        },
      })
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/billing-method',
  }
)
