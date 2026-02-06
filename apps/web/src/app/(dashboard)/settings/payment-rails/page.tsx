'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CreditCard, Building, Wallet, Check, ExternalLink,
  Loader2, AlertCircle, Plus,
} from 'lucide-react'

interface PaymentRail {
  id: string
  type: 'stripe' | 'plaid' | 'paypal' | 'manual'
  name: string
  is_connected: boolean
  account_id?: string
  created_at?: string
}

const RAIL_CONFIG = {
  stripe: {
    name: 'Stripe',
    description: 'Accept card payments and issue payouts via Stripe Connect',
    icon: CreditCard,
    color: 'bg-purple-500/10 text-purple-600',
  },
  plaid: {
    name: 'Plaid',
    description: 'Verify bank accounts and enable ACH transfers',
    icon: Building,
    color: 'bg-green-500/10 text-green-600',
  },
  paypal: {
    name: 'PayPal',
    description: 'Accept PayPal payments and issue PayPal payouts',
    icon: Wallet,
    color: 'bg-blue-500/10 text-blue-600',
  },
  manual: {
    name: 'Manual Payouts',
    description: 'Record manual bank transfers, checks, or other payment methods',
    icon: CreditCard,
    color: 'bg-gray-500/10 text-gray-600',
  },
}

export default function PaymentRailsPage() {
  const [loading, setLoading] = useState(true)
  const [rails, setRails] = useState<PaymentRail[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)

  useEffect(() => {
    loadPaymentRails()
  }, [])

  const loadPaymentRails = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return

    // Get organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization:organizations(stripe_customer_id)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    // For now, show available rails with connection status based on org data
    const org = membership?.organization as { stripe_customer_id?: string } | null

    setRails([
      {
        id: 'stripe',
        type: 'stripe',
        name: 'Stripe',
        is_connected: !!org?.stripe_customer_id,
        account_id: org?.stripe_customer_id || undefined,
      },
      {
        id: 'plaid',
        type: 'plaid',
        name: 'Plaid',
        is_connected: false,
      },
      {
        id: 'paypal',
        type: 'paypal',
        name: 'PayPal',
        is_connected: false,
      },
      {
        id: 'manual',
        type: 'manual',
        name: 'Manual Payouts',
        is_connected: true, // Always available
      },
    ])

    setLoading(false)
  }

  const handleConnect = async (railType: string) => {
    setConnecting(railType)

    // Simulate connection flow - in production this would redirect to OAuth
    if (railType === 'stripe') {
      // Redirect to Stripe Connect onboarding
      window.location.href = '/api/billing?action=connect_stripe'
      return
    }

    // For other rails, show coming soon
    setTimeout(() => {
      setConnecting(null)
      alert(`${RAIL_CONFIG[railType as keyof typeof RAIL_CONFIG].name} integration coming soon!`)
    }, 1000)
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Payment Rails</h1>
        <p className="text-muted-foreground mt-1">
          Configure how you receive payments and issue payouts
        </p>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">Multiple rails supported</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect multiple payment providers to give your creators payout options.
              Each creator can choose their preferred method.
            </p>
          </div>
        </div>
      </div>

      {/* Payment rails list */}
      <div className="space-y-4">
        {rails.map((rail) => {
          const config = RAIL_CONFIG[rail.type]
          const Icon = config.icon

          return (
            <div
              key={rail.id}
              className="bg-card border border-border rounded-lg p-6"
            >
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
                    <button
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
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

      {/* Payout settings */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Payout Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Default payout method
            </label>
            <select className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground">
              <option value="stripe">Stripe</option>
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
                defaultValue={25}
                min={1}
                className="w-32 px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Balances below this amount will roll over to the next payout period
            </p>
          </div>
        </div>
      </div>

      {/* Documentation link */}
      <div className="mt-6 text-sm text-muted-foreground">
        <a
          href="/docs/api#payouts"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          View payout API documentation
        </a>
      </div>
    </div>
  )
}
