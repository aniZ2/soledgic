'use client'

import { useEffect, useState } from 'react'
import { Loader2, Link2, ShieldCheck, WalletCards } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

type IdentityProfile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  timezone: string
  date_format: string
  currency: string
}

type TaxProfile = {
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
} | null

type PayoutProfile = {
  default_method: string
  schedule: string
  minimum_amount: number
  currency: string
  country: string | null
  payouts_enabled: boolean
} | null

type PortfolioSummary = {
  participantCount: number
  ledgerCount: number
  organizationCount: number
  totalsByCurrency: Array<{
    currency: string
    participantCount: number
    ledgerCount: number
    ledgerBalance: number
    heldAmount: number
    availableBalance: number
  }>
}

type PortfolioParticipant = {
  linkId: string
  participantId: string
  ledgerId: string
  ledgerName: string | null
  organizationName: string | null
  name: string | null
  email: string | null
  ledgerBalance: number
  heldAmount: number
  availableBalance: number
  currency: string
  linkedAt: string | null
}

function currency(amount: number, code = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
  }).format(amount)
}

export default function IdentitySettingsPage() {
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingTax, setSavingTax] = useState(false)
  const [savingPayout, setSavingPayout] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [profile, setProfile] = useState<IdentityProfile | null>(null)
  const [taxProfile, setTaxProfile] = useState<TaxProfile>(null)
  const [payoutProfile, setPayoutProfile] = useState<PayoutProfile>(null)
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [participants, setParticipants] = useState<PortfolioParticipant[]>([])

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

  function createEmptyPayoutProfile(): PayoutProfile {
    return {
      default_method: 'manual',
      schedule: 'manual',
      minimum_amount: 0,
      currency: 'USD',
      country: 'US',
      payouts_enabled: false,
    }
  }

  async function loadIdentity() {
    setLoading(true)
    setError(null)

    try {
      const [profileRes, taxRes, payoutRes, portfolioRes] = await Promise.all([
        fetch('/api/identity/profile', { cache: 'no-store' }),
        fetch('/api/identity/tax-profile', { cache: 'no-store' }),
        fetch('/api/identity/payout-profile', { cache: 'no-store' }),
        fetch('/api/identity/portfolio', { cache: 'no-store' }),
      ])

      const [profileData, taxData, payoutData, portfolioData] = await Promise.all([
        profileRes.json(),
        taxRes.json(),
        payoutRes.json(),
        portfolioRes.json(),
      ])

      if (!profileRes.ok) throw new Error(profileData.error || 'Failed to load identity profile')
      if (!taxRes.ok) throw new Error(taxData.error || 'Failed to load tax profile')
      if (!payoutRes.ok) throw new Error(payoutData.error || 'Failed to load payout profile')
      if (!portfolioRes.ok) throw new Error(portfolioData.error || 'Failed to load portfolio')

      setProfile(profileData.profile || null)
      setTaxProfile(taxData.tax_profile || createEmptyTaxProfile())
      setPayoutProfile(payoutData.payout_profile || createEmptyPayoutProfile())
      setSummary(portfolioData.summary || null)
      setParticipants(portfolioData.participants || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load identity settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIdentity()
  }, [])

  async function saveProfile() {
    if (!profile) return
    setSavingProfile(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetchWithCsrf('/api/identity/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          timezone: profile.timezone,
          date_format: profile.date_format,
          currency: profile.currency,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save profile')
      setProfile(data.profile || null)
      setMessage('Identity profile saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveTaxProfile() {
    setSavingTax(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetchWithCsrf('/api/identity/tax-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: taxProfile?.legal_name || '',
          tax_id_type: taxProfile?.tax_id_type || null,
          tax_id_last4: taxProfile?.tax_id_last4 || '',
          business_type: taxProfile?.business_type || null,
          address: taxProfile?.address || {},
          certify: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save tax profile')
      setTaxProfile(data.tax_profile || null)
      setMessage('Shared tax profile saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save tax profile')
    } finally {
      setSavingTax(false)
    }
  }

  async function savePayoutProfile() {
    setSavingPayout(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetchWithCsrf('/api/identity/payout-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_method: payoutProfile?.default_method || 'manual',
          schedule: payoutProfile?.schedule || 'manual',
          minimum_amount: payoutProfile?.minimum_amount || 0,
          currency: payoutProfile?.currency || 'USD',
          country: payoutProfile?.country || 'US',
          payouts_enabled: payoutProfile?.payouts_enabled || false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save payout profile')
      setPayoutProfile(data.payout_profile || null)
      setMessage('Shared payout profile saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save payout profile')
    } finally {
      setSavingPayout(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading identity settings...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Identity</h1>
        <p className="mt-1 text-muted-foreground">
          One user across your ecosystem, with separate ledger-scoped balances and shared tax and payout profiles.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <WalletCards className="h-4 w-4" />
            Linked Participants
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {summary?.participantCount || 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Separate balances remain attached to each platform ledger
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link2 className="h-4 w-4" />
            Linked Ledgers
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {summary?.ledgerCount || 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Spanning {summary?.organizationCount || 0} organizations
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Organizations
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {summary?.organizationCount || 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared identity, but permissions stay product-specific
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <WalletCards className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Balance Overview</h2>
            <p className="text-sm text-muted-foreground">
              Read-only portfolio totals across linked ledgers. Funds do not move automatically between products.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.totalsByCurrency || []).map((totals) => (
            <div key={totals.currency} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{totals.currency}</span>
                <span className="text-xs text-muted-foreground">
                  {totals.ledgerCount} ledgers
                </span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Available</span>
                  <span className="font-medium text-foreground">{currency(totals.availableBalance, totals.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">On hold</span>
                  <span className="font-medium text-foreground">{currency(totals.heldAmount, totals.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ledger total</span>
                  <span className="font-medium text-foreground">{currency(totals.ledgerBalance, totals.currency)}</span>
                </div>
              </div>
            </div>
          ))}
          {(summary?.totalsByCurrency || []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              No linked participant balances yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 xl:col-span-1">
          <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Email</span>
              <input value={profile?.email || ''} disabled className="w-full rounded-md border border-border bg-muted px-3 py-2 text-foreground" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Full Name</span>
              <input
                value={profile?.full_name || ''}
                onChange={(event) => setProfile((current) => current ? { ...current, full_name: event.target.value } : current)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Timezone</span>
              <input
                value={profile?.timezone || 'America/New_York'}
                onChange={(event) => setProfile((current) => current ? { ...current, timezone: event.target.value } : current)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Date Format</span>
              <input
                value={profile?.date_format || 'MM/DD/YYYY'}
                onChange={(event) => setProfile((current) => current ? { ...current, date_format: event.target.value } : current)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 xl:col-span-1">
          <h2 className="text-lg font-semibold text-foreground">Shared Tax Profile</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Legal Name</span>
              <input
                value={taxProfile?.legal_name || ''}
                  onChange={(event) => setTaxProfile((current) => ({
                    legal_name: event.target.value,
                    tax_id_type: current?.tax_id_type || null,
                    tax_id_last4: current?.tax_id_last4 || null,
                    business_type: current?.business_type || null,
                    address: current?.address || createEmptyTaxProfile()!.address,
                    certified_at: current?.certified_at || null,
                  }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Tax ID Type</span>
                <select
                  value={taxProfile?.tax_id_type || ''}
                  onChange={(event) => setTaxProfile((current) => ({ ...(current || createEmptyTaxProfile()!), tax_id_type: event.target.value || null }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="">Select</option>
                  <option value="ssn">SSN</option>
                  <option value="ein">EIN</option>
                  <option value="itin">ITIN</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Tax ID Last 4</span>
                <input
                  value={taxProfile?.tax_id_last4 || ''}
                  onChange={(event) => setTaxProfile((current) => ({ ...(current || createEmptyTaxProfile()!), tax_id_last4: event.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Business Type</span>
              <select
                value={taxProfile?.business_type || ''}
                onChange={(event) => setTaxProfile((current) => ({ ...(current || createEmptyTaxProfile()!), business_type: event.target.value || null }))}
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
              <span className="mb-1 block text-muted-foreground">Address Line 1</span>
              <input
                value={taxProfile?.address.line1 || ''}
                onChange={(event) => setTaxProfile((current) => ({
                  ...(current || createEmptyTaxProfile()!),
                  address: { ...(current?.address || createEmptyTaxProfile()!.address), line1: event.target.value },
                }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <button
              type="button"
              onClick={saveTaxProfile}
              disabled={savingTax}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {savingTax && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Tax Profile
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 xl:col-span-1">
          <h2 className="text-lg font-semibold text-foreground">Shared Payout Profile</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Default Method</span>
                <select
                  value={payoutProfile?.default_method || 'manual'}
                  onChange={(event) => setPayoutProfile((current) => ({
                    default_method: event.target.value,
                    schedule: current?.schedule || 'manual',
                    minimum_amount: current?.minimum_amount || 0,
                    currency: current?.currency || 'USD',
                    country: current?.country || 'US',
                    payouts_enabled: current?.payouts_enabled || false,
                  }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="manual">Manual</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Schedule</span>
                <select
                  value={payoutProfile?.schedule || 'manual'}
                  onChange={(event) => setPayoutProfile((current) => current ? { ...current, schedule: event.target.value } : current)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="manual">Manual</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Minimum Amount (cents)</span>
              <input
                type="number"
                min={0}
                value={payoutProfile?.minimum_amount || 0}
                onChange={(event) => setPayoutProfile((current) => current ? { ...current, minimum_amount: Number(event.target.value) } : current)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <button
              type="button"
              onClick={savePayoutProfile}
              disabled={savingPayout}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {savingPayout && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Payout Profile
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Linked Participants</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These remain separate ledger balances even though the identity is shared.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Participant</th>
                <th className="py-2 pr-4 font-medium">Ledger</th>
                <th className="py-2 pr-4 font-medium">Available</th>
                <th className="py-2 pr-4 font-medium">Held</th>
                <th className="py-2 pr-4 font-medium">Linked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted-foreground">
                    No participant records are linked to this identity yet.
                  </td>
                </tr>
              ) : participants.map((participant) => (
                <tr key={participant.linkId}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-foreground">{participant.name || participant.participantId}</div>
                    <div className="text-xs text-muted-foreground">{participant.email || participant.participantId}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="text-foreground">{participant.ledgerName || participant.ledgerId}</div>
                    <div className="text-xs text-muted-foreground">{participant.organizationName || 'Unassigned org'}</div>
                  </td>
                  <td className="py-3 pr-4 text-foreground">{currency(participant.availableBalance, participant.currency)}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{currency(participant.heldAmount, participant.currency)}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {participant.linkedAt ? new Date(participant.linkedAt).toLocaleString() : 'Unknown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
