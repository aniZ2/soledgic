'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewLedgerPage() {
  const [name, setName] = useState('')
  const [platformFee, setPlatformFee] = useState('20')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Get organization ID from API
      const orgRes = await fetch('/api/organizations')
      const orgData = await orgRes.json()
      
      if (!orgData.organizations || orgData.organizations.length === 0) {
        router.push('/onboarding')
        return
      }

      const response = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform_name: name,
          organization_id: orgData.organizations[0].id,
          settings: {
            default_platform_fee_percent: parseInt(platformFee),
          },
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create ledger')
      }

      router.push(`/ledgers/${result.ledger.id}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/ledgers"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledgers
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Create new ledger</h1>
      <p className="mt-2 text-muted-foreground">
        A ledger is a separate set of books for one business or project.
      </p>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
              Business name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="My SaaS"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              This is how the ledger will appear in your dashboard.
            </p>
          </div>

          <div>
            <label htmlFor="fee" className="block text-sm font-medium text-foreground mb-2">
              Default platform fee (%)
            </label>
            <input
              id="fee"
              type="number"
              min="0"
              max="100"
              value={platformFee}
              onChange={(e) => setPlatformFee(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              For creator platforms: percentage you keep from each sale. Set to 100 for non-marketplace businesses.
            </p>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !name}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create ledger'}
            </button>
            <Link
              href="/ledgers"
              className="px-6 py-3 border border-border rounded-md text-foreground hover:bg-accent"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
