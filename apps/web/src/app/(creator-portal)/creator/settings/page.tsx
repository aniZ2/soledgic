'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface PayoutStatus {
  configured: boolean
  bank_last4: string | null
  bank_name: string | null
  payouts_enabled: boolean
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function CreatorSettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [handledCallback, setHandledCallback] = useState(false)

  const loadStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithCsrf('/api/creator/payout-setup', {
        method: 'POST',
        body: JSON.stringify({ action: 'status' }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to load payout status')
      }
      setPayoutStatus(result.data)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load payout settings'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  // Handle callback from processor form
  useEffect(() => {
    if (handledCallback) return

    const payoutSetup = searchParams.get('payout_setup')
    const identityId = searchParams.get('identity_id')
    const state = searchParams.get('state')

    if (payoutSetup === 'expired') {
      setHandledCallback(true)
      setError('Payout setup session expired. Please try again.')
      router.replace('/creator/settings')
      return
    }

    if (payoutSetup === 'success' && identityId) {
      if (!state) {
        setHandledCallback(true)
        setError('Invalid callback. Please start setup again.')
        router.replace('/creator/settings')
        return
      }

      setHandledCallback(true)
      ;(async () => {
        setSettingUp(true)
        setError(null)
        setInfo(null)
        try {
          const res = await fetchWithCsrf('/api/creator/payout-setup', {
            method: 'POST',
            body: JSON.stringify({ action: 'save_payout_method', identity_id: identityId, state }),
          })
          const result = await res.json()
          if (!res.ok || !result.success) {
            throw new Error(result.error || 'Failed to save payout method')
          }

          setInfo('Bank account saved successfully.')
          await loadStatus()
          router.replace('/creator/settings')
        } catch (err: unknown) {
          setError(getErrorMessage(err, 'Failed to finalize payout setup'))
          router.replace('/creator/settings')
        } finally {
          setSettingUp(false)
        }
      })()
    }
  }, [handledCallback, searchParams, router])

  const handleSetupPayout = async () => {
    setError(null)
    setInfo(null)
    setSettingUp(true)

    try {
      const res = await fetchWithCsrf('/api/creator/payout-setup', {
        method: 'POST',
        body: JSON.stringify({ action: 'create_setup_link' }),
      })
      const result = await res.json()
      if (!res.ok || !result.success || !result.data?.url) {
        throw new Error(result.error || 'Unable to start payout setup')
      }

      window.location.href = result.data.url
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to start payout setup'))
      setSettingUp(false)
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
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold text-foreground">Creator Settings</h1>
      <p className="text-muted-foreground mt-2">
        Manage your payout settings and bank account details.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {info && (
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700">
          {info}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Payout Method</h2>

        {payoutStatus?.configured ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Your bank account is connected for payouts.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  {payoutStatus.bank_name && (
                    <p className="text-sm font-medium text-foreground">{payoutStatus.bank_name}</p>
                  )}
                  {payoutStatus.bank_last4 && (
                    <p className="text-sm text-muted-foreground">
                      Account ending in {payoutStatus.bank_last4}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  Active
                </span>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={handleSetupPayout}
                disabled={settingUp}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-60"
              >
                {settingUp ? 'Opening...' : 'Update Bank Account'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a bank account to receive payouts from the platform.
            </p>
            <div className="mt-4">
              <button
                onClick={handleSetupPayout}
                disabled={settingUp}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {settingUp ? 'Opening...' : 'Set Up Bank Account'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
