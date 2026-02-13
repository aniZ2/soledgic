import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { getPublicAppUrl } from '@/lib/public-url'
import {
  createOnboardingLink,
  fetchFinixIdentity,
  fetchFinixPaymentInstrumentsForIdentity,
} from '@/lib/finix'

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
  [key: string]: any
}

function getAppUrl() {
  return getPublicAppUrl()
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

function normalizePaymentInstrumentType(pi: any): string {
  const type = String(pi?.type || pi?.instrument_type || '').toUpperCase()
  if (type.includes('CARD')) return 'card'
  if (type.includes('BANK')) return 'bank_account'
  return type ? type.toLowerCase() : 'unknown'
}

function extractLast4(pi: any): string | null {
  const candidates = [
    pi?.card?.last4,
    pi?.last4,
    pi?.last_four,
    pi?.account_last4,
    pi?.bank_account?.last4,
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

function extractCardBrand(pi: any): string | null {
  const candidates = [pi?.card?.brand, pi?.brand, pi?.card_brand]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

function extractExpMonth(pi: any): number | null {
  const candidates = [pi?.card?.exp_month, pi?.exp_month]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 12) return v
  }
  return null
}

function extractExpYear(pi: any): number | null {
  const candidates = [pi?.card?.exp_year, pi?.exp_year]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 2020 && v <= 3000) return v
  }
  return null
}

function buildMethodLabel(pi: any): string | null {
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

function pickBillingInstrument(instruments: any[]) {
  if (!Array.isArray(instruments) || instruments.length === 0) return null
  const enabled = instruments.filter((pi: any) => pi?.enabled !== false)
  const list = enabled.length > 0 ? enabled : instruments

  const cards = list.filter((pi: any) => normalizePaymentInstrumentType(pi) === 'card')
  const bankAccounts = list.filter((pi: any) => normalizePaymentInstrumentType(pi) === 'bank_account')
  const first = cards[0] || bankAccounts[0] || list[0]

  if (!first?.id) return null
  return {
    id: String(first.id),
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

  const orgRaw = membership?.organization as any
  const organization = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
  if (!organization) return null

  return {
    role: membership.role as string,
    isOwner: membership.role === 'owner',
    organization: organization as {
      id: string
      name: string
      settings?: OrganizationSettings | null
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
      const onboardingFormId =
        process.env.FINIX_BILLING_ONBOARDING_FORM_ID || process.env.FINIX_ONBOARDING_FORM_ID
      if (!onboardingFormId) {
        return NextResponse.json(
          { error: 'Billing method setup is not configured' },
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
        applicationId: process.env.FINIX_APPLICATION_ID || null,
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
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || 'Invalid billing setup state' },
          { status: 403 }
        )
      }

      const identityId = body.identity_id || billingSettings.identity_id
      if (!identityId) {
        return NextResponse.json({ error: 'identity_id is required' }, { status: 400 })
      }

      let identity: any
      try {
        identity = await fetchFinixIdentity(identityId)
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Invalid identity' }, { status: 400 })
      }

      const instruments = await fetchFinixPaymentInstrumentsForIdentity(identityId).catch(() => [])
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

