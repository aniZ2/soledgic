// Soledgic Edge Function: Billing Management API
// POST /billing
// Manage subscriptions, checkout, invoices, usage
// MIGRATED TO createHandler - Uses JWT auth (not API keys)

import Stripe from 'https://esm.sh/stripe@14.5.0'
import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  getSupabaseClient,
  getClientIp,
  generateRequestId
} from '../_shared/utils.ts'

interface BillingRequest {
  action: 'get_subscription' | 'get_usage' | 'get_invoices' | 'get_payment_methods' |
          'create_checkout_session' | 'create_portal_session' | 'update_subscription' |
          'cancel_subscription' | 'resume_subscription' | 'add_payment_method' |
          'set_default_payment_method' | 'get_plans' | 'report_usage'
  organization_id?: string
  price_id?: string
  quantity?: number
  return_url?: string
  cancel_url?: string
  payment_method_id?: string
  usage_type?: string
  usage_quantity?: number
}

const handler = createHandler(
  { 
    endpoint: 'billing', 
    requireAuth: false,  // Uses JWT auth (Supabase Auth), not API keys - handled below
    rateLimit: true,
    // NOTE: This endpoint uses JWT authentication, not API key authentication.
    // The createHandler's requireAuth is for API key auth only.
    // JWT auth is handled in the handler function itself.
  },
  async (req, supabase, _ledger, body: BillingRequest, { requestId }) => {
    // This function uses JWT auth (Supabase Auth), not API keys
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return errorResponse('Unauthorized', 401, req, requestId)
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return errorResponse('Unauthorized', 401, req, requestId)
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return errorResponse('No organization found', 404, req, requestId)
    }

    const orgId = body.organization_id || membership.organization_id

    // Verify access
    if (orgId !== membership.organization_id) {
      return errorResponse('Access denied', 403, req, requestId)
    }

    // Get organization
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (!org) {
      return errorResponse('Organization not found', 404, req, requestId)
    }

    // Initialize Stripe
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      return errorResponse('Stripe not configured', 503, req, requestId)
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

    switch (body.action) {
      case 'get_subscription': {
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const usage = await supabase.rpc('get_current_period_usage', { p_organization_id: orgId })
        const limits = await supabase.rpc('check_usage_limits', { p_organization_id: orgId })

        return jsonResponse({
          success: true,
          data: {
            subscription,
            organization: { id: org.id, name: org.name, plan: org.plan, status: org.status, trial_ends_at: org.trial_ends_at },
            usage: usage.data,
            limits: limits.data,
          }
        }, 200, req, requestId)
      }

      case 'get_usage': {
        const usage = await supabase.rpc('get_current_period_usage', { p_organization_id: orgId })
        return jsonResponse({ success: true, data: usage.data }, 200, req, requestId)
      }

      case 'get_invoices': {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(24)
        return jsonResponse({ success: true, data: invoices || [] }, 200, req, requestId)
      }

      case 'get_payment_methods': {
        const { data: methods } = await supabase
          .from('payment_methods')
          .select('*')
          .eq('organization_id', orgId)
          .order('is_default', { ascending: false })
        return jsonResponse({ success: true, data: methods || [] }, 200, req, requestId)
      }

      case 'get_plans': {
        const { data: plans } = await supabase
          .from('pricing_plans')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
        return jsonResponse({ success: true, data: plans || [] }, 200, req, requestId)
      }

      case 'create_checkout_session': {
        if (!body.price_id) {
          return errorResponse('price_id required', 400, req, requestId)
        }

        let customerId = org.stripe_customer_id
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: org.billing_email || user.email,
            name: org.name,
            metadata: { organization_id: orgId },
          })
          customerId = customer.id
          await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId)
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'subscription',
          line_items: [{ price: body.price_id, quantity: body.quantity || 1 }],
          success_url: body.return_url || `${req.headers.get('origin')}/dashboard/settings/billing?success=true`,
          cancel_url: body.cancel_url || `${req.headers.get('origin')}/dashboard/settings/billing?canceled=true`,
          subscription_data: { metadata: { organization_id: orgId } },
          allow_promotion_codes: true,
        })

        return jsonResponse({ success: true, data: { url: session.url, session_id: session.id } }, 200, req, requestId)
      }

      case 'create_portal_session': {
        if (!org.stripe_customer_id) {
          return errorResponse('No billing account', 400, req, requestId)
        }

        const session = await stripe.billingPortal.sessions.create({
          customer: org.stripe_customer_id,
          return_url: body.return_url || `${req.headers.get('origin')}/dashboard/settings/billing`,
        })

        return jsonResponse({ success: true, data: { url: session.url } }, 200, req, requestId)
      }

      case 'update_subscription': {
        if (!org.stripe_subscription_id) {
          return errorResponse('No active subscription', 400, req, requestId)
        }

        const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
        const updateParams: any = {}
        
        if (body.price_id) {
          updateParams.items = [{ id: subscription.items.data[0].id, price: body.price_id }]
          updateParams.proration_behavior = 'create_prorations'
        }
        
        if (body.quantity) {
          updateParams.items = [{ id: subscription.items.data[0].id, quantity: body.quantity }]
        }

        const updated = await stripe.subscriptions.update(org.stripe_subscription_id, updateParams)

        return jsonResponse({ 
          success: true, 
          data: { status: updated.status, current_period_end: updated.current_period_end } 
        }, 200, req, requestId)
      }

      case 'cancel_subscription': {
        if (!org.stripe_subscription_id) {
          return errorResponse('No active subscription', 400, req, requestId)
        }

        const subscription = await stripe.subscriptions.update(org.stripe_subscription_id, {
          cancel_at_period_end: true,
        })

        return jsonResponse({ 
          success: true, 
          data: { cancel_at: subscription.cancel_at, current_period_end: subscription.current_period_end } 
        }, 200, req, requestId)
      }

      case 'resume_subscription': {
        if (!org.stripe_subscription_id) {
          return errorResponse('No subscription to resume', 400, req, requestId)
        }

        const subscription = await stripe.subscriptions.update(org.stripe_subscription_id, {
          cancel_at_period_end: false,
        })

        return jsonResponse({ success: true, data: { status: subscription.status } }, 200, req, requestId)
      }

      case 'add_payment_method': {
        if (!body.payment_method_id || !org.stripe_customer_id) {
          return errorResponse('payment_method_id required', 400, req, requestId)
        }

        await stripe.paymentMethods.attach(body.payment_method_id, { customer: org.stripe_customer_id })
        return jsonResponse({ success: true }, 200, req, requestId)
      }

      case 'set_default_payment_method': {
        if (!body.payment_method_id || !org.stripe_customer_id) {
          return errorResponse('payment_method_id required', 400, req, requestId)
        }

        await stripe.customers.update(org.stripe_customer_id, {
          invoice_settings: { default_payment_method: body.payment_method_id },
        })

        await supabase.from('payment_methods').update({ is_default: false }).eq('organization_id', orgId)
        await supabase.from('payment_methods').update({ is_default: true }).eq('stripe_payment_method_id', body.payment_method_id)

        return jsonResponse({ success: true }, 200, req, requestId)
      }

      case 'report_usage': {
        if (!body.usage_type || !body.usage_quantity) {
          return errorResponse('usage_type and usage_quantity required', 400, req, requestId)
        }

        await supabase.from('usage_records').insert({
          organization_id: orgId,
          usage_type: body.usage_type,
          quantity: body.usage_quantity,
          period_start: new Date().toISOString(),
          period_end: new Date().toISOString(),
        })

        const { data: subItem } = await supabase
          .from('subscription_items')
          .select('stripe_subscription_item_id')
          .eq('is_metered', true)
          .single()

        if (subItem) {
          await stripe.subscriptionItems.createUsageRecord(
            subItem.stripe_subscription_item_id,
            { quantity: body.usage_quantity, timestamp: Math.floor(Date.now() / 1000), action: 'increment' }
          )
        }

        return jsonResponse({ success: true }, 200, req, requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
