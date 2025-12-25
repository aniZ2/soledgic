'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewSalePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: ledgerId } = use(params)
  
  const [amount, setAmount] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [description, setDescription] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/ledgers/${ledgerId}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(parseFloat(amount) * 100),
          creator_id: creatorId || undefined,
          description,
          reference_id: referenceId || `sale_${Date.now()}`,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to record sale')
      }

      router.push(`/ledgers/${ledgerId}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/ledgers/${ledgerId}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Record Sale</h1>
      <p className="mt-2 text-muted-foreground">
        Add a new sale transaction to your ledger.
      </p>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-2">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full pl-8 pr-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label htmlFor="creatorId" className="block text-sm font-medium text-foreground mb-2">
              Creator ID (optional)
            </label>
            <input
              id="creatorId"
              type="text"
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Leave empty for platform-only revenue"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              For marketplace sales, enter the creator's ID to track their revenue split.
            </p>
          </div>

          <div>
            <label htmlFor="referenceId" className="block text-sm font-medium text-foreground mb-2">
              Reference ID (optional)
            </label>
            <input
              id="referenceId"
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., stripe_pi_xxx or order_123"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              External reference for reconciliation (Stripe payment ID, order number, etc.)
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="What was sold?"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !amount}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Recording...' : 'Record sale'}
            </button>
            <Link
              href={`/ledgers/${ledgerId}`}
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
