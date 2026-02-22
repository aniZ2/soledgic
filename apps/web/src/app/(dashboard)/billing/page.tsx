'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface BillingUsage {
  api_calls: number
  transactions: number
  creators: number
  ledgers: number
  team_members: number
  period_start: string | null
  period_end: string | null
}

interface BillingOverageSummary {
  additional_ledgers: number
  additional_team_members: number
  overage_ledger_price: number
  overage_team_member_price: number
  estimated_monthly_cents: number
}

interface BillingOrganizationSummary {
  id: string
  name: string
  plan: string
  trial_ends_at: string | null
  status: string
  max_ledgers: number | null
  max_team_members: number | null
  current_ledger_count: number
  current_member_count: number
  included_ledgers: number
  included_team_members: number
  overage_ledger_price: number
  overage_team_member_price: number
}

interface BillingSummaryResponse {
  subscription: null
  organization: BillingOrganizationSummary
  usage: BillingUsage
  overage: BillingOverageSummary
  billing: {
    method_configured: boolean
    method_label?: string | null
    processor_connected: boolean
    last_charge: {
      period_start: string
      period_end: string
      amount_cents: number
      status: string
      attempts: number
      last_attempt_at: string | null
      processor_payment_id: string | null
      error: string | null
      next_retry_at?: string | null
      retries_remaining?: number
      dunning_exhausted?: boolean
    } | null
  }
  is_owner: boolean
}

interface Plan {
  id: string
  name: string
  price_monthly: number
  max_ledgers: number
  max_team_members: number
  overage_ledger_price_monthly: number
  overage_team_member_price_monthly: number
  features: string[]
  contact_sales?: boolean
}

async function billingFetch(action: string) {
  const res = await fetchWithCsrf('/api/billing', {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
  return res.json()
}

export default function BillingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [handledCallback, setHandledCallback] = useState(false)
  const [connectingBillingMethod, setConnectingBillingMethod] = useState(false)

  const loadBilling = async () => {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const [subData, plansData] = await Promise.all([
        billingFetch('get_subscription'),
        billingFetch('get_plans'),
      ])

      if (subData?.success) {
        setSummary(subData.data as BillingSummaryResponse)
      } else {
        setError(subData?.error || 'Failed to load billing summary')
      }

      if (plansData?.success) {
        setPlans(plansData.data as Plan[])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBilling()
  }, [])

  useEffect(() => {
    if (handledCallback) return

    const billingSetup = searchParams.get('billing_setup')
    const identityId = searchParams.get('identity_id')
    const state = searchParams.get('state')

    if (billingSetup === 'expired') {
      setHandledCallback(true)
      setError('Billing setup session expired. Start setup again.')
      router.replace('/billing')
      return
    }

    if (billingSetup === 'success' && identityId) {
      if (!state) {
        setHandledCallback(true)
        setError('Invalid callback. Please start setup again.')
        router.replace('/billing')
        return
      }

      setHandledCallback(true)
      ;(async () => {
        setConnectingBillingMethod(true)
        setError(null)
        setInfo(null)
        try {
          const res = await fetchWithCsrf('/api/billing-method', {
            method: 'POST',
            body: JSON.stringify({ action: 'save_billing_method', identity_id: identityId, state }),
          })
          const result = await res.json()
          if (!res.ok || !result.success) {
            throw new Error(result.error || 'Failed to save billing method')
          }

          setInfo('Billing method saved.')
          await loadBilling()
          router.replace('/billing')
        } catch (err: any) {
          setError(err.message || 'Failed to finalize billing method setup')
          router.replace('/billing')
        } finally {
          setConnectingBillingMethod(false)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handledCallback, searchParams, router])

  const handleSetupBillingMethod = async () => {
    setError(null)
    setInfo(null)
    setConnectingBillingMethod(true)

    try {
      const res = await fetchWithCsrf('/api/billing-method', {
        method: 'POST',
        body: JSON.stringify({ action: 'create_setup_link' }),
      })
      const result = await res.json()
      if (!res.ok || !result.success || !result.data?.url) {
        throw new Error(result.error || 'Unable to start billing method setup')
      }

      window.location.href = result.data.url
    } catch (err: any) {
      setError(err.message || 'Failed to start billing method setup')
      setConnectingBillingMethod(false)
    }
  }

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const currentPlan = useMemo(() => {
    if (!summary) return null
    return plans.find((p) => p.id === summary.organization.plan) || null
  }, [plans, summary])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="mt-2 text-muted-foreground">Usage-based billing for ledgers and team members.</p>
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error || 'Unable to load billing data.'}
        </div>
      </div>
    )
  }

  const org = summary.organization
  const usage = summary.usage
  const overage = summary.overage
  const billing = summary.billing

  const isPastDue = org.status === 'past_due'
  const isCanceled = org.status === 'canceled'

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Usage-based billing for ledgers and team members.
        </p>
      </div>

      {(isPastDue || isCanceled) && (
        <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-foreground">
                {isCanceled ? 'Billing is inactive' : 'Payment issue detected'}
              </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isCanceled
                    ? 'Owner actions that create new live resources may be blocked until billing is reactivated.'
                    : 'Owner actions that create new live resources may be blocked until billing is resolved.'}
                </p>
            </div>
            {summary.is_owner ? (
              <button
                onClick={handleSetupBillingMethod}
                disabled={connectingBillingMethod}
                className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {connectingBillingMethod ? 'Opening…' : billing.method_configured ? 'Update Billing Method' : 'Add Billing Method'}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {info ? (
        <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700">
          {info}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Current Plan</h2>
                <p className="mt-2 text-3xl font-bold text-foreground">
                  {currentPlan?.name || 'Free'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatCurrency(0)} / month
                </p>
              </div>
              <Link
                href="/pricing"
                className="text-sm text-primary hover:underline whitespace-nowrap"
              >
                View pricing
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Included</p>
                <p className="mt-1 text-sm text-foreground">
                  {org.included_ledgers === -1 ? 'Unlimited' : `${org.included_ledgers} ledger(s)`}
                  {' and '}
                  {org.included_team_members === -1 ? 'unlimited team members' : `${org.included_team_members} team member(s)`}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Overage Pricing</p>
                <p className="mt-1 text-sm text-foreground">
                  {formatCurrency(org.overage_ledger_price)} / additional ledger
                  {' and '}
                  {formatCurrency(org.overage_team_member_price)} / additional team member
                </p>
              </div>
            </div>

            {Array.isArray(currentPlan?.features) && currentPlan!.features.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-foreground mb-2">What&apos;s included</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground list-disc pl-5">
                  {currentPlan!.features.slice(0, 10).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">This Billing Period</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {usage.period_start && usage.period_end
                ? `${formatDate(usage.period_start)} to ${formatDate(usage.period_end)}`
                : 'Current month'}
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Ledgers</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{usage.ledgers}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{usage.team_members}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Creators</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{usage.creators}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">API Calls</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{usage.api_calls}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Estimated Overage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Based on current usage for this billing period.
            </p>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Additional ledgers</span>
                <span className="text-foreground font-medium">{overage.additional_ledgers}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Additional team members</span>
                <span className="text-foreground font-medium">{overage.additional_team_members}</span>
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-foreground font-medium">Estimated monthly total</span>
                <span className="text-foreground font-semibold">
                  {formatCurrency(overage.estimated_monthly_cents)}
                </span>
              </div>
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              Overages are calculated from active live ledgers and active team members.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Billing Method</h2>
            {billing.method_configured ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Billing is enabled for usage-based overages.
                </p>
                {billing.method_label ? (
                  <p className="mt-2 text-sm text-foreground font-medium">{billing.method_label}</p>
                ) : null}
                {billing.last_charge ? (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last charge</span>
                      <span className="font-medium text-foreground capitalize">
                        {billing.last_charge.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Period</span>
                      <span className="text-foreground">
                        {billing.last_charge.period_start} to {billing.last_charge.period_end}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="text-foreground font-medium">
                        {formatCurrency(billing.last_charge.amount_cents)}
                      </span>
                    </div>
                    {typeof billing.last_charge.attempts === 'number' ? (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-muted-foreground">Attempts</span>
                        <span className="text-foreground">{billing.last_charge.attempts} / 3</span>
                      </div>
                    ) : null}
                    {billing.last_charge.error ? (
                      <p className="mt-3 text-xs text-destructive">{billing.last_charge.error}</p>
                    ) : null}
                    {billing.last_charge.status === 'failed' &&
                    typeof billing.last_charge.retries_remaining === 'number' &&
                    billing.last_charge.retries_remaining > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Automatic retry in progress.
                        {billing.last_charge.next_retry_at
                          ? ` Next retry: ${formatDate(billing.last_charge.next_retry_at)}.`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    No overage charges have been recorded yet.
                  </p>
                )}
                {summary.is_owner ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleSetupBillingMethod}
                      disabled={connectingBillingMethod}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {connectingBillingMethod ? 'Opening…' : 'Update Billing Method'}
                    </button>
                    <Link
                      href="/settings/payment-rails"
                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
                    >
                      Manage Payment Rails
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add a billing method to enable overage billing. Overages are only charged when you exceed the included limits.
                </p>
                {summary.is_owner ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleSetupBillingMethod}
                      disabled={connectingBillingMethod}
                      className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {connectingBillingMethod ? 'Opening…' : 'Add Billing Method'}
                    </button>
                    <Link
                      href="/settings/payment-rails"
                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
                    >
                      Manage Payment Rails
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
