'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  CreditCard,
  Building,
  ShieldCheck
} from 'lucide-react'

interface ConnectedAccount {
  id: string
  stripe_account_id: string | null
  stripe_status: string
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  requirements_current: any[]
  requirements_past_due: any[]
  default_bank_last4: string | null
  default_bank_name: string | null
  ledger: { business_name: string }
}

export default function ConnectStripePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])

  // Check for return from Stripe
  const stripeSuccess = searchParams.get('success') === 'true'
  const stripeRefresh = searchParams.get('refresh') === 'true'

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/creator/login')
      return
    }

    const { data: accounts, error: fetchError } = await supabase
      .from('connected_accounts')
      .select(`
        id,
        stripe_account_id,
        stripe_status,
        charges_enabled,
        payouts_enabled,
        details_submitted,
        requirements_current,
        requirements_past_due,
        default_bank_last4,
        default_bank_name,
        ledger:ledgers(business_name)
      `)
      .eq('email', user.email)
      .eq('is_active', true)

    if (fetchError) {
      setError(fetchError.message)
    } else {
      // Transform the data to match the interface (ledger comes as array from join)
      const transformedAccounts = (accounts || []).map(a => ({
        ...a,
        ledger: Array.isArray(a.ledger) && a.ledger.length > 0
          ? a.ledger[0]
          : { business_name: 'Unknown' }
      })) as ConnectedAccount[]
      setConnectedAccounts(transformedAccounts)
    }

    setLoading(false)
  }

  const handleConnectStripe = async (accountId: string) => {
    setConnecting(true)
    setError(null)

    try {
      const account = connectedAccounts.find(a => a.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      // Get API key for this ledger
      const supabase = createClient()
      const { data: ledger } = await supabase
        .from('ledgers')
        .select('api_key')
        .eq('id', (account.ledger as any).id)
        .single()

      if (!ledger?.api_key) {
        throw new Error('Could not get API key')
      }

      // Create onboarding link via edge function
      const response = await fetch('https://soledgic.supabase.co/functions/v1/connected-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ledger.api_key
        },
        body: JSON.stringify({
          action: 'create_onboarding_link',
          connected_account_id: accountId,
          return_url: `${window.location.origin}/creator/connect-stripe?success=true`,
          refresh_url: `${window.location.origin}/creator/connect-stripe?refresh=true`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create onboarding link')
      }

      // Redirect to Stripe
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setConnecting(false)
    }
  }

  const handleOpenDashboard = async (accountId: string) => {
    setConnecting(true)
    setError(null)

    try {
      const account = connectedAccounts.find(a => a.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      const supabase = createClient()
      const { data: ledger } = await supabase
        .from('ledgers')
        .select('api_key')
        .eq('id', (account.ledger as any).id)
        .single()

      if (!ledger?.api_key) {
        throw new Error('Could not get API key')
      }

      const response = await fetch('https://soledgic.supabase.co/functions/v1/connected-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ledger.api_key
        },
        body: JSON.stringify({
          action: 'create_login_link',
          connected_account_id: accountId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create dashboard link')
      }

      window.open(data.url, '_blank')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/creator/settings"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Connect Stripe</h1>
        <p className="text-muted-foreground mt-1">
          Connect your bank account to receive payouts
        </p>
      </div>

      {/* Success Message */}
      {stripeSuccess && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <div>
            <p className="font-medium text-green-600">Stripe account connected!</p>
            <p className="text-sm text-green-600/80">
              Your account is now set up to receive payouts.
            </p>
          </div>
        </div>
      )}

      {/* Refresh Message */}
      {stripeRefresh && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <div>
            <p className="font-medium text-amber-600">Please continue setup</p>
            <p className="text-sm text-amber-600/80">
              Click the button below to complete your Stripe account setup.
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-muted rounded-lg p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Secure Stripe Connect</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We use Stripe Connect to securely process your payouts. Your banking information
              is stored directly with Stripe - we never see or store your full account details.
            </p>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="space-y-4">
        {connectedAccounts.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No platforms have added you as a creator yet.
            </p>
          </div>
        ) : (
          connectedAccounts.map((account) => (
            <div key={account.id} className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {(account.ledger as any)?.business_name || 'Unknown Platform'}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge status={account.stripe_status} />
                    {account.payouts_enabled && (
                      <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
                        Payouts enabled
                      </span>
                    )}
                  </div>

                  {/* Bank info */}
                  {account.default_bank_last4 && (
                    <p className="text-sm text-muted-foreground mt-3">
                      <CreditCard className="w-4 h-4 inline-block mr-1" />
                      {account.default_bank_name} ****{account.default_bank_last4}
                    </p>
                  )}

                  {/* Requirements */}
                  {account.requirements_past_due && account.requirements_past_due.length > 0 && (
                    <div className="mt-3 text-sm text-amber-600">
                      <AlertCircle className="w-4 h-4 inline-block mr-1" />
                      {account.requirements_past_due.length} requirement(s) past due
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {!account.stripe_account_id || !account.details_submitted ? (
                    <button
                      onClick={() => handleConnectStripe(account.id)}
                      disabled={connecting}
                      className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {connecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      {account.stripe_account_id ? 'Complete Setup' : 'Connect Stripe'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenDashboard(account.id)}
                      disabled={connecting}
                      className="inline-flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {connecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      Stripe Dashboard
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
    restricted: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
    enabled: { bg: 'bg-green-500/10', text: 'text-green-600' },
    disabled: { bg: 'bg-red-500/10', text: 'text-red-600' },
  }
  const style = styles[status] || styles.pending

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
