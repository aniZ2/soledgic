'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { createOrganizationWithLedger } from './actions'

type LedgerMode = 'standard' | 'marketplace'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const plans = [
  {
    id: 'pro',
    name: 'Free',
    price: 0,
    ledgers: 1,
    team_members: 1,
    features: [
      'Payment processing',
      'Core finance features',
      '1 ledger included',
      '1 team member included',
      '$20/month per additional ledger',
      '$20/month per additional team member',
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

  // API key state (shown after org creation)
  const [testApiKey, setTestApiKey] = useState<string | null>(null)
  const [liveApiKey, setLiveApiKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({})

  const copyToClipboard = async (key: string, label: string) => {
    await navigator.clipboard.writeText(key)
    setCopiedKey(label)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const toggleReveal = (label: string) => {
    setRevealedKeys((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  const handleCreateOrganization = async () => {
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

      // Show API keys before redirecting
      const data = result.data as any
      if (data?.testApiKey || data?.liveApiKey) {
        setTestApiKey(data.testApiKey || null)
        setLiveApiKey(data.liveApiKey || null)
        setLoading(false)
        setStep(4)
        return
      }

      // Fallback: if no keys returned, proceed directly
      router.replace('/connect')

    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create organization'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3, 4].map((s) => (
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
              {s < 4 && (
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
                Review your setup
              </h1>
              <p className="text-muted-foreground mb-8">
                Start free with one included ledger and one included team member. Additional ledgers and team members are $20/month each.
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
                        {plan.price > 0 ? (
                          <>
                            <div className="font-bold text-foreground text-lg">${plan.price}</div>
                            <div className="text-xs text-muted-foreground">/month</div>
                          </>
                        ) : (
                          <div className="font-medium text-foreground">Free</div>
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
                  onClick={handleCreateOrganization}
                  disabled={loading}
                  className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Start free'}
                </button>
              </div>
            </>
          )}

          {/* Step 4: API Keys */}
          {step === 4 && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <h1 className="text-2xl font-bold text-foreground">
                  You&apos;re all set!
                </h1>
              </div>
              <p className="text-muted-foreground mb-6">
                Here are your API keys. Copy them now — they won&apos;t be shown again.
              </p>

              <div className="space-y-4 mb-6">
                {testApiKey && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Test API Key
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted border border-border rounded-md py-2 px-3 text-sm font-mono text-foreground break-all">
                        {revealedKeys['test'] ? testApiKey : testApiKey.slice(0, 12) + '••••••••••••••••'}
                      </code>
                      <button
                        type="button"
                        onClick={() => toggleReveal('test')}
                        className="p-2 border border-border rounded-md hover:bg-accent transition-colors"
                        title={revealedKeys['test'] ? 'Hide' : 'Reveal'}
                      >
                        {revealedKeys['test'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(testApiKey, 'test')}
                        className="p-2 border border-border rounded-md hover:bg-accent transition-colors"
                        title="Copy"
                      >
                        {copiedKey === 'test' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Use this key for development and testing</p>
                  </div>
                )}

                {liveApiKey && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Live API Key
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted border border-border rounded-md py-2 px-3 text-sm font-mono text-foreground break-all">
                        {revealedKeys['live'] ? liveApiKey : liveApiKey.slice(0, 12) + '••••••••••••••••'}
                      </code>
                      <button
                        type="button"
                        onClick={() => toggleReveal('live')}
                        className="p-2 border border-border rounded-md hover:bg-accent transition-colors"
                        title={revealedKeys['live'] ? 'Hide' : 'Reveal'}
                      >
                        {revealedKeys['live'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(liveApiKey, 'live')}
                        className="p-2 border border-border rounded-md hover:bg-accent transition-colors"
                        title="Copy"
                      >
                        {copiedKey === 'live' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Use this key for production traffic</p>
                  </div>
                )}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 mb-6">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  These keys will not be displayed again. You can rotate them later in Settings &gt; API Keys.
                </p>
              </div>

              <button
                onClick={() => router.replace('/connect')}
                className="w-full bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors"
              >
                Continue to setup
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
