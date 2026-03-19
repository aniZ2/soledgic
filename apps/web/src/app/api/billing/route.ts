import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { PLANS } from '@/lib/plans'
import { type BillingPricingMode, isAutoChargeEnabled, isBillingBypassed, parseBillingSettings, resolveBillingMode } from '@/lib/billing-policy'
import { isPlatformOperatorUser } from '@/lib/internal-platforms'
import {
  isStripeConfigured,
  findOrCreateCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  cancelSubscription,
  resumeSubscription,
  listInvoices,
  listPaymentMethods,
} from '@/lib/stripe'
import { getPublicAppUrl } from '@/lib/public-url'

const DUNNING_RETRY_SCHEDULE_DAYS = [0, 3, 7] as const
const MAX_DUNNING_ATTEMPTS = DUNNING_RETRY_SCHEDULE_DAYS.length

interface BillingRequest {
  action:
    | 'get_subscription'
    | 'get_plans'
    | 'get_invoices'
    | 'get_payment_methods'
    | 'activate_free_plan'
    | 'update_billing_policy'
    | 'create_checkout_session'
    | 'create_portal_session'
    | 'cancel_subscription'
    | 'resume_subscription'
  plan_id?: string
  pricing_mode?: BillingPricingMode
}

type JsonRecord = Record<string, unknown>

interface OrganizationRecord {
  id: string
  name: string
  plan: string
  trial_ends_at: string | null
  status: string
  max_ledgers: number | null
  max_team_members: number | null
  overage_ledger_price: number | null
  overage_team_member_price: number | null
  max_transactions_per_month: number | null
  overage_transaction_price: number | null
  settings: JsonRecord | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

interface BillingOverageChargeRow {
  period_start: string | null
  period_end: string | null
  amount_cents: number | null
  status: string | null
  attempts: number | null
  last_attempt_at: string | null
  processor_payment_id: string | null
  error: string | null
  retries_remaining?: number
  next_retry_at?: string | null
  dunning_exhausted?: boolean
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOrganization(value: unknown): OrganizationRecord | null {
  if (!isJsonRecord(value)) return null

  const id = typeof value.id === 'string' ? value.id : null
  const name = typeof value.name === 'string' ? value.name : null
  if (!id || !name) return null

  return {
    id,
    name,
    plan: typeof value.plan === 'string' ? value.plan : 'pro',
    trial_ends_at: typeof value.trial_ends_at === 'string' ? value.trial_ends_at : null,
    status: typeof value.status === 'string' ? value.status : 'active',
    max_ledgers: typeof value.max_ledgers === 'number' ? value.max_ledgers : null,
    max_team_members: typeof value.max_team_members === 'number' ? value.max_team_members : null,
    overage_ledger_price: typeof value.overage_ledger_price === 'number' ? value.overage_ledger_price : null,
    overage_team_member_price:
      typeof value.overage_team_member_price === 'number' ? value.overage_team_member_price : null,
    max_transactions_per_month:
      typeof value.max_transactions_per_month === 'number' ? value.max_transactions_per_month : null,
    overage_transaction_price:
      typeof value.overage_transaction_price === 'number' ? value.overage_transaction_price : null,
    settings: isJsonRecord(value.settings) ? value.settings : null,
    stripe_customer_id: typeof value.stripe_customer_id === 'string' ? value.stripe_customer_id : null,
    stripe_subscription_id: typeof value.stripe_subscription_id === 'string' ? value.stripe_subscription_id : null,
  }
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

  if (!membership) return null

  const orgRaw = (membership as { organization?: unknown } | null)?.organization
  const organization = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
  const parsedOrganization = parseOrganization(organization)
  if (!parsedOrganization) return null

  return {
    organization: parsedOrganization,
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

function currentBillingPeriodUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))
  return { start, end }
}

function parseIsoTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

function retryDelayDaysAfterAttempt(attemptsCompleted: number): number | null {
  const nextAttemptIndex = attemptsCompleted
  if (nextAttemptIndex < 0 || nextAttemptIndex >= DUNNING_RETRY_SCHEDULE_DAYS.length) return null

  const previousAttemptIndex = Math.max(0, nextAttemptIndex - 1)
  const delay =
    DUNNING_RETRY_SCHEDULE_DAYS[nextAttemptIndex] -
    DUNNING_RETRY_SCHEDULE_DAYS[previousAttemptIndex]
  return delay >= 0 ? delay : null
}

function computeNextRetryAt(
  attemptsCompleted: number,
  lastAttemptAtIso: string | null
): string | null {
  const delayDays = retryDelayDaysAfterAttempt(attemptsCompleted)
  if (delayDays === null) return null

  const last = parseIsoTime(lastAttemptAtIso)
  if (!last) return null

  const next = new Date(last.getTime() + delayDays * 24 * 60 * 60 * 1000)
  return next.toISOString()
}

function retriesRemainingAfterAttempt(attemptNumber: number): number {
  return Math.max(0, MAX_DUNNING_ATTEMPTS - attemptNumber)
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()
    const { data: body, error: parseError } = await parseJsonBody<BillingRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const membership = await getUserOrganization(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const canManageOperatorModes = isPlatformOperatorUser(authUser)
    const { organization: org, isOwner } = membership

    const ownerActions = [
      'create_checkout_session',
      'create_portal_session',
      'cancel_subscription',
      'resume_subscription',
      'get_invoices',
      'get_payment_methods',
      'activate_free_plan',
      'update_billing_policy',
    ]
    if (ownerActions.includes(body.action) && !isOwner) {
      return NextResponse.json(
        { error: 'Only organization owners can perform this action' },
        { status: 403 }
      )
    }

    switch (body.action) {
      case 'get_subscription': {
        return handleGetSubscription(org, isOwner, canManageOperatorModes)
      }
      case 'get_plans': {
        return handleGetPlans()
      }
      case 'get_invoices': {
        return handleGetInvoices(org)
      }
      case 'get_payment_methods': {
        return handleGetPaymentMethods(org)
      }
      case 'activate_free_plan': {
        return handleActivateFreePlan(org, body.plan_id)
      }
      case 'update_billing_policy': {
        return handleUpdateBillingPolicy(org, body.pricing_mode, user!, canManageOperatorModes)
      }
      case 'create_checkout_session': {
        return handleCreateCheckoutSession(org, body.plan_id, user!)
      }
      case 'create_portal_session': {
        return handleCreatePortalSession(org, user!)
      }
      case 'cancel_subscription': {
        return handleCancelSubscription(org)
      }
      case 'resume_subscription': {
        return handleResumeSubscription(org)
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

async function handleGetSubscriptionCore(org: OrganizationRecord, isOwner: boolean) {
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

  const ledgerIds = (ledgers || [])
    .map((l: { id?: unknown }) => (typeof l.id === 'string' ? l.id : null))
    .filter((id): id is string => Boolean(id))
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

  // Transaction overage
  const maxTransactions =
    org.max_transactions_per_month ??
    planConfig?.max_transactions_per_month ??
    1000
  const transactionOveragePrice =
    org.overage_transaction_price ??
    planConfig?.overage_transaction_price ??
    2

  const estimatedMonthlyOverageCents =
    additionalLedgers * ledgerOveragePrice +
    additionalTeamMembers * teamMemberOveragePrice

  const settingsObj = org.settings || {}
  const billingSettings = isJsonRecord(settingsObj.billing) ? settingsObj.billing : {}
  const parsedBillingSettings = parseBillingSettings(billingSettings)
  const pricingMode = resolveBillingMode(parsedBillingSettings)
  const autoChargeEnabled = isAutoChargeEnabled(parsedBillingSettings)
  const bypassEnabled = isBillingBypassed(parsedBillingSettings)

  const billingMethodIdRaw =
    typeof parsedBillingSettings.payment_method_id === 'string' ? parsedBillingSettings.payment_method_id.trim() : ''
  const billingMethodConfigured = billingMethodIdRaw.length > 0
  const billingMethodLabel =
    typeof billingSettings?.payment_method_label === 'string' && billingSettings.payment_method_label.trim().length > 0
      ? billingSettings.payment_method_label.trim()
      : null

  // Shared-merchant model: processing is platform-managed (env-configured),
  // not configured per workspace.
  const processorConnected = isStripeConfigured() || Boolean(
    process.env.PROCESSOR_USERNAME &&
      process.env.PROCESSOR_PASSWORD &&
      process.env.PROCESSOR_MERCHANT_ID
  )

  let lastCharge: BillingOverageChargeRow | null = null
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

    lastCharge = (charge || null) as BillingOverageChargeRow | null
    if (lastCharge && String(lastCharge.status || '').toLowerCase() === 'failed') {
      const attempts =
        typeof lastCharge.attempts === 'number' && Number.isFinite(lastCharge.attempts)
          ? Math.max(0, Math.trunc(lastCharge.attempts))
          : 0
      lastCharge.retries_remaining = retriesRemainingAfterAttempt(attempts)
      lastCharge.next_retry_at = computeNextRetryAt(attempts, lastCharge.last_attempt_at)
      lastCharge.dunning_exhausted = attempts >= MAX_DUNNING_ATTEMPTS
    }
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
        .in('ledger_id', ledgerIds)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString()),
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

  const additionalTransactions =
    maxTransactions === -1 ? 0 : Math.max(0, transactions - maxTransactions)
  const transactionOverageCents = additionalTransactions * transactionOveragePrice
  const totalEstimatedOverageCents = estimatedMonthlyOverageCents + transactionOverageCents

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
        additional_transactions: additionalTransactions,
        overage_ledger_price: ledgerOveragePrice,
        overage_team_member_price: teamMemberOveragePrice,
        overage_transaction_price: transactionOveragePrice,
        max_transactions_per_month: maxTransactions,
        estimated_monthly_cents: totalEstimatedOverageCents,
        billable_monthly_cents: autoChargeEnabled ? totalEstimatedOverageCents : 0,
      },
      billing: {
        method_configured: billingMethodConfigured,
        method_label: billingMethodLabel,
        processor_connected: processorConnected,
        last_charge: lastCharge,
        policy: {
          pricing_mode: pricingMode,
          bypass_enabled: bypassEnabled,
          auto_charge_enabled: autoChargeEnabled,
          can_manage_modes: false,
        },
      },
      is_owner: isOwner,
    },
  })
}

async function handleGetSubscription(
  org: OrganizationRecord,
  isOwner: boolean,
  canManageOperatorModes: boolean,
) {
  const response = await handleGetSubscriptionCore(org, isOwner)
  const payload = await response.json() as { success?: boolean; data?: Record<string, unknown> }

  if (payload.success && payload.data && isJsonRecord(payload.data.billing)) {
    const billingRecord = payload.data.billing as JsonRecord
    const existingPolicy = isJsonRecord(billingRecord.policy) ? billingRecord.policy : {}
    payload.data.billing = {
      ...billingRecord,
      policy: {
        ...existingPolicy,
        can_manage_modes: isOwner && canManageOperatorModes,
      },
    }
  }

  return NextResponse.json(payload, { status: response.status })
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
    max_transactions_per_month: config.max_transactions_per_month ?? 1000,
    overage_transaction_price: config.overage_transaction_price ?? 2,
    features: config.features,
    price_id_monthly: null,
    contact_sales: config.contact_sales || false,
  }))

  return NextResponse.json({ success: true, data: plansList })
}

async function handleUpdateBillingPolicy(
  org: OrganizationRecord,
  pricingMode: BillingPricingMode | undefined,
  user: { id: string; email?: string },
  canManageOperatorModes: boolean,
) {
  if (!pricingMode || !['self_serve', 'custom', 'internal'].includes(pricingMode)) {
    return NextResponse.json({ error: 'pricing_mode must be self_serve, custom, or internal' }, { status: 400 })
  }

  if (pricingMode !== 'self_serve' && !canManageOperatorModes) {
    return NextResponse.json(
      { error: 'Only platform operators can enable internal or custom billing modes' },
      { status: 403 },
    )
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    pricing_mode: pricingMode,
    billing_bypass: pricingMode === 'internal',
    bypass_reason: pricingMode === 'internal' ? 'internal_platform' : null,
    bypass_enabled_at: pricingMode === 'internal' ? now : null,
    bypass_enabled_by: pricingMode === 'internal' ? (user.email || user.id) : null,
    last_updated_at: now,
  }

  try {
    await mergeOrgSettingsKey(org.id, 'billing', patch)

    if (pricingMode === 'internal' && org.status !== 'active') {
      const supabase = await createClient()
      await supabase
        .from('organizations')
        .update({ status: 'active' })
        .eq('id', org.id)
    }

    return NextResponse.json({
      success: true,
      data: {
        policy: {
          pricing_mode: pricingMode,
          bypass_enabled: pricingMode === 'internal',
          auto_charge_enabled: pricingMode === 'self_serve',
        },
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update billing policy' },
      { status: 500 },
    )
  }
}

async function handleActivateFreePlan(org: OrganizationRecord, planId?: string) {
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
      overage_ledger_price: plan.overage_ledger_price_monthly ?? 2000,
      overage_team_member_price: plan.overage_team_member_price_monthly ?? 2000,
      max_transactions_per_month: plan.max_transactions_per_month ?? 1000,
      overage_transaction_price: plan.overage_transaction_price ?? 2,
    })
    .eq('id', org.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to activate plan' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { activated: true, plan: planId } })
}

// ============================================================================
// Stripe-powered billing actions
// ============================================================================

async function ensureStripeCustomer(
  org: OrganizationRecord,
  user: { id: string; email?: string }
): Promise<{ customerId: string; error?: string }> {
  if (!isStripeConfigured()) {
    return { customerId: '', error: 'Stripe is not configured' }
  }

  try {
    const customer = await findOrCreateCustomer({
      email: user.email || '',
      name: org.name,
      organizationId: org.id,
      existingCustomerId: org.stripe_customer_id,
    })

    // Persist customer ID if it's new or changed
    if (customer.id !== org.stripe_customer_id) {
      const supabase = await createClient()
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customer.id })
        .eq('id', org.id)
    }

    return { customerId: customer.id }
  } catch (error: unknown) {
    return {
      customerId: '',
      error: error instanceof Error ? error.message : 'Failed to create Stripe customer',
    }
  }
}

async function handleCreateCheckoutSession(
  org: OrganizationRecord,
  planId: string | undefined,
  user: { id: string; email?: string }
) {
  if (!isStripeConfigured()) return disabledSubscriptionBilling()

  if (!planId) {
    return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })
  }

  const plan = PLANS[planId]
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan_id' }, { status: 400 })
  }

  if (!plan.stripe_price_id) {
    return NextResponse.json(
      { error: 'This plan does not have Stripe pricing configured yet' },
      { status: 400 }
    )
  }

  const { customerId, error: customerError } = await ensureStripeCustomer(org, user)
  if (customerError) {
    return NextResponse.json({ error: customerError }, { status: 500 })
  }

  try {
    const appUrl = getPublicAppUrl()
    const session = await createCheckoutSession({
      customerId,
      priceId: plan.stripe_price_id,
      successUrl: `${appUrl}/billing?checkout=success`,
      cancelUrl: `${appUrl}/billing?checkout=canceled`,
      organizationId: org.id,
    })

    return NextResponse.json({ success: true, data: { url: session.url } })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

async function handleCreatePortalSession(
  org: OrganizationRecord,
  user: { id: string; email?: string }
) {
  if (!isStripeConfigured()) return disabledSubscriptionBilling()

  const { customerId, error: customerError } = await ensureStripeCustomer(org, user)
  if (customerError) {
    return NextResponse.json({ error: customerError }, { status: 500 })
  }

  try {
    const appUrl = getPublicAppUrl()
    const session = await createBillingPortalSession({
      customerId,
      returnUrl: `${appUrl}/billing`,
    })

    return NextResponse.json({ success: true, data: { url: session.url } })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create portal session' },
      { status: 500 }
    )
  }
}

async function handleCancelSubscription(org: OrganizationRecord) {
  if (!isStripeConfigured()) return disabledSubscriptionBilling()

  if (!org.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  try {
    const subscription = await cancelSubscription(org.stripe_subscription_id)
    return NextResponse.json({
      success: true,
      data: {
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
}

async function handleResumeSubscription(org: OrganizationRecord) {
  if (!isStripeConfigured()) return disabledSubscriptionBilling()

  if (!org.stripe_subscription_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
  }

  try {
    const subscription = await resumeSubscription(org.stripe_subscription_id)
    return NextResponse.json({
      success: true,
      data: {
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resume subscription' },
      { status: 500 }
    )
  }
}

async function handleGetInvoices(org: OrganizationRecord) {
  if (!isStripeConfigured() || !org.stripe_customer_id) {
    return NextResponse.json({ success: true, data: [] })
  }

  try {
    const invoices = await listInvoices(org.stripe_customer_id)
    const data = invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      period_start: inv.period_start
        ? new Date(inv.period_start * 1000).toISOString()
        : null,
      period_end: inv.period_end
        ? new Date(inv.period_end * 1000).toISOString()
        : null,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
      created: inv.created
        ? new Date(inv.created * 1000).toISOString()
        : null,
    }))

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: true, data: [] })
  }
}

async function handleGetPaymentMethods(org: OrganizationRecord) {
  if (!isStripeConfigured() || !org.stripe_customer_id) {
    return NextResponse.json({ success: true, data: [] })
  }

  try {
    const methods = await listPaymentMethods(org.stripe_customer_id)
    const data = methods.map((pm) => ({
      id: pm.id,
      type: pm.type,
      brand: pm.card?.brand || null,
      last4: pm.card?.last4 || null,
      exp_month: pm.card?.exp_month || null,
      exp_year: pm.card?.exp_year || null,
    }))

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: true, data: [] })
  }
}
