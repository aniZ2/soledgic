'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { createOrganizationWithLedger } from './actions'

type LedgerMode = 'standard' | 'marketplace'

const plans = [
  {
    id: 'pro',
    name: 'Pro + Payment Processing',
    price: 49,
    ledgers: 3,
    team_members: 1,
    features: [
      'Payment processing',
      'Everything in Pro',
      '3 ledgers',
      'API access',
      'Receipts & reconciliation',
      'Email support',
    ],
    popular: false,
  },
]

export default function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [orgName, setOrgName] = useState('')
  const [ledgerName, setLedgerName] = useState('')
  const [ledgerMode, setLedgerMode] = useState<LedgerMode>('marketplace')
  const [selectedPlan, setSelectedPlan] = useState('pro')

  const selectedPlanData = plans.find(p => p.id === selectedPlan)

  const handleCreateOrganization = async (skipTrial = false) => {
    setError(null)
    setLoading(true)

    try {
      const result = await createOrganizationWithLedger({
        orgName,
        selectedPlan,
        ledgerName,
        ledgerMode,
      })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      // If user wants to skip trial and pay now, redirect to billing
      if (skipTrial) {
        router.push('/billing?action=subscribe&plan=' + selectedPlan)
      } else {
        // Redirect to getting-started for trial users
        router.push('/getting-started')
      }
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
                Start with a 14-day free trial. Cancel anytime.
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
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors relative ${
                      selectedPlan === plan.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-2 right-4 bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                        Popular
                      </span>
                    )}
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{plan.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {plan.ledgers === -1 ? 'Unlimited' : plan.ledgers} ledger{plan.ledgers !== 1 ? 's' : ''} •{' '}
                          {plan.team_members === -1 ? 'Unlimited' : plan.team_members} team member{plan.team_members !== 1 ? 's' : ''}
                        </div>
                        <ul className="mt-2 space-y-1">
                          {plan.features.slice(0, 2).map((feature) => (
                            <li key={feature} className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-primary" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right ml-4">
                        {plan.price ? (
                          <>
                            <div className="font-bold text-foreground text-lg">${plan.price}</div>
                            <div className="text-xs text-muted-foreground">/month</div>
                          </>
                        ) : (
                          <div className="font-medium text-foreground">Custom</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex-1 border border-border rounded-md py-2.5 px-4 font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={() => handleCreateOrganization(false)}
                  disabled={loading}
                  className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Start free trial'}
                </button>
              </div>

              {selectedPlanData && (
                <p className="text-center text-xs text-muted-foreground mt-4">
                  No credit card required for trial.{' '}
                  <button
                    type="button"
                    onClick={() => handleCreateOrganization(true)}
                    disabled={loading}
                    className="text-primary hover:underline"
                  >
                    Skip trial and subscribe now
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
