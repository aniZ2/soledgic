'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, User, Mail, Percent, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function NewCreatorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<{ id: string; api_key: string; business_name: string } | null>(null)

  // Form state
  const [creatorId, setCreatorId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [splitPercent, setSplitPercent] = useState('80')

  useEffect(() => {
    loadLedger()
  }, [])

  const loadLedger = async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession(); const user = session?.user
    if (!user) {
      router.push('/login')
      return
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      router.push('/onboarding')
      return
    }

    // Get livemode from cookie
    const livemodeCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('livemode='))
    const livemode = livemodeCookie?.split('=')[1] === 'true'

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, api_key, business_name')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)
      .limit(1)

    if (ledgers && ledgers.length > 0) {
      setLedger(ledgers[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ledger) {
      setError('No ledger found')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Generate creator ID if not provided
      const finalCreatorId = creatorId.trim() || `creator_${Date.now()}`

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-creator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ledger.api_key,
          },
          body: JSON.stringify({
            creator_id: finalCreatorId,
            display_name: displayName.trim() || undefined,
            email: email.trim() || undefined,
            default_split_percent: parseFloat(splitPercent) || 80,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create creator')
      }

      router.push('/dashboard/creators')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!ledger) {
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
          href="/dashboard/creators"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Creators
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Add Creator</h1>
        <p className="text-muted-foreground mt-1">
          Register a new creator who will receive payouts from {ledger.business_name}
        </p>
      </div>

      <div className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Creator ID */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <User className="w-4 h-4 inline-block mr-1" />
              Creator ID
            </label>
            <input
              type="text"
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              placeholder="e.g., creator_123 (auto-generated if empty)"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-sm text-muted-foreground mt-1">
              A unique identifier for this creator. Leave empty to auto-generate.
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Mail className="w-4 h-4 inline-block mr-1" />
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="creator@example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Used for payout notifications and creator portal access.
            </p>
          </div>

          {/* Split Percentage */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Percent className="w-4 h-4 inline-block mr-1" />
              Revenue Split (Creator %)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={splitPercent}
                onChange={(e) => setSplitPercent(e.target.value)}
                className="w-24 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-muted-foreground">%</span>
              <span className="text-sm text-muted-foreground ml-4">
                Platform keeps {100 - (parseFloat(splitPercent) || 0)}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Default revenue split for this creator. Can be overridden per sale.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Creator
            </button>
            <Link
              href="/dashboard/creators"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
