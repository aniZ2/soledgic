'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
]

export default function NewConnectedAccountPage() {
  const [ledgers, setLedgers] = useState<any[]>([])
  const [ledgerId, setLedgerId] = useState('')
  const [entityType, setEntityType] = useState<string>('creator')
  const [entityId, setEntityId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadLedgers() {
      const res = await fetch('/api/ledgers')
      const data = await res.json()
      setLedgers(data.ledgers || [])
      if (data.ledgers?.length === 1) {
        setLedgerId(data.ledgers[0].id)
      }
    }
    loadLedgers()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Step 1: Create the connected account
      const createRes = await fetch('/api/connected-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledger_id: ledgerId,
          action: 'create',
          entity_type: entityType,
          entity_id: entityId,
          email: email || undefined,
          display_name: displayName || undefined,
          country,
        }),
      })

      const createResult = await createRes.json()

      if (!createRes.ok) {
        throw new Error(createResult.error || 'Failed to create account')
      }

      const stripeAccountId = createResult.account?.stripe_account_id
      if (!stripeAccountId) {
        throw new Error('Account created but missing Stripe account ID')
      }

      // Step 2: Create onboarding link and redirect
      const linkRes = await fetch('/api/connected-accounts', {
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

      const linkResult = await linkRes.json()

      if (!linkRes.ok) {
        throw new Error(linkResult.error || 'Failed to create onboarding link')
      }

      if (linkResult.onboarding_url) {
        window.location.href = linkResult.onboarding_url
      } else {
        throw new Error('No onboarding URL returned')
      }
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/connected-accounts"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to connected accounts
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Add Connected Account</h1>
      <p className="mt-2 text-muted-foreground">
        Create a Stripe connected account and start KYC onboarding.
      </p>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ledger Selection */}
          {ledgers.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Ledger
              </label>
              <select
                value={ledgerId}
                onChange={(e) => setLedgerId(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a ledger</option>
                {ledgers.map((ledger) => (
                  <option key={ledger.id} value={ledger.id}>
                    {ledger.platform_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Entity Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Entity Type *
            </label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              required
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="creator">Creator</option>
              <option value="venture">Venture</option>
              <option value="merchant">Merchant</option>
            </select>
          </div>

          {/* Entity ID */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Entity ID *
            </label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              required
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Your platform's ID for this person/business"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The unique identifier from your platform (e.g., user ID, merchant ID).
            </p>
          </div>

          {/* Display Name + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="jane@example.com"
              />
            </div>
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !entityType || !entityId || (!ledgerId && ledgers.length > 1)}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating & redirecting to Stripe...' : 'Create & start onboarding'}
            </button>
            <Link
              href="/connected-accounts"
              className="px-6 py-3 border border-border rounded-md text-foreground hover:bg-accent text-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
