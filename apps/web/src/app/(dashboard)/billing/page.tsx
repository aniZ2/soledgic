'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CreditCard, Receipt, BarChart3, Check, AlertTriangle,
  ExternalLink, Loader2, Calendar
} from 'lucide-react'
import { PlanSelectButton } from '@/components/plan-select-button'
import { isOverLedgerLimit } from '@/lib/entitlements'

interface Subscription {
  id: string
  plan: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at: string | null
}

interface Invoice {
  id: string
  number: string
  status: string
  total: number
  currency: string
  created_at: string
  hosted_invoice_url: string
  invoice_pdf: string
}

interface PaymentMethod {
  id: string
  type: string
  card_brand: string
  card_last4: string
  card_exp_month: number
  card_exp_year: number
  is_default: boolean
}

interface Usage {
  api_calls: number
  transactions: number
  creators: number
  ledgers: number
  period_start: string
  period_end: string
}

interface Plan {
  id: string
  name: string
  price_monthly: number
  max_ledgers: number
  max_team_members: number
  features: string[]
  stripe_price_id_monthly: string
  contact_sales?: boolean
}

function BillingContent() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [organization, setOrganization] = useState<any>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadBillingData()

    if (searchParams.get('success')) {
      setSuccessMessage('Your subscription has been updated!')
      window.history.replaceState({}, '', '/billing')
    }
  }, [searchParams])

  const billingFetch = async (action: string) => {
    const res = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    return res.json()
  }

  const loadBillingData = async () => {
    try {
      const [subData, invData, pmData, plansData] = await Promise.all([
        billingFetch('get_subscription'),
        billingFetch('get_invoices'),
        billingFetch('get_payment_methods'),
        billingFetch('get_plans'),
      ])

      if (subData.success) {
        setSubscription(subData.data.subscription)
        setOrganization(subData.data.organization)
        setUsage(subData.data.usage)
        setIsOwner(subData.data.is_owner ?? false)
      }
      if (invData.success) setInvoices(invData.data)
      if (pmData.success) setPaymentMethods(pmData.data)
      if (plansData.success) setPlans(plansData.data)
    } catch (error) {
      console.error('Error loading billing data:', error)
    }

    setLoading(false)
  }

  const handleAction = async (action: string, data: any = {}) => {
    setActionLoading(action)

    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      })
      const result = await res.json()

      if (result.success) {
        if (result.data?.url) {
          window.location.href = result.data.url
        } else {
          await loadBillingData()
          setSuccessMessage('Changes saved!')
        }
      }
    } catch (error) {
      console.error('Action error:', error)
    }

    setActionLoading(null)
  }

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const currentPlan = plans.find(p => p.id === organization?.plan)
  const isTrialing = organization?.plan === 'trial'
  const isCanceling = subscription?.cancel_at
  const isPastDue = organization?.status === 'past_due'
  const isCanceled = organization?.status === 'canceled'
  const maxLedgers = organization?.max_ledgers ?? -1
  const currentLedgerCount = organization?.current_ledger_count ?? 0
  const isOverLimit = isOverLedgerLimit({
    status: organization?.status ?? 'active',
    max_ledgers: maxLedgers,
    current_ledger_count: currentLedgerCount,
    plan: organization?.plan ?? 'trial',
  })
  const trialEndsAt = organization?.trial_ends_at ? new Date(organization.trial_ends_at) : null
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing details
        </p>
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <p className="text-green-600">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-green-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Past Due Banner */}
      {isPastDue && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              Your last payment didn&apos;t go through
            </p>
            <p className="text-sm text-muted-foreground">
              We&apos;ll keep retrying automatically. Update your payment method to make sure there&apos;s no interruption to your account.
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => handleAction('create_portal_session')}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap"
            >
              Update Payment Method
            </button>
          )}
        </div>
      )}

      {/* Trial Banner */}
      {isTrialing && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {daysLeft > 0
                ? `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                : 'Your trial has ended'}
            </p>
            <p className="text-sm text-muted-foreground">
              Choose a plan below to continue using Soledgic.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Current Plan</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold text-foreground capitalize">
                {organization?.plan || 'Trial'}
              </span>
              {isTrialing && trialEndsAt && (
                <span className="px-2 py-1 bg-yellow-500/10 text-yellow-600 text-xs rounded-full">
                  Trial ends {formatDate(trialEndsAt.toISOString())}
                </span>
              )}
              {isCanceled && (
                <span className="px-2 py-1 bg-red-500/10 text-red-600 text-xs rounded-full">
                  Canceled
                </span>
              )}
              {!isCanceled && isCanceling && (
                <span className="px-2 py-1 bg-red-500/10 text-red-600 text-xs rounded-full">
                  Cancels {formatDate(subscription!.cancel_at!)}
                </span>
              )}
            </div>
            {currentPlan && (
              <p className="text-muted-foreground mt-1">
                {formatCurrency(currentPlan.price_monthly)}/month
              </p>
            )}
          </div>
          {isOwner && (
            <div className="flex gap-2">
              {isCanceling ? (
                <button
                  onClick={() => handleAction('resume_subscription')}
                  disabled={actionLoading === 'resume_subscription'}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {actionLoading === 'resume_subscription' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : 'Resume Subscription'}
                </button>
              ) : (
                <button
                  onClick={() => handleAction('create_portal_session')}
                  disabled={!!actionLoading}
                  className="px-4 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-50"
                >
                  Manage Subscription
                </button>
              )}
            </div>
          )}
        </div>
        {subscription && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Current billing period: {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
            </p>
          </div>
        )}
      </div>

      {/* Over-limit Downgrade Banner */}
      {isOverLimit && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              You have {currentLedgerCount} of {maxLedgers} ledgers on the {organization?.plan} plan
            </p>
            <p className="text-sm text-muted-foreground">
              Your existing ledgers still work normally. To create new ones, upgrade your plan or archive a ledger you no longer need.
            </p>
          </div>
        </div>
      )}

      {/* Usage Stats */}
      {usage && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Usage This Period
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{usage.ledgers}</p>
              <p className="text-sm text-muted-foreground">
                Ledgers
                {currentPlan && currentPlan.max_ledgers > 0 && (
                  <span className="text-xs ml-1">/ {currentPlan.max_ledgers}</span>
                )}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{usage.creators}</p>
              <p className="text-sm text-muted-foreground">Creators</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{usage.transactions.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Transactions</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{usage.api_calls.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Events</p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Selection Grid — always visible */}
      {plans.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {isTrialing ? 'Choose a plan' : 'Change plan'}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const isPopular = plan.id === 'business'
              return (
                <div
                  key={plan.id}
                  className={`bg-card rounded-lg border p-6 ${
                    isPopular ? 'border-primary ring-2 ring-primary' : 'border-border'
                  } ${plan.id === organization?.plan ? 'bg-primary/5' : ''}`}
                >
                  {isPopular && (
                    <span className="inline-block bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full mb-4">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <div className="mt-2">
                    {plan.price_monthly > 0 ? (
                      <>
                        <span className="text-3xl font-bold text-foreground">
                          {formatCurrency(plan.price_monthly)}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                      </>
                    ) : plan.contact_sales ? (
                      <span className="text-3xl font-bold text-foreground">Custom</span>
                    ) : (
                      <span className="text-3xl font-bold text-foreground">Free</span>
                    )}
                  </div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <PlanSelectButton
                    planId={plan.id}
                    priceId={plan.stripe_price_id_monthly}
                    isCurrentPlan={plan.id === organization?.plan}
                    isOwner={isOwner}
                    contactSales={plan.contact_sales ?? false}
                    popular={isPopular}
                  />
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Additional ledgers: $20/month each. All plans include a 14-day free trial.
          </p>
        </div>
      )}

      {/* Payment Methods — owner only */}
      {isOwner && <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment Methods
          </h2>
          {isOwner && organization?.stripe_customer_id && (
            <button
              onClick={() => handleAction('create_portal_session')}
              className="text-sm text-primary hover:underline"
            >
              Manage
            </button>
          )}
        </div>
        {paymentMethods.length === 0 ? (
          <p className="text-muted-foreground">No payment methods on file</p>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground capitalize">
                      {pm.card_brand} •••• {pm.card_last4}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires {pm.card_exp_month}/{pm.card_exp_year}
                    </p>
                  </div>
                </div>
                {pm.is_default && (
                  <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Invoices — owner only */}
      {isOwner && <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Invoices
          </h2>
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No invoices yet. Your billing history will appear here after your first payment.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.slice(0, 10).map((inv) => (
              <div key={inv.id} className="px-6 py-4 flex items-center justify-between hover:bg-muted/30">
                <div className="flex items-center gap-4">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{inv.number}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(inv.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono">{formatCurrency(inv.total)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    inv.status === 'paid'
                      ? 'bg-green-500/10 text-green-600'
                      : inv.status === 'open'
                      ? 'bg-yellow-500/10 text-yellow-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {inv.status}
                  </span>
                  {inv.invoice_pdf && (
                    <a
                      href={inv.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Non-owner notice */}
      {!isOwner && (
        <p className="text-sm text-muted-foreground mb-6">
          Only organization owners can manage billing. Contact your administrator to make changes.
        </p>
      )}

      {/* Cancel Subscription Danger Zone */}
      {isOwner && subscription && !isCanceling && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Cancel Subscription
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            Your subscription will remain active until the end of the current billing period.
            You can resume at any time before then.
          </p>
          <button
            onClick={() => handleAction('cancel_subscription')}
            disabled={actionLoading === 'cancel_subscription'}
            className="mt-4 px-4 py-2 border border-red-500 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
          >
            {actionLoading === 'cancel_subscription' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : 'Cancel Subscription'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  )
}
