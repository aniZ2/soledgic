import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getStripe, getPlanConfig } from '@/lib/stripe'
import { planFromPriceId } from '@/lib/stripe-helpers'
import { sendPaymentFailedEmail } from '@/lib/email'
import type Stripe from 'stripe'

// Use service role key to bypass RLS — no user session in webhooks
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}

export async function POST(request: Request) {
  // Stripe webhooks are legacy-only. Keep the code for optionality, but disable by default.
  if (process.env.ENABLE_STRIPE_LEGACY !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.organization_id
        if (!orgId) break

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id

        if (subscriptionId) {
          // Retrieve full subscription to get the price/plan
          const sub = await getStripe().subscriptions.retrieve(subscriptionId)
          const priceId = sub.items.data[0]?.price.id
          const planName = priceId ? planFromPriceId(priceId) : null

          await supabase
            .from('organizations')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscriptionId,
              plan: planName || 'pro',
              status: 'active',
              plan_started_at: new Date().toISOString(),
            })
            .eq('id', orgId)

          // Also update limits based on plan
          if (planName && planName !== 'scale') {
            const planConfig = getPlanConfig(planName)
            if (planConfig) {
              await supabase
                .from('organizations')
                .update({
                  max_ledgers: planConfig.max_ledgers,
                  max_team_members: planConfig.max_team_members,
                })
                .eq('id', orgId)
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        const priceId = sub.items.data[0]?.price.id
        const planName = priceId ? planFromPriceId(priceId) : null

        const updateData: Record<string, any> = {
          status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'active',
        }

        if (planName) {
          updateData.plan = planName
          const planConfig = getPlanConfig(planName)
          if (planConfig && planName !== 'scale') {
            updateData.max_ledgers = planConfig.max_ledgers
            updateData.max_team_members = planConfig.max_team_members
          }
        }

        await supabase
          .from('organizations')
          .update(updateData)
          .eq('id', orgId)

        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        await supabase
          .from('organizations')
          .update({
            plan: 'pro',
            status: 'canceled',
            stripe_subscription_id: null,
            max_ledgers: 1,
            max_team_members: 1,
          })
          .eq('id', orgId)

        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id

        if (customerId) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (org) {
            await supabase.from('billing_events').insert({
              organization_id: org.id,
              stripe_event_id: event.id,
              stripe_event_type: event.type,
              amount: invoice.total,
              currency: invoice.currency,
              description: `Invoice ${invoice.number || invoice.id} paid`,
              stripe_data: {
                invoice_id: invoice.id,
                number: invoice.number,
                total: invoice.total,
                currency: invoice.currency,
                hosted_invoice_url: invoice.hosted_invoice_url,
                invoice_pdf: invoice.invoice_pdf,
              },
            })
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id

        if (customerId) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('stripe_customer_id', customerId)
            .single()

          if (org) {
            await supabase.from('billing_events').insert({
              organization_id: org.id,
              stripe_event_id: event.id,
              stripe_event_type: event.type,
              amount: invoice.total,
              currency: invoice.currency,
              description: `Invoice ${invoice.number || invoice.id} payment failed`,
              stripe_data: {
                invoice_id: invoice.id,
                number: invoice.number,
                total: invoice.total,
                currency: invoice.currency,
                hosted_invoice_url: invoice.hosted_invoice_url,
                invoice_pdf: invoice.invoice_pdf,
              },
            })

            // Get owner's email to notify them
            const { data: owner } = await supabase
              .from('organization_members')
              .select('user_id')
              .eq('organization_id', org.id)
              .eq('role', 'owner')
              .single()

            if (owner) {
              const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id)
              if (userData?.user?.email) {
                const amount = new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: invoice.currency?.toUpperCase() || 'USD',
                }).format((invoice.total || 0) / 100)

                // Calculate next retry date (Stripe retries after 3 days typically)
                const nextRetry = invoice.next_payment_attempt
                  ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : undefined

                sendPaymentFailedEmail({
                  to: userData.user.email,
                  orgName: org.name,
                  amount,
                  nextRetry,
                }).catch(console.error)
              }
            }
          }
        }
        break
      }
    }
  } catch (err: any) {
    console.error(`Webhook handler error for ${event.type}:`, err.message)
    // Still return 200 to acknowledge receipt
  }

  return NextResponse.json({ received: true })
}
