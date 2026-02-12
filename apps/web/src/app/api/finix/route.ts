import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import {
  createOnboardingLink,
  fetchFinixIdentity,
  fetchFinixMerchantForIdentity,
  fetchFinixPaymentInstrumentsForIdentity,
} from '@/lib/finix'

interface FinixRequest {
  action: 'status' | 'create_onboarding_link' | 'save_identity'
  identity_id?: string
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
    last_synced_at?: string | null
  }
  [key: string]: any
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
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

async function saveFinixSettings(orgId: string, patch: Partial<OrganizationSettings['finix']>) {
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  const settings = (org?.settings || {}) as OrganizationSettings
  const nextSettings: OrganizationSettings = {
    ...settings,
    finix: {
      ...(settings.finix || {}),
      ...patch,
      last_synced_at: new Date().toISOString(),
    },
  }

  await supabase
    .from('organizations')
    .update({ settings: nextSettings })
    .eq('id', orgId)

  return nextSettings.finix || {}
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

      const link = await createOnboardingLink({
        onboardingFormId,
        appUrl: getAppUrl(),
        identityId: finixSettings.identity_id || null,
        applicationId: process.env.FINIX_APPLICATION_ID || null,
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
      const identityId = body.identity_id || finixSettings.identity_id
      if (!identityId) {
        return NextResponse.json({ error: 'identity_id is required' }, { status: 400 })
      }

      const identity = await fetchFinixIdentity(identityId)
      const merchant = await fetchFinixMerchantForIdentity(identityId).catch(() => null)
      const paymentInstruments = await fetchFinixPaymentInstrumentsForIdentity(identityId).catch(() => [])
      const sourceId = pickFinixSourceInstrumentId(paymentInstruments)

      const saved = await saveFinixSettings(organization.id, {
        identity_id: identity.id || identityId,
        merchant_id: merchant?.id || finixSettings.merchant_id || null,
        source_id: sourceId || finixSettings.source_id || null,
      })

      return NextResponse.json({
        success: true,
        data: {
          connected: Boolean(saved.identity_id || saved.merchant_id),
          identity_id: saved.identity_id || null,
          merchant_id: saved.merchant_id || null,
          source_id: saved.source_id || null,
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
