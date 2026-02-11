'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, ArrowRightLeft } from 'lucide-react'

interface RecordTransferModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  apiKey: string
  onSuccess?: () => void
}

const TRANSFER_TYPES = [
  { value: 'tax_reserve', label: 'Tax Reserve', description: 'Set aside funds for taxes' },
  { value: 'payout_reserve', label: 'Payout Reserve', description: 'Reserve for upcoming payouts' },
  { value: 'owner_draw', label: 'Owner Draw', description: 'Owner withdrawal from business' },
  { value: 'owner_contribution', label: 'Owner Contribution', description: 'Owner adding funds to business' },
  { value: 'operating', label: 'Operating Transfer', description: 'Move between operating accounts' },
  { value: 'savings', label: 'Savings', description: 'Transfer to savings account' },
  { value: 'investment', label: 'Investment', description: 'Transfer for investment purposes' },
  { value: 'other', label: 'Other', description: 'Other internal transfer' },
]

const ACCOUNT_TYPES = [
  { value: 'cash', label: 'Cash / Bank Account' },
  { value: 'stripe', label: 'Finix Balance' },
  { value: 'platform_revenue', label: 'Platform Revenue' },
  { value: 'tax_reserve', label: 'Tax Reserve' },
  { value: 'payout_reserve', label: 'Payout Reserve' },
  { value: 'owner_equity', label: 'Owner Equity' },
  { value: 'owner_draw', label: 'Owner Draws' },
  { value: 'savings', label: 'Savings Account' },
]

export function RecordTransferModal({
  isOpen,
  onClose,
  ledgerId,
  apiKey,
  onSuccess
}: RecordTransferModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [amount, setAmount] = useState('')
  const [fromAccount, setFromAccount] = useState('cash')
  const [toAccount, setToAccount] = useState('tax_reserve')
  const [transferType, setTransferType] = useState('tax_reserve')
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amountCents = Math.floor(parseFloat(amount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (fromAccount === toAccount) {
      setError('From and To accounts must be different')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/record-transfer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            from_account_type: fromAccount,
            to_account_type: toAccount,
            amount: amountCents,
            transfer_type: transferType,
            description: description.trim() || undefined,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to record transfer')
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose()
        resetForm()
      }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSuccess(false)
    setAmount('')
    setFromAccount('cash')
    setToAccount('tax_reserve')
    setTransferType('tax_reserve')
    setDescription('')
    setError(null)
  }

  // Update toAccount when transferType changes
  const handleTransferTypeChange = (type: string) => {
    setTransferType(type)
    // Set sensible defaults based on transfer type
    switch (type) {
      case 'tax_reserve':
        setToAccount('tax_reserve')
        break
      case 'payout_reserve':
        setToAccount('payout_reserve')
        break
      case 'owner_draw':
        setToAccount('owner_draw')
        break
      case 'owner_contribution':
        setFromAccount('owner_equity')
        setToAccount('cash')
        break
      case 'savings':
        setToAccount('savings')
        break
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-500" />
            Record Transfer
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {success ? (
            <div className="py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Transfer Recorded</h3>
              <p className="text-muted-foreground mt-1">
                ${parseFloat(amount).toFixed(2)} has been transferred.
              </p>
            </div>
          ) : (
            <>
              {/* Transfer Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Transfer Type
                </label>
                <select
                  value={transferType}
                  onChange={(e) => handleTransferTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {TRANSFER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {TRANSFER_TYPES.find(t => t.value === transferType)?.description}
                </p>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* From Account */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  From Account
                </label>
                <select
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {ACCOUNT_TYPES.map((acc) => (
                    <option key={acc.value} value={acc.value}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Arrow indicator */}
              <div className="flex justify-center">
                <ArrowRightLeft className="w-5 h-5 text-muted-foreground rotate-90" />
              </div>

              {/* To Account */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  To Account
                </label>
                <select
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {ACCOUNT_TYPES.map((acc) => (
                    <option key={acc.value} value={acc.value}>
                      {acc.label}
                    </option>
                  ))}
                </select>
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
                  placeholder="e.g., Q1 estimated taxes"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !amount}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Transferring...' : 'Record Transfer'}
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
