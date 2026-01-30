'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface AccountActionsProps {
  stripeStatus: string | null
  detailsSubmitted: boolean
  stripeAccountId: string
  ledgerId: string
}

export function AccountActions({ stripeStatus, detailsSubmitted, stripeAccountId, ledgerId }: AccountActionsProps) {
  const [loading, setLoading] = useState(false)

  const handleOnboarding = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/connected-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledger_id: ledgerId,
          action: 'create_onboarding_link',
          stripe_account_id: stripeAccountId,
          return_url: `${window.location.origin}/connected-accounts/onboarding-complete`,
          refresh_url: `${window.location.origin}/connected-accounts/onboarding-refresh`,
        }),
      })
      const result = await response.json()
      if (result.onboarding_url) {
        window.location.href = result.onboarding_url
      }
    } catch (err) {
      console.error('Failed to create onboarding link:', err)
    } finally {
      setLoading(false)
    }
  }

  // Not enabled yet — start or continue onboarding
  if (stripeStatus === 'restricted' || (stripeStatus !== 'enabled' && !detailsSubmitted)) {
    return (
      <button
        onClick={handleOnboarding}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Loading...' : stripeStatus === 'restricted' ? 'Continue Onboarding' : 'Start Onboarding'}
      </button>
    )
  }

  // Enabled — offer to update details via Account Link (account_update)
  if (stripeStatus === 'enabled') {
    return (
      <button
        onClick={handleOnboarding}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {loading ? 'Loading...' : 'Update Details'}
      </button>
    )
  }

  return null
}
