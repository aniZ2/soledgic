'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import {
  Building,
  CreditCard,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react'

interface PaymentRail {
  id: string
  type: 'card' | 'manual'
  name: string
  is_connected: boolean
  account_id?: string
}

interface PaymentRailsStatus {
  connected: boolean
  platform_managed?: boolean
  identity_id: string | null
  merchant_id: string | null
  onboarding_form_id: string | null
  last_synced_at: string | null
  payout_settings?: {
    default_method?: string | null
    min_payout_amount?: number | null
  }
}

const RAIL_CONFIG = {
  card: {
    name: 'Card Processor',
    description: 'Process card payments and platform payouts through your processor',
    icon: Building,
    color: 'bg-emerald-500/10 text-emerald-600',
  },
  manual: {
    name: 'Manual Payouts',
    description: 'Record manual bank transfers, checks, or other payment methods',
    icon: CreditCard,
    color: 'bg-gray-500/10 text-gray-600',
  },
}

export default function PaymentRailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [rails, setRails] = useState<PaymentRail[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [handledCallback, setHandledCallback] = useState(false)
  const [defaultPayoutMethod, setDefaultPayoutMethod] = useState<'card' | 'manual'>('card')
  const [minPayoutAmount, setMinPayoutAmount] = useState<number>(25)
  const [savingPayoutSettings, setSavingPayoutSettings] = useState(false)
  const [platformManaged, setPlatformManaged] = useState(false)

  const loadPaymentRails = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithCsrf('/api/payment-rails', {
        method: 'POST',
        body: JSON.stringify({ action: 'status' }),
      })

      const result = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to load payment rail status')
      }

      const status = result.data as PaymentRailsStatus
      const connectedId = status.merchant_id || status.identity_id || undefined
      const payoutSettings = status.payout_settings || {}

      setPlatformManaged(Boolean(status.platform_managed))
      setDefaultPayoutMethod(payoutSettings.default_method === 'manual' ? 'manual' : 'card')
      setMinPayoutAmount(typeof payoutSettings.min_payout_amount === 'number' ? payoutSettings.min_payout_amount : 25)

      setRails([
        {
          id: 'card',
          type: 'card',
          name: 'Card Processor',
          is_connected: status.connected,
          account_id: connectedId,
        },
        {
          id: 'manual',
          type: 'manual',
          name: 'Manual Payouts',
          is_connected: true,
        },
      ])
    } catch (err: any) {
      setError(err.message || 'Failed to load payment rails')
      setRails([
        {
          id: 'card',
          type: 'card',
          name: 'Card Processor',
          is_connected: false,
        },
        {
          id: 'manual',
          type: 'manual',
          name: 'Manual Payouts',
          is_connected: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPaymentRails()
  }, [])

  useEffect(() => {
    if (handledCallback) return

    const onboardingState = searchParams.get('onboarding')
    const identityId = searchParams.get('identity_id')
    const state = searchParams.get('state')

    if (onboardingState === 'expired') {
      setHandledCallback(true)
      setError('Onboarding session expired. Start onboarding again.')
      router.replace('/settings/payment-rails')
      return
    }

    if (onboardingState === 'success' && identityId) {
      if (!state) {
        setHandledCallback(true)
        setError('Invalid callback. Please start onboarding again.')
        router.replace('/settings/payment-rails')
        return
      }

      setHandledCallback(true)
      ;(async () => {
        try {
          setConnecting('card')
          const res = await fetchWithCsrf('/api/payment-rails', {
            method: 'POST',
            body: JSON.stringify({ action: 'save_identity', identity_id: identityId, state }),
          })
          const result = await res.json()
          if (!res.ok || !result.success) {
            throw new Error(result.error || 'Failed to sync processor account')
          }

          setInfo('Processor account connected successfully.')
          await loadPaymentRails()
          router.replace('/settings/payment-rails')
        } catch (err: any) {
          setError(err.message || 'Failed to finalize connection')
          router.replace('/settings/payment-rails')
        } finally {
          setConnecting(null)
        }
      })()
    }
  }, [handledCallback, searchParams, router])

  const handleConnect = async (railType: 'card' | 'manual') => {
    setError(null)
    setInfo(null)

    if (railType === 'manual') {
      setInfo('Manual payouts are always available.')
      return
    }

    if (platformManaged) {
      setInfo('Card processing is managed at the platform level.')
      return
    }

    setConnecting(railType)
    try {
      const res = await fetchWithCsrf('/api/payment-rails', {
        method: 'POST',
        body: JSON.stringify({ action: 'create_onboarding_link' }),
      })
      const result = await res.json()
      if (!res.ok || !result.success || !result.data?.url) {
        throw new Error(result.error || 'Unable to create onboarding link')
      }

      window.location.href = result.data.url
      return
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
      setConnecting(null)
    }
  }

  const handleSavePayoutSettings = async () => {
    setSavingPayoutSettings(true)
    setError(null)
    setInfo(null)

    try {
      const res = await fetchWithCsrf('/api/payment-rails', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_payout_settings',
          default_payout_method: defaultPayoutMethod,
          min_payout_amount: minPayoutAmount,
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save payout settings')
      }

      setInfo('Payout settings saved.')
      await loadPaymentRails()
    } catch (err: any) {
      setError(err.message || 'Failed to save payout settings')
    } finally {
      setSavingPayoutSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Payment Rails</h1>
        <p className="text-muted-foreground mt-1">
          Configure how you receive payments and issue payouts
        </p>
      </div>

      {platformManaged ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground font-medium">Processor connection is platform-managed</p>
              <p className="text-sm text-muted-foreground mt-1">
                This workspace uses a single card processor account across all ledgers. You can still configure payout preferences below.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">Processor-first payout stack</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use your card processor for provider-managed payments and payouts. Manual transfers stay available for fallback operations.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {info && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {info}
        </div>
      )}

      <div className="space-y-4">
        {rails.map((rail) => {
          const config = RAIL_CONFIG[rail.type]
          const Icon = config.icon

          return (
            <div key={rail.id} className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${config.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{config.name}</h3>
                      {rail.is_connected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
                          <Check className="w-3 h-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {config.description}
                    </p>
                    {rail.is_connected && rail.account_id && (
                      <p className="text-xs text-muted-foreground mt-2 font-mono">
                        Account: {rail.account_id}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  {rail.is_connected ? (
                    <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      Settings
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(rail.type)}
                      disabled={connecting === rail.type}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm"
                    >
                      {connecting === rail.type ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Payout Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Default payout method
            </label>
            <select
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              value={defaultPayoutMethod}
              onChange={(e) => setDefaultPayoutMethod(e.target.value === 'manual' ? 'manual' : 'card')}
            >
              <option value="card">Card Processor</option>
              <option value="manual">Manual / Bank Transfer</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Used when a creator hasn&apos;t specified a preference
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Minimum payout amount
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <input
                type="number"
                value={minPayoutAmount}
                onChange={(e) => setMinPayoutAmount(Number(e.target.value))}
                min={1}
                className="w-32 px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Balances below this amount will roll over to the next payout period
            </p>
          </div>

          <div>
            <button
              onClick={handleSavePayoutSettings}
              disabled={savingPayoutSettings}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm"
            >
              {savingPayoutSettings && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingPayoutSettings ? 'Saving...' : 'Save Payout Settings'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        <a
          href="/docs/api#process-payout"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          View payout API documentation
        </a>
      </div>
    </div>
  )
}
