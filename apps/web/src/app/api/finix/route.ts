import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { getPublicAppUrl } from '@/lib/public-url'
import {
  createOnboardingLink,
  fetchFinixIdentity,
  fetchFinixMerchantForIdentity,
  fetchFinixPaymentInstrumentsForIdentity,
} from '@/lib/finix'

interface FinixRequest {
  action: 'status' | 'create_onboarding_link' | 'save_identity' | 'save_payout_settings'
  identity_id?: string
  state?: string
  default_payout_method?: 'finix' | 'manual'
  min_payout_amount?: number
}

interface OrganizationSettings {
  finix?: {
    identity_id?: string | null
    merchant_id?: string | null
    source_id?: string | null
    onboarding_form_id?: string | null
    last_onboarding_link_id?: string | null
    last_onboarding_link_url?: string | null
    last_onboarding_link_expires_at?: string | null
    last_onboarding_state?: string | null
    last_onboarding_state_expires_at?: string | null
    last_synced_at?: string | null
  }
  payouts?: {
    default_method?: string | null
    min_payout_amount?: number | null
  }
  [key: string]: any
}

function getAppUrl() {
  return getPublicAppUrl()
}

function pickFinixSourceInstrumentId(instruments: any[]): string | null {
  if (!Array.isArray(instruments) || instruments.length === 0) return null
  const enabled = instruments.filter((pi: any) => pi?.enabled !== false)
  const bankAccount = enabled.find((pi: any) => {
    const type = String(pi?.type || pi?.instrument_type || '').toUpperCase()
    return type === 'BANK_ACCOUNT'
  })
  return bankAccount?.id || enabled[0]?.id || instruments[0]?.id || null
}

async function getUserOrganization(userId: string) {
  const supabase = await createClient()
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(id, name, settings)
    `)
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

async function saveFinixSettings(orgId: string, patch: Partial<OrganizationSettings['finix']>) {
  const payload = {
    ...(patch || {}),
    last_synced_at: new Date().toISOString(),
  } as Record<string, unknown>

  const finix = await mergeOrgSettingsKey(orgId, 'finix', payload)
  return finix as OrganizationSettings['finix']
}

async function savePayoutSettings(orgId: string, patch: OrganizationSettings['payouts']) {
  const payouts = await mergeOrgSettingsKey(orgId, 'payouts', patch as Record<string, unknown>)
  return payouts as OrganizationSettings['payouts']
}

function isExpired(iso: string | null | undefined) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t <= Date.now() : false
}

function requireActiveOnboardingState(
  expected: string | null | undefined,
  expectedExpiresAt: string | null | undefined,
  provided: string | null | undefined
) {
  if (!expected || !provided || expected !== provided) {
    throw new Error('Invalid Finix onboarding state')
  }
  if (isExpired(expectedExpiresAt || null)) {
    throw new Error('Finix onboarding session expired. Start onboarding again.')
  }
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<FinixRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const membership = await getUserOrganization(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const { organization, isOwner } = membership
    const finixSettings = organization.settings?.finix || {}
    const payoutSettings = organization.settings?.payouts || {}

    if (body.action === 'status') {
      return NextResponse.json({
        success: true,
        data: {
          connected: Boolean(finixSettings.identity_id || finixSettings.merchant_id),
          identity_id: finixSettings.identity_id || null,
          merchant_id: finixSettings.merchant_id || null,
          source_id: finixSettings.source_id || null,
          onboarding_form_id: finixSettings.onboarding_form_id || process.env.FINIX_ONBOARDING_FORM_ID || null,
          last_synced_at: finixSettings.last_synced_at || null,
          payout_settings: {
            default_method: payoutSettings.default_method || 'finix',
            min_payout_amount: typeof payoutSettings.min_payout_amount === 'number' ? payoutSettings.min_payout_amount : 25,
          },
        },
      })
    }

    if (!isOwner) {
      return NextResponse.json(
        { error: 'Only organization owners can perform this action' },
        { status: 403 }
      )
    }

    if (body.action === 'create_onboarding_link') {
      const onboardingFormId = process.env.FINIX_ONBOARDING_FORM_ID
      if (!onboardingFormId) {
        return NextResponse.json(
          { error: 'FINIX_ONBOARDING_FORM_ID is not configured' },
          { status: 503 }
        )
      }

      const onboardingState = crypto.randomUUID()
      const expirationInMinutes = 60
      const expiresAt = new Date(Date.now() + expirationInMinutes * 60 * 1000).toISOString()

      const link = await createOnboardingLink({
        onboardingFormId,
        appUrl: getAppUrl(),
        identityId: finixSettings.identity_id || null,
        applicationId: process.env.FINIX_APPLICATION_ID || null,
        expirationInMinutes,
        state: onboardingState,
      })

      const linkUrl = link?.link_url || link?.onboarding_link_url || link?._embedded?.links?.[0]?.link_url
      if (!linkUrl) {
        return NextResponse.json({ error: 'Failed to create Finix onboarding link' }, { status: 500 })
      }

      const saved = await saveFinixSettings(organization.id, {
        onboarding_form_id: onboardingFormId,
        last_onboarding_link_id: link.id || null,
        last_onboarding_link_url: linkUrl,
        last_onboarding_link_expires_at: link.expires_at || null,
        last_onboarding_state: onboardingState,
        last_onboarding_state_expires_at: expiresAt,
      })

      return NextResponse.json({
        success: true,
        data: {
          url: linkUrl,
          finix: saved,
        },
      })
    }

    if (body.action === 'save_identity') {
      try {
        requireActiveOnboardingState(
          finixSettings.last_onboarding_state || null,
          finixSettings.last_onboarding_state_expires_at || null,
          body.state || null
        )
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || 'Invalid onboarding state' },
          { status: 403 }
        )
      }

      const identityId = body.identity_id || finixSettings.identity_id
      if (!identityId) {
        return NextResponse.json({ error: 'identity_id is required' }, { status: 400 })
      }

      let identity: any
      try {
        identity = await fetchFinixIdentity(identityId)
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || 'Invalid Finix identity' },
          { status: 400 }
        )
      }
      const merchant = await fetchFinixMerchantForIdentity(identityId).catch(() => null)
      const paymentInstruments = await fetchFinixPaymentInstrumentsForIdentity(identityId).catch(() => [])
      const sourceId = pickFinixSourceInstrumentId(paymentInstruments)

      const saved = (await saveFinixSettings(organization.id, {
        identity_id: identity.id || identityId,
        merchant_id: merchant?.id || finixSettings.merchant_id || null,
        source_id: sourceId || finixSettings.source_id || null,
        // Clear state to prevent replay of the redirect URL.
        last_onboarding_state: null,
        last_onboarding_state_expires_at: null,
      })) || {}

      return NextResponse.json({
          success: true,
          data: {
          connected: Boolean((saved as any).identity_id || (saved as any).merchant_id),
          identity_id: (saved as any).identity_id || null,
          merchant_id: (saved as any).merchant_id || null,
          source_id: (saved as any).source_id || null,
          },
        })
      }

    if (body.action === 'save_payout_settings') {
      const defaultMethod = body.default_payout_method || 'finix'
      if (!['finix', 'manual'].includes(defaultMethod)) {
        return NextResponse.json({ error: 'default_payout_method must be finix or manual' }, { status: 400 })
      }

      const min = body.min_payout_amount
      if (typeof min !== 'number' || !Number.isFinite(min) || min < 1 || min > 1000000) {
        return NextResponse.json({ error: 'min_payout_amount must be a number >= 1' }, { status: 400 })
      }

      const saved = await savePayoutSettings(organization.id, {
        default_method: defaultMethod,
        min_payout_amount: min,
      })

      return NextResponse.json({
        success: true,
        data: {
          payout_settings: {
            default_method: saved?.default_method || defaultMethod,
            min_payout_amount: saved?.min_payout_amount ?? min,
          },
        },
      })
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/finix',
  }
)
