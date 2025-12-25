'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewPayoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: ledgerId } = use(params)
  const searchParams = useSearchParams()
  const preselectedCreator = searchParams.get('creator') || ''

  const [creatorId, setCreatorId] = useState(preselectedCreator)
  const [amount, setAmount] = useState('')
  const [payAll, setPayAll] = useState(true)
  const [method, setMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatorBalance, setCreatorBalance] = useState<number | null>(null)
  const [pendingCreators, setPendingCreators] = useState<any[]>([])

  const router = useRouter()

  useEffect(() => {
    async function loadPendingBalances() {
      const res = await fetch(`/api/ledgers/${ledgerId}/balances?type=creator_balance`)
      const data = await res.json()
      if (data.balances) {
        setPendingCreators(data.balances.filter((b: any) => b.balance > 0))
      }
    }
    loadPendingBalances()
  }, [ledgerId])

  useEffect(() => {
    const creator = pendingCreators.find(c => c.entity_id === creatorId)
    if (creator) {
      setCreatorBalance(creator.balance)
      if (payAll) {
        setAmount((creator.balance / 100).toFixed(2))
      }
    } else {
      setCreatorBalance(null)
    }
  }, [creatorId, pendingCreators, payAll])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/ledgers/${ledgerId}/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_id: creatorId,
          amount: payAll ? undefined : Math.round(parseFloat(amount) * 100),
          method,
          reference_id: reference || `payout_${Date.now()}`,
          notes,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process payout')
      }

      router.push(`/ledgers/${ledgerId}/payouts`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/ledgers/${ledgerId}/payouts`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to payouts
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Process Payout</h1>
      <p className="mt-2 text-muted-foreground">
        Pay out creator earnings from their balance.
      </p>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Creator Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Creator
            </label>
            {pendingCreators.length > 0 ? (
              <select
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a creator</option>
                {pendingCreators.map((creator) => (
                  <option key={creator.entity_id} value={creator.entity_id}>
                    {creator.entity_id} - ${(creator.balance / 100).toFixed(2)} available
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-4 py-3 bg-muted rounded-md text-muted-foreground text-sm">
                No creators with pending balance
              </div>
            )}
          </div>

          {creatorBalance !== null && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available balance</span>
                <span className="font-bold text-foreground">${(creatorBalance / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                id="payAll"
                checked={payAll}
                onChange={(e) => setPayAll(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              <label htmlFor="payAll" className="text-sm text-foreground">
                Pay full balance
              </label>
            </div>
            {!payAll && (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={creatorBalance ? creatorBalance / 100 : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required={!payAll}
                  className="w-full pl-8 pr-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Payment method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="bank_transfer">Bank Transfer (ACH)</option>
              <option value="check">Check</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe Connect</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Reference ID (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., check number, PayPal transaction ID"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Internal notes"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !creatorId || pendingCreators.length === 0}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Process payout'}
            </button>
            <Link
              href={`/ledgers/${ledgerId}/payouts`}
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
