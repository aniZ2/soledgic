'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type LedgerMode = 'standard' | 'marketplace'

const plans = [
  { id: 'starter', name: 'Starter', price: 49, ledgers: 1, transactions: 1000 },
  { id: 'growth', name: 'Growth', price: 199, ledgers: 3, transactions: 10000 },
  { id: 'enterprise', name: 'Enterprise', price: 499, ledgers: -1, transactions: -1 },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [orgName, setOrgName] = useState('')
  const [ledgerName, setLedgerName] = useState('')
  const [ledgerMode, setLedgerMode] = useState<LedgerMode>('marketplace')
  const [selectedPlan, setSelectedPlan] = useState('starter')

  const handleCreateOrganization = async () => {
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    try {
      // Create organization
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: orgName,
          slug: slug,
          plan: selectedPlan,
          limits: plans.find(p => p.id === selectedPlan) || plans[0],
        })
        .select()
        .single()

      if (orgError) throw orgError

      // Add user as owner
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: 'owner',
        })

      if (memberError) throw memberError

      // Create paired test + live ledgers
      const ledgerGroupId = crypto.randomUUID()
      const testApiKey = `sk_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
      const liveApiKey = `sk_live_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`

      const sharedFields = {
        organization_id: org.id,
        business_name: ledgerName,
        ledger_mode: ledgerMode,
        status: 'active' as const,
        ledger_group_id: ledgerGroupId,
        settings: {
          currency: 'USD',
          fiscal_year_start: 1,
        },
      }

      const { error: ledgerError } = await supabase
        .from('ledgers')
        .insert([
          { ...sharedFields, api_key: testApiKey, livemode: false },
          { ...sharedFields, api_key: liveApiKey, livemode: true },
        ])

      if (ledgerError) throw ledgerError

      // Redirect to dashboard
      router.push('/dashboard')
      router.refresh()

    } catch (err: any) {
      setError(err.message || 'Failed to create organization')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`w-16 h-0.5 ${
                    step > s ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
          {/* Step 1: Organization */}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Create your organization
              </h1>
              <p className="text-muted-foreground mb-8">
                This is where all your ledgers and team members will live
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Organization name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Acme Inc."
                  />
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!orgName.trim()}
                  className="w-full bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 2: Ledger */}
          {step === 2 && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Create your first ledger
              </h1>
              <p className="text-muted-foreground mb-8">
                A ledger is a separate set of books for a business or project
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Ledger name
                  </label>
                  <input
                    type="text"
                    value={ledgerName}
                    onChange={(e) => setLedgerName(e.target.value)}
                    className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="My Platform"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Ledger type
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setLedgerMode('marketplace')}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        ledgerMode === 'marketplace'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium text-foreground mb-1">Marketplace</div>
                      <div className="text-sm text-muted-foreground">
                        Track creator earnings, splits, and payouts
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerMode('standard')}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        ledgerMode === 'standard'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium text-foreground mb-1">Standard</div>
                      <div className="text-sm text-muted-foreground">
                        Traditional double-entry accounting
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border border-border rounded-md py-2.5 px-4 font-medium hover:bg-accent transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!ledgerName.trim()}
                    className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Plan */}
          {step === 3 && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Choose your plan
              </h1>
              <p className="text-muted-foreground mb-8">
                Start with a 14-day free trial. No credit card required.
              </p>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3 mb-6">
                  {error}
                </div>
              )}

              <div className="space-y-3 mb-6">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                      selectedPlan === plan.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-foreground">{plan.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {plan.ledgers === -1 ? 'Unlimited' : plan.ledgers} ledger{plan.ledgers !== 1 ? 's' : ''} •{' '}
                          {plan.transactions === -1 ? 'Unlimited' : plan.transactions.toLocaleString()} transactions/mo
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-foreground">${plan.price}</div>
                        <div className="text-xs text-muted-foreground">/month</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 border border-border rounded-md py-2.5 px-4 font-medium hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateOrganization}
                  disabled={loading}
                  className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Start free trial'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
