import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { PLANS } from '@/lib/plans'

interface BillingRequest {
  action:
    | 'get_subscription'
    | 'get_plans'
    | 'get_invoices'
    | 'get_payment_methods'
    | 'activate_free_plan'
    | 'create_checkout_session'
    | 'create_portal_session'
    | 'cancel_subscription'
    | 'resume_subscription'
  plan_id?: string
}

async function getUserOrganization(userId: string) {
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!membership?.organization) return null

  return {
    organization: membership.organization as Record<string, any>,
    role: membership.role as string,
    isOwner: membership.role === 'owner',
  }
}

function disabledSubscriptionBilling() {
  return NextResponse.json(
    {
      success: false,
      error: 'Subscription billing is currently disabled for this environment.',
    },
    { status: 410 }
  )
}

function currentBillingPeriodUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))
  return { start, end }
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<BillingRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const membership = await getUserOrganization(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const { organization: org, isOwner } = membership

    const ownerActions = [
      'create_checkout_session',
      'create_portal_session',
      'cancel_subscription',
      'resume_subscription',
      'get_invoices',
      'get_payment_methods',
      'activate_free_plan',
    ]
    if (ownerActions.includes(body.action) && !isOwner) {
      return NextResponse.json(
        { error: 'Only organization owners can perform this action' },
        { status: 403 }
      )
    }

    switch (body.action) {
      case 'get_subscription': {
        return handleGetSubscription(org, isOwner)
      }
      case 'get_plans': {
        return handleGetPlans()
      }
      case 'get_invoices': {
        return NextResponse.json({ success: true, data: [] })
      }
      case 'get_payment_methods': {
        return NextResponse.json({ success: true, data: [] })
      }
      case 'activate_free_plan': {
        return handleActivateFreePlan(org, body.plan_id)
      }
      case 'create_checkout_session':
      case 'create_portal_session':
      case 'cancel_subscription':
      case 'resume_subscription': {
        return disabledSubscriptionBilling()
      }
      default: {
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
      }
    }
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/billing',
  }
)

async function handleGetSubscription(org: Record<string, any>, isOwner: boolean) {
  const supabase = await createClient()

  const { start, end } = currentBillingPeriodUtc()

  // Query real usage stats
  const [{ data: ledgers }, { count: memberCount }] = await Promise.all([
    supabase
      .from('ledgers')
      .select('id')
      .eq('organization_id', org.id)
      .eq('livemode', true)
      .eq('status', 'active'),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('status', 'active'),
  ])

  const ledgerIds = (ledgers || []).map((l: any) => l.id)
  const currentMemberCount = memberCount || 0
  const planConfig = PLANS[org.plan] || PLANS.pro

  const includedLedgers =
    typeof planConfig?.max_ledgers === 'number'
      ? planConfig.max_ledgers
      : (org.max_ledgers ?? 1)
  const includedTeamMembers =
    typeof planConfig?.max_team_members === 'number'
      ? planConfig.max_team_members
      : (org.max_team_members ?? 1)

  const ledgerOveragePrice =
    org.overage_ledger_price ??
    planConfig?.overage_ledger_price_monthly ??
    2000
  const teamMemberOveragePrice =
    org.overage_team_member_price ??
    planConfig?.overage_team_member_price_monthly ??
    2000

  const additionalLedgers =
    includedLedgers === -1 ? 0 : Math.max(0, ledgerIds.length - includedLedgers)
  const additionalTeamMembers =
    includedTeamMembers === -1 ? 0 : Math.max(0, currentMemberCount - includedTeamMembers)

  const estimatedMonthlyOverageCents =
    additionalLedgers * ledgerOveragePrice +
    additionalTeamMembers * teamMemberOveragePrice

  const processorSettings =
    org?.settings && typeof org.settings === 'object' ? (org.settings.finix || {}) : {}
  const billingMethodConfigured =
    typeof processorSettings?.source_id === 'string' && processorSettings.source_id.trim().length > 0
  const processorConnected =
    typeof processorSettings?.merchant_id === 'string' ||
    typeof processorSettings?.identity_id === 'string'

  let lastCharge: Record<string, any> | null = null
  if (isOwner) {
    const { data: charge } = await supabase
      .from('billing_overage_charges')
      .select(
        'period_start, period_end, amount_cents, status, attempts, last_attempt_at, processor_payment_id, error'
      )
      .eq('organization_id', org.id)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    lastCharge = charge || null
  }

  let creators = 0
  let transactions = 0
  let apiCalls = 0

  if (ledgerIds.length > 0) {
    const [{ count: creatorCount }, { count: txCount }, { count: auditCount }] = await Promise.all([
      supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .in('ledger_id', ledgerIds)
        .eq('account_type', 'creator_balance'),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .in('ledger_id', ledgerIds),
      supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .in('ledger_id', ledgerIds)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString()),
    ])

    creators = creatorCount || 0
    transactions = txCount || 0
    apiCalls = auditCount || 0
  }

  return NextResponse.json({
    success: true,
    data: {
      subscription: null,
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        trial_ends_at: org.trial_ends_at,
        status: org.status,
        max_ledgers: org.max_ledgers,
        max_team_members: org.max_team_members,
        current_ledger_count: ledgerIds.length,
        current_member_count: currentMemberCount,
        included_ledgers: includedLedgers,
        included_team_members: includedTeamMembers,
        overage_ledger_price: ledgerOveragePrice,
        overage_team_member_price: teamMemberOveragePrice,
      },
      usage: {
        ledgers: ledgerIds.length,
        team_members: currentMemberCount,
        creators,
        transactions,
        api_calls: apiCalls,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      },
      overage: {
        additional_ledgers: additionalLedgers,
        additional_team_members: additionalTeamMembers,
        overage_ledger_price: ledgerOveragePrice,
        overage_team_member_price: teamMemberOveragePrice,
        estimated_monthly_cents: estimatedMonthlyOverageCents,
      },
      billing: {
        method_configured: billingMethodConfigured,
        processor_connected: Boolean(processorConnected),
        last_charge: lastCharge,
      },
      is_owner: isOwner,
    },
  })
}

async function handleGetPlans() {
  const plansList = Object.entries(PLANS).map(([id, config]) => ({
    id,
    name: config.name,
    price_monthly: config.price_monthly,
    max_ledgers: config.max_ledgers,
    max_team_members: config.max_team_members,
    overage_ledger_price_monthly: config.overage_ledger_price_monthly ?? 2000,
    overage_team_member_price_monthly: config.overage_team_member_price_monthly ?? 2000,
    features: config.features,
    price_id_monthly: config.stripe_price_id,
    contact_sales: config.contact_sales || false,
  }))

  return NextResponse.json({ success: true, data: plansList })
}

async function handleActivateFreePlan(org: Record<string, any>, planId?: string) {
  if (!planId) {
    return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })
  }

  const plan = PLANS[planId]
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      plan: planId,
      status: 'active',
      trial_ends_at: null,
      max_ledgers: plan.max_ledgers,
      max_team_members: plan.max_team_members,
    })
    .eq('id', org.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to activate plan' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { activated: true, plan: planId } })
}
