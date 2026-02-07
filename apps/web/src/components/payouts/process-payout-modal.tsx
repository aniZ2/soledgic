'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, DollarSign } from 'lucide-react'

interface Creator {
  id: string
  entity_id: string
  name: string
  balance: number
  metadata?: {
    email?: string
  }
}

interface ProcessPayoutModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  apiKey: string
  preselectedCreator?: Creator
  onSuccess?: () => void
}

export function ProcessPayoutModal({
  isOpen,
  onClose,
  ledgerId,
  apiKey,
  preselectedCreator,
  onSuccess
}: ProcessPayoutModalProps) {
  const [loading, setLoading] = useState(false)
  const [loadingCreators, setLoadingCreators] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [creators, setCreators] = useState<Creator[]>([])

  // Form state
  const [selectedCreatorId, setSelectedCreatorId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (isOpen && !preselectedCreator) {
      loadCreators()
    }
    if (preselectedCreator) {
      setSelectedCreatorId(preselectedCreator.entity_id)
      setCreators([preselectedCreator])
    }
  }, [isOpen, preselectedCreator])

  const loadCreators = async () => {
    setLoadingCreators(true)
    try {
      const response = await fetch(`/api/creators?ledger_id=${ledgerId}`)
      if (response.ok) {
        const data = await response.json()
        setCreators(data.creators || [])
      }
    } catch (err) {
      console.error('Failed to load creators:', err)
    } finally {
      setLoadingCreators(false)
    }
  }

  const selectedCreator = creators.find(c => c.entity_id === selectedCreatorId)
  const maxAmount = selectedCreator?.balance || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCreatorId) {
      setError('Please select a creator')
      return
    }

    const amountCents = Math.floor(parseFloat(amount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (amountCents > maxAmount) {
      setError('Amount exceeds available balance')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-payout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            creator_id: selectedCreatorId,
            amount: amountCents,
            description: description.trim() || undefined,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process payout')
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose()
        // Reset form
        setSuccess(false)
        setSelectedCreatorId('')
        setAmount('')
        setDescription('')
      }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Process Payout</h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {success ? (
            <div className="py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Payout Processed!</h3>
              <p className="text-muted-foreground mt-1">
                {formatCurrency(Math.floor(parseFloat(amount) * 100))} sent to {selectedCreator?.name}
              </p>
            </div>
          ) : (
            <>
              {/* Creator Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Creator
                </label>
                {loadingCreators ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading creators...
                  </div>
                ) : preselectedCreator ? (
                  <div className="px-3 py-2 bg-muted rounded-md">
                    <p className="font-medium text-foreground">{preselectedCreator.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Balance: {formatCurrency(preselectedCreator.balance)}
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedCreatorId}
                    onChange={(e) => setSelectedCreatorId(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Select a creator</option>
                    {creators.map((creator) => (
                      <option key={creator.entity_id} value={creator.entity_id}>
                        {creator.name} - {formatCurrency(creator.balance)} available
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Amount
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={maxAmount / 100}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                {selectedCreator && (
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-muted-foreground">
                      Available: {formatCurrency(maxAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAmount((maxAmount / 100).toFixed(2))}
                      className="text-primary hover:underline"
                    >
                      Pay full balance
                    </button>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Monthly payout"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !selectedCreatorId || !amount}
                  className="flex-1 bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Processing...' : 'Process Payout'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-border rounded-md text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
