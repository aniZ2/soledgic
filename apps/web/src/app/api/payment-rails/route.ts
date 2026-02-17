import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'

interface PaymentRailsRequest {
  action: 'status' | 'create_onboarding_link' | 'save_identity' | 'save_payout_settings'
  identity_id?: string
  state?: string
  default_payout_method?: 'card' | 'manual'
  min_payout_amount?: number
}

interface OrganizationSettings {
  payouts?: {
    default_method?: string | null
    min_payout_amount?: number | null
  }
  [key: string]: any
}

function getPlatformProcessorSettings() {
  const merchantId = process.env.PROCESSOR_MERCHANT_ID || null
  const username = process.env.PROCESSOR_USERNAME || null
  const password = process.env.PROCESSOR_PASSWORD || null
  const configured = Boolean(merchantId && username && password)
  return { configured }
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

async function savePayoutSettings(orgId: string, patch: OrganizationSettings['payouts']) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('merge_organization_settings_key', {
    p_organization_id: orgId,
    p_settings_key: 'payouts',
    p_patch: patch as Record<string, unknown>,
  })

  if (error) {
    throw new Error(error.message || 'Failed updating organization settings')
  }

  return (data || {}) as OrganizationSettings['payouts']
}

function normalizeDefaultMethod(value: string | null | undefined): 'card' | 'manual' {
  return value === 'manual' ? 'manual' : 'card'
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<PaymentRailsRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const membership = await getUserOrganization(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const { organization, isOwner } = membership
    const payoutSettings = organization.settings?.payouts || {}
    const platform = getPlatformProcessorSettings()

    if (body.action === 'status') {
      const connected = platform.configured

      return NextResponse.json({
        success: true,
        data: {
          connected,
          platform_managed: true,
          identity_id: null,
          merchant_id: null,
          onboarding_form_id: null,
          last_synced_at: null,
          payout_settings: {
            default_method: normalizeDefaultMethod(payoutSettings.default_method || null),
            min_payout_amount:
              typeof payoutSettings.min_payout_amount === 'number'
                ? payoutSettings.min_payout_amount
                : 25,
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
      return NextResponse.json(
        { error: 'Card processing is managed by Soledgic and cannot be configured per workspace.' },
        { status: 409 }
      )
    }

    if (body.action === 'save_identity') {
      return NextResponse.json(
        { error: 'Card processing is managed by Soledgic and cannot be configured per workspace.' },
        { status: 409 }
      )
    }

    if (body.action === 'save_payout_settings') {
      const defaultMethod = body.default_payout_method || 'card'
      if (!['card', 'manual'].includes(defaultMethod)) {
        return NextResponse.json(
          { error: 'default_payout_method must be card or manual' },
          { status: 400 }
        )
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
            default_method: normalizeDefaultMethod(saved?.default_method || defaultMethod),
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
    routePath: '/api/payment-rails',
  }
)
