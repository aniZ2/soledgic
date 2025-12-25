import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Check, CreditCard, AlertTriangle } from 'lucide-react'

const plans = [
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    ledgers: 3,
    team: 1,
    features: ['3 ledgers', 'API access', 'Receipts & reconciliation', 'Email support'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 249,
    ledgers: 10,
    team: 10,
    features: ['10 ledgers', 'Team members (up to 10)', 'Priority support', 'Everything in Pro'],
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 999,
    ledgers: -1,
    team: -1,
    features: ['Unlimited ledgers', 'Unlimited team members', 'Dedicated support', 'SLA guarantee'],
  },
]

export default async function BillingPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(*)
    `)
    .eq('user_id', user?.id)
    .eq('status', 'active')
    .single()

  const org = membership?.organization as any
  const isOwner = membership?.role === 'owner'

  const isTrialing = org?.plan === 'trial'
  const trialEndsAt = org?.trial_ends_at ? new Date(org.trial_ends_at) : null
  const daysLeft = trialEndsAt 
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  const currentPlan = plans.find(p => p.id === org?.plan) || plans[0]

  return (
    <div>
      <h1 className="text-3xl font-bold text-foreground">Billing</h1>
      <p className="mt-1 text-muted-foreground">
        Manage your subscription and billing details
      </p>

      {/* Trial Banner */}
      {isTrialing && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {daysLeft > 0 
                ? `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                : 'Your trial has ended'}
            </p>
            <p className="text-sm text-muted-foreground">
              Choose a plan below to continue using Soledge.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      {!isTrialing && (
        <div className="mt-6 bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Current Plan</h2>
              <p className="mt-1 text-muted-foreground">
                {currentPlan.name} - ${currentPlan.price}/month
              </p>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-500/10 text-green-500">
              Active
            </span>
          </div>
          
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Ledgers used</span>
                <p className="font-medium text-foreground">
                  {org?.current_ledger_count || 0} / {currentPlan.ledgers === -1 ? '∞' : currentPlan.ledgers}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Team members</span>
                <p className="font-medium text-foreground">
                  {org?.current_member_count || 1} / {currentPlan.team === -1 ? '∞' : currentPlan.team}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Selection */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {isTrialing ? 'Choose a plan' : 'Change plan'}
        </h2>
        
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-card rounded-lg border p-6 ${
                plan.popular ? 'border-primary ring-2 ring-primary' : 'border-border'
              } ${plan.id === org?.plan ? 'bg-primary/5' : ''}`}
            >
              {plan.popular && (
                <span className="inline-block bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled={!isOwner || plan.id === org?.plan}
                className={`mt-6 w-full py-3 rounded-md font-medium ${
                  plan.id === org?.plan
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : plan.popular
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border hover:bg-accent'
                } disabled:opacity-50`}
              >
                {plan.id === org?.plan ? 'Current plan' : 'Select plan'}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Additional ledgers: $20/month each. All plans include a 14-day free trial.
        </p>
      </div>

      {/* Payment Method */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Payment Method</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {org?.stripe_customer_id 
                ? 'Your payment method is on file.'
                : 'No payment method on file.'}
            </p>
          </div>
          <button
            disabled={!isOwner}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {org?.stripe_customer_id ? 'Update' : 'Add'}
          </button>
        </div>
      </div>

      {/* Billing History */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Billing History</h2>
        <p className="text-sm text-muted-foreground">
          No invoices yet. Your billing history will appear here after your first payment.
        </p>
      </div>

      {!isOwner && (
        <p className="mt-6 text-sm text-muted-foreground">
          Only organization owners can manage billing. Contact your administrator to make changes.
        </p>
      )}
    </div>
  )
}
