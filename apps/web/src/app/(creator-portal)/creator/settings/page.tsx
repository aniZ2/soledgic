'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'

interface PayoutStatus {
  configured: boolean
  bank_last4: string | null
  bank_name: string | null
  payouts_enabled: boolean
}

interface TaxProfile {
  legal_name: string | null
  tax_id_type: string | null
  tax_id_last4: string | null
  business_type: string | null
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    country: string | null
  }
  certified_at: string | null
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function createEmptyTaxProfile(): TaxProfile {
  return {
    legal_name: null,
    tax_id_type: null,
    tax_id_last4: null,
    business_type: null,
    address: {
      line1: null,
      line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: 'US',
    },
    certified_at: null,
  }
}

export default function CreatorSettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | null>(null)
  const [taxProfile, setTaxProfile] = useState<TaxProfile>(createEmptyTaxProfile())
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [handledCallback, setHandledCallback] = useState(false)
  const [savingTax, setSavingTax] = useState(false)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  const loadStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const [payoutRes, taxRes] = await Promise.all([
        fetchWithCsrf('/api/creator/payout-setup', {
          method: 'POST',
          body: JSON.stringify({ action: 'status' }),
        }),
        fetch('/api/identity/tax-profile', { cache: 'no-store' }),
      ])

      const [payoutResult, taxResult] = await Promise.all([
        payoutRes.json(),
        taxRes.json(),
      ])

      if (!payoutRes.ok || !payoutResult.success) {
        throw new Error(payoutResult.error || 'Failed to load payout status')
      }
      if (!taxRes.ok) {
        throw new Error(taxResult.error || 'Failed to load tax profile')
      }

      setPayoutStatus(payoutResult.data)
      setTaxProfile(taxResult.tax_profile || createEmptyTaxProfile())
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

  const saveTaxProfile = async () => {
    setSavingTax(true)
    setError(null)
    setInfo(null)

    try {
      const res = await fetchWithCsrf('/api/identity/tax-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: taxProfile.legal_name || '',
          tax_id_type: taxProfile.tax_id_type || null,
          tax_id_last4: taxProfile.tax_id_last4 || '',
          business_type: taxProfile.business_type || null,
          address: taxProfile.address,
          certify: true,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        if (handleProtectedResponse(res, result, saveTaxProfile)) {
          return
        }
        throw new Error(result.error || 'Failed to save tax profile')
      }

      setTaxProfile(result.tax_profile || createEmptyTaxProfile())
      setInfo('Tax information saved successfully.')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save tax profile'))
    } finally {
      setSavingTax(false)
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

      {/* Tax Information */}
      <div id="tax" className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Tax Information</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep your tax profile on file so year-end reporting and payouts stay unblocked.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-foreground">Legal Name</span>
            <input
              value={taxProfile.legal_name || ''}
              onChange={(event) => setTaxProfile((current) => ({
                ...current,
                legal_name: event.target.value,
              }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground">Tax ID Type</span>
              <select
                value={taxProfile.tax_id_type || ''}
                onChange={(event) => setTaxProfile((current) => ({
                  ...current,
                  tax_id_type: event.target.value || null,
                }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Select</option>
                <option value="ssn">SSN</option>
                <option value="ein">EIN</option>
                <option value="itin">ITIN</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground">Tax ID Last 4</span>
              <input
                value={taxProfile.tax_id_last4 || ''}
                onChange={(event) => setTaxProfile((current) => ({
                  ...current,
                  tax_id_last4: event.target.value.replace(/\D/g, '').slice(0, 4),
                }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1.5 block text-foreground">Business Type</span>
            <select
              value={taxProfile.business_type || ''}
              onChange={(event) => setTaxProfile((current) => ({
                ...current,
                business_type: event.target.value || null,
              }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Select</option>
              <option value="individual">Individual</option>
              <option value="sole_proprietor">Sole Proprietor</option>
              <option value="llc">LLC</option>
              <option value="corporation">Corporation</option>
              <option value="partnership">Partnership</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block text-foreground">Address Line 1</span>
            <input
              value={taxProfile.address.line1 || ''}
              onChange={(event) => setTaxProfile((current) => ({
                ...current,
                address: { ...current.address, line1: event.target.value },
              }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground">City</span>
              <input
                value={taxProfile.address.city || ''}
                onChange={(event) => setTaxProfile((current) => ({
                  ...current,
                  address: { ...current.address, city: event.target.value },
                }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground">State</span>
              <input
                value={taxProfile.address.state || ''}
                onChange={(event) => setTaxProfile((current) => ({
                  ...current,
                  address: { ...current.address, state: event.target.value },
                }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-foreground">Postal Code</span>
              <input
                value={taxProfile.address.postal_code || ''}
                onChange={(event) => setTaxProfile((current) => ({
                  ...current,
                  address: { ...current.address, postal_code: event.target.value },
                }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div>
              <p className="font-medium text-foreground">Certification status</p>
              <p className="text-muted-foreground">
                {taxProfile.certified_at
                  ? `Certified on ${new Date(taxProfile.certified_at).toLocaleDateString('en-US')}`
                  : 'Not certified yet'}
              </p>
            </div>
            <button
              onClick={saveTaxProfile}
              disabled={savingTax}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {savingTax ? 'Saving...' : 'Save Tax Profile'}
            </button>
          </div>
        </div>
      </div>

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
