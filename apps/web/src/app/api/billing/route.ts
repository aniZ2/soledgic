import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { getStripe, PLANS } from '@/lib/stripe'
import {
  getOrCreateStripeCustomer,
  getUserOrganization,
  planFromPriceId,
} from '@/lib/stripe-helpers'

interface BillingRequest {
  action: string
  price_id?: string
  plan_id?: string
}

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<BillingRequest>(request)
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || 'Invalid request body' },
        { status: 400 }
      )
    }

    const { action } = body

    // Get org membership
    const membership = await getUserOrganization(user!.id)
    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      )
    }

    const { organization: org, role, isOwner } = membership

    // Owner-only actions
    const ownerActions = [
      'create_checkout_session',
      'create_portal_session',
      'cancel_subscription',
      'resume_subscription',
      'get_invoices',
      'get_payment_methods',
      'activate_free_plan',
    ]
    if (ownerActions.includes(action) && !isOwner) {
      return NextResponse.json(
        { error: 'Only organization owners can perform this action' },
        { status: 403 }
      )
    }

    switch (action) {
      case 'get_subscription': {
        return handleGetSubscription(org, isOwner)
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
      case 'create_checkout_session': {
        return handleCreateCheckout(org, user!, body.price_id)
      }
      case 'create_portal_session': {
        return handleCreatePortal(org)
      }
      case 'cancel_subscription': {
        return handleCancelSubscription(org)
      }
      case 'resume_subscription': {
        return handleResumeSubscription(org)
      }
      case 'activate_free_plan': {
        return handleActivateFreePlan(org, body.plan_id)
      }
      default: {
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
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

// ── Action handlers ───────────────────────────────────────────────────

async function handleGetSubscription(org: Record<string, any>, isOwner: boolean) {
  const supabase = await createClient()

  let subscription = null

  if (org.stripe_subscription_id) {
    try {
      const sub = await getStripe().subscriptions.retrieve(org.stripe_subscription_id)
      const planName = planFromPriceId(sub.items.data[0]?.price.id || '')
      subscription = {
        id: sub.id,
        plan: planName || org.plan,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
      }
    } catch {
      // Subscription may have been deleted in Stripe
    }
  }

  // Query real usage stats
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id')
    .eq('organization_id', org.id)
    .eq('livemode', true)
    .eq('status', 'active')

  const ledgerIds = (ledgers || []).map((l: any) => l.id)

  let creators = 0
  let transactions = 0
  let apiCalls = 0

  if (ledgerIds.length > 0) {
    // Count creator balance accounts across live ledgers
    const { count: creatorCount } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .in('ledger_id', ledgerIds)
      .eq('account_type', 'creator_balance')

    creators = creatorCount || 0

    // Count transactions across live ledgers
    const { count: txCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('ledger_id', ledgerIds)

    transactions = txCount || 0

    // Count audit_log entries within the billing period
    let auditQuery = supabase
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .in('ledger_id', ledgerIds)

    if (subscription) {
      auditQuery = auditQuery
        .gte('created_at', subscription.current_period_start)
        .lte('created_at', subscription.current_period_end)
    }

    const { count: auditCount } = await auditQuery
    apiCalls = auditCount || 0
  }

  return NextResponse.json({
    success: true,
    data: {
      subscription,
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        trial_ends_at: org.trial_ends_at,
        status: org.status,
        max_ledgers: org.max_ledgers,
        current_ledger_count: ledgerIds.length,
      },
      usage: {
        ledgers: ledgerIds.length,
        creators,
        transactions,
        api_calls: apiCalls,
        period_start: subscription?.current_period_start || null,
        period_end: subscription?.current_period_end || null,
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
    features: config.features,
    stripe_price_id_monthly: config.stripe_price_id,
    contact_sales: config.contact_sales || false,
  }))

  return NextResponse.json({ success: true, data: plansList })
}

async function handleGetInvoices(org: Record<string, any>) {
  if (!org.stripe_customer_id) {
    return NextResponse.json({ success: true, data: [] })
  }

  try {
    const invoices = await getStripe().invoices.list({
      customer: org.stripe_customer_id,
      limit: 20,
    })

    const data = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total: inv.total,
      currency: inv.currency,
      created_at: new Date(inv.created * 1000).toISOString(),
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
    }))

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: true, data: [] })
  }
}

async function handleGetPaymentMethods(org: Record<string, any>) {
  if (!org.stripe_customer_id) {
    return NextResponse.json({ success: true, data: [] })
  }

  try {
    const customer = await getStripe().customers.retrieve(org.stripe_customer_id) as any
    const methods = await getStripe().paymentMethods.list({
      customer: org.stripe_customer_id,
      type: 'card',
    })

    const defaultPmId = customer.invoice_settings?.default_payment_method

    const data = methods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      card_brand: pm.card?.brand || '',
      card_last4: pm.card?.last4 || '',
      card_exp_month: pm.card?.exp_month || 0,
      card_exp_year: pm.card?.exp_year || 0,
      is_default: pm.id === defaultPmId,
    }))

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: true, data: [] })
  }
}

async function handleCreateCheckout(
  org: Record<string, any>,
  user: { id: string; email?: string },
  priceId?: string
) {
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_id is required' },
      { status: 400 }
    )
  }

  // Verify this is a valid plan price
  const planName = planFromPriceId(priceId)
  if (!planName) {
    return NextResponse.json(
      { error: 'Invalid price ID' },
      { status: 400 }
    )
  }

  const customerId = await getOrCreateStripeCustomer(
    org.id,
    org.name,
    user.email || ''
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=true`,
    cancel_url: `${appUrl}/billing?canceled=true`,
    consent_collection: {
      terms_of_service: 'required',
    },
    subscription_data: {
      metadata: { organization_id: org.id },
    },
    metadata: { organization_id: org.id },
  })

  return NextResponse.json({
    success: true,
    data: { url: session.url },
  })
}

async function handleCreatePortal(org: Record<string, any>) {
  if (!org.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe to a plan first.' },
      { status: 400 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/billing`,
  })

  return NextResponse.json({
    success: true,
    data: { url: session.url },
  })
}

async function handleCancelSubscription(org: Record<string, any>) {
  if (!org.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'No active subscription found' },
      { status: 400 }
    )
  }

  await getStripe().subscriptions.update(org.stripe_subscription_id, {
    cancel_at_period_end: true,
  })

  return NextResponse.json({ success: true, data: { canceled: true } })
}

async function handleResumeSubscription(org: Record<string, any>) {
  if (!org.stripe_subscription_id) {
    return NextResponse.json(
      { error: 'No subscription found' },
      { status: 400 }
    )
  }

  await getStripe().subscriptions.update(org.stripe_subscription_id, {
    cancel_at_period_end: false,
  })

  return NextResponse.json({ success: true, data: { resumed: true } })
}

async function handleActivateFreePlan(org: Record<string, any>, planId?: string) {
  if (!planId) {
    return NextResponse.json(
      { error: 'plan_id is required' },
      { status: 400 }
    )
  }

  const plan = PLANS[planId]
  if (!plan) {
    return NextResponse.json(
      { error: 'Invalid plan_id' },
      { status: 400 }
    )
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
    return NextResponse.json(
      { error: 'Failed to activate free plan' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data: { activated: true, plan: planId } })
}
