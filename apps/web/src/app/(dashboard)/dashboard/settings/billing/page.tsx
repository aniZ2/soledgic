'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { 
  CreditCard, Receipt, BarChart3, Check, AlertTriangle,
  ExternalLink, Loader2, ChevronRight, Calendar
} from 'lucide-react'

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
}

export default function BillingPage() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [organization, setOrganization] = useState<any>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadBillingData()
    
    // Check for success/cancel from checkout
    if (searchParams.get('success')) {
      setSuccessMessage('Your subscription has been updated!')
      window.history.replaceState({}, '', '/dashboard/settings/billing')
    }
  }, [searchParams])

  const loadBillingData = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    try {
      // Get subscription & usage
      const subRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'get_subscription' }),
        }
      )
      const subData = await subRes.json()
      if (subData.success) {
        setSubscription(subData.data.subscription)
        setOrganization(subData.data.organization)
        setUsage(subData.data.usage)
      }

      // Get invoices
      const invRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'get_invoices' }),
        }
      )
      const invData = await invRes.json()
      if (invData.success) {
        setInvoices(invData.data)
      }

      // Get payment methods
      const pmRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'get_payment_methods' }),
        }
      )
      const pmData = await pmRes.json()
      if (pmData.success) {
        setPaymentMethods(pmData.data)
      }

      // Get plans
      const plansRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'get_plans' }),
        }
      )
      const plansData = await plansRes.json()
      if (plansData.success) {
        setPlans(plansData.data)
      }

    } catch (error) {
      console.error('Error loading billing data:', error)
    }
    
    setLoading(false)
  }

  const handleAction = async (action: string, data: any = {}) => {
    setActionLoading(action)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action, ...data }),
        }
      )
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

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

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

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing
        </p>
      </div>

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

      {/* Current Plan */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Current Plan</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold text-foreground capitalize">
                {organization?.plan || 'Trial'}
              </span>
              {isTrialing && (
                <span className="px-2 py-1 bg-yellow-500/10 text-yellow-600 text-xs rounded-full">
                  Trial ends {formatDate(organization?.trial_ends_at)}
                </span>
              )}
              {isCanceling && (
                <span className="px-2 py-1 bg-red-500/10 text-red-600 text-xs rounded-full">
                  Cancels {formatDate(subscription.cancel_at!)}
                </span>
              )}
            </div>
            {currentPlan && (
              <p className="text-muted-foreground mt-1">
                {formatCurrency(currentPlan.price_monthly)}/month
              </p>
            )}
          </div>
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
              <>
                <button
                  onClick={() => handleAction('create_portal_session')}
                  disabled={!!actionLoading}
                  className="px-4 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-50"
                >
                  Manage Subscription
                </button>
                {isTrialing && (
                  <button
                    onClick={() => handleAction('create_checkout_session', { 
                      price_id: plans.find(p => p.id === 'pro')?.stripe_price_id_monthly 
                    })}
                    disabled={!!actionLoading}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    Upgrade to Pro
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {subscription && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Current billing period: {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
            </p>
          </div>
        )}
      </div>

      {/* Usage */}
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
              <p className="text-sm text-muted-foreground">API Calls</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Methods */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment Methods
          </h2>
          <button
            onClick={() => handleAction('create_portal_session')}
            className="text-sm text-primary hover:underline"
          >
            Manage
          </button>
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
      </div>

      {/* Invoices */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Invoices
          </h2>
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No invoices yet
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
      </div>

      {/* Available Plans */}
      {isTrialing && plans.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">Available Plans</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div 
                key={plan.id}
                className={`bg-card border rounded-lg p-6 ${
                  plan.id === 'business' ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                }`}
              >
                {plan.id === 'business' && (
                  <span className="inline-block px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full mb-3">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-3xl font-bold text-foreground mt-2">
                  {formatCurrency(plan.price_monthly)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-4 space-y-2">
                  {(plan.features as unknown as string[])?.map((feature: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleAction('create_checkout_session', { 
                    price_id: plan.stripe_price_id_monthly 
                  })}
                  disabled={!!actionLoading}
                  className={`w-full mt-6 py-2 rounded-md ${
                    plan.id === 'business'
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-border hover:bg-accent'
                  } disabled:opacity-50`}
                >
                  {actionLoading === 'create_checkout_session' ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    <>Choose {plan.name}</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger Zone */}
      {subscription && !isCanceling && (
        <div className="mt-8 bg-red-500/5 border border-red-500/20 rounded-lg p-6">
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
