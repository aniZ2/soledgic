// Soledgic Edge Function: Stripe Billing Webhook
// POST /stripe-billing-webhook - Subscription lifecycle, invoices, payment methods
// SECURITY HARDENED VERSION

import { getCorsHeaders, getSupabaseClient } from '../_shared/utils.ts'

function jsonResponse(data: any, status = 200, req: Request) {
  return new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getSupabaseClient()

  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')
    
    const webhookSecret = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET')
    if (!webhookSecret) return jsonResponse({ error: 'Webhook secret not configured' }, 500, req)
    if (!signature) return jsonResponse({ error: 'Missing stripe-signature header' }, 401, req)
    
    const isValid = await verifyStripeSignature(body, signature, webhookSecret)
    if (!isValid) return jsonResponse({ error: 'Invalid signature' }, 401, req)

    const event = JSON.parse(body)
    
    const { data: existing } = await supabase.from('billing_events').select('id').eq('stripe_event_id', event.id).single()
    if (existing) return jsonResponse({ received: true, duplicate: true }, 200, req)

    const result = await processEvent(supabase, event)

    await supabase.from('billing_events').insert({ stripe_event_id: event.id, stripe_event_type: event.type, organization_id: result.organization_id, amount: result.amount, description: result.description, stripe_data: event })

    return jsonResponse({ received: true, ...result }, 200, req)

  } catch (error: any) {
    console.error('Billing webhook error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500, req)
  }
})

async function processEvent(supabase: any, event: any) {
  const obj = event.data.object

  switch (event.type) {
    case 'customer.created':
    case 'customer.updated': {
      const org = await findOrgByStripeCustomer(supabase, obj.id)
      if (org) await supabase.from('organizations').update({ billing_email: obj.email, billing_address: obj.address, tax_exempt: obj.tax_exempt || 'none', stripe_default_payment_method_id: obj.invoice_settings?.default_payment_method, updated_at: new Date().toISOString() }).eq('id', org.id)
      return { success: true, organization_id: org?.id }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const org = await findOrgByStripeCustomer(supabase, obj.customer)
      if (!org) return { success: false, error: 'Organization not found' }

      await supabase.rpc('sync_subscription_from_stripe', { p_organization_id: org.id, p_stripe_data: obj })

      const planLimits = getPlanLimits(obj.metadata?.plan || 'pro')
      await supabase.from('organizations').update({ plan: obj.metadata?.plan || 'pro', max_ledgers: planLimits.ledgers, max_team_members: planLimits.members, status: obj.status === 'active' || obj.status === 'trialing' ? 'active' : obj.status, updated_at: new Date().toISOString() }).eq('id', org.id)

      return { success: true, organization_id: org.id, description: `Subscription ${event.type.split('.').pop()}: ${obj.status}` }
    }

    case 'customer.subscription.deleted': {
      const org = await findOrgByStripeCustomer(supabase, obj.customer)
      if (org) {
        await supabase.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('stripe_subscription_id', obj.id)
        await supabase.from('organizations').update({ status: 'canceled', plan: 'trial', stripe_subscription_id: null }).eq('id', org.id)
      }
      return { success: true, organization_id: org?.id, description: 'Subscription canceled' }
    }

    case 'invoice.created':
    case 'invoice.updated':
    case 'invoice.finalized': {
      const org = await findOrgByStripeCustomer(supabase, obj.customer)
      if (!org) return { success: false, error: 'Organization not found' }

      await supabase.from('invoices').upsert({ organization_id: org.id, stripe_invoice_id: obj.id, stripe_subscription_id: obj.subscription, number: obj.number, status: obj.status, subtotal: obj.subtotal, tax: obj.tax || 0, total: obj.total, amount_paid: obj.amount_paid, amount_due: obj.amount_due, currency: obj.currency, hosted_invoice_url: obj.hosted_invoice_url, invoice_pdf: obj.invoice_pdf, raw_data: obj }, { onConflict: 'stripe_invoice_id' })

      return { success: true, organization_id: org.id, amount: obj.total, description: `Invoice ${obj.number}: ${obj.status}` }
    }

    case 'invoice.paid': {
      const org = await findOrgByStripeCustomer(supabase, obj.customer)
      if (org) {
        await supabase.from('invoices').update({ status: 'paid', amount_paid: obj.amount_paid, amount_due: 0, paid_at: new Date().toISOString() }).eq('stripe_invoice_id', obj.id)
        await supabase.from('organizations').update({ status: 'active' }).eq('id', org.id)
      }
      return { success: true, organization_id: org?.id, amount: obj.amount_paid, description: `Invoice ${obj.number} paid` }
    }

    case 'invoice.payment_failed': {
      const org = await findOrgByStripeCustomer(supabase, obj.customer)
      if (org) {
        await supabase.from('invoices').update({ status: 'open' }).eq('stripe_invoice_id', obj.id)
        await supabase.from('organizations').update({ status: 'past_due' }).eq('id', org.id)
      }
      return { success: true, organization_id: org?.id, amount: obj.amount_due, description: 'Payment failed' }
    }

    case 'payment_method.attached': {
      const org = await findOrgByStripeCustomer(supabase, obj.customer)
      if (org) await supabase.from('payment_methods').upsert({ organization_id: org.id, stripe_payment_method_id: obj.id, type: obj.type, card_brand: obj.card?.brand, card_last4: obj.card?.last4, card_exp_month: obj.card?.exp_month, card_exp_year: obj.card?.exp_year, is_default: false }, { onConflict: 'stripe_payment_method_id' })
      return { success: true, organization_id: org?.id, description: 'Payment method added' }
    }

    case 'payment_method.detached': {
      await supabase.from('payment_methods').delete().eq('stripe_payment_method_id', obj.id)
      return { success: true, description: 'Payment method removed' }
    }

    case 'checkout.session.completed': {
      if (obj.mode === 'subscription' && obj.subscription) {
        const org = await findOrgByStripeCustomer(supabase, obj.customer)
        if (org) await supabase.from('organizations').update({ stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription }).eq('id', org.id)
      }
      return { success: true, description: 'Checkout completed' }
    }

    default:
      return { success: true, skipped: true, description: `Unhandled: ${event.type}` }
  }
}

async function findOrgByStripeCustomer(supabase: any, customerId: string) {
  const { data } = await supabase.from('organizations').select('id, name, plan').eq('stripe_customer_id', customerId).single()
  return data
}

function getPlanLimits(plan: string) {
  const limits: Record<string, { ledgers: number; members: number }> = { trial: { ledgers: 1, members: 1 }, pro: { ledgers: 3, members: 1 }, business: { ledgers: 10, members: 10 }, scale: { ledgers: -1, members: -1 } }
  return limits[plan] || limits.trial
}

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',')
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
    const v1 = parts.find(p => p.startsWith('v1='))?.slice(3)
    if (!timestamp || !v1) return false

    // Replay protection - 5 minute window
    const ts = parseInt(timestamp)
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false

    const signedPayload = `${timestamp}.${payload}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    return expected === v1
  } catch { return false }
}
