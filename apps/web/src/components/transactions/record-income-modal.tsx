'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, DollarSign } from 'lucide-react'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface RecordIncomeModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  onSuccess?: () => void
}

const CATEGORIES = [
  { value: 'sales', label: 'Sales Revenue' },
  { value: 'services', label: 'Service Revenue' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'affiliate', label: 'Affiliate Commission' },
  { value: 'interest', label: 'Interest Income' },
  { value: 'refund_received', label: 'Refund Received' },
  { value: 'other', label: 'Other Income' },
]

export function RecordIncomeModal({
  isOpen,
  onClose,
  ledgerId,
  onSuccess
}: RecordIncomeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('sales')
  const [referenceId, setReferenceId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [receivedTo, setReceivedTo] = useState('cash')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amountCents = Math.floor(parseFloat(amount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (!description.trim()) {
      setError('Please provide a description')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await callLedgerFunction('record-income', {
        ledgerId,
        method: 'POST',
        body: {
          reference_id: referenceId.trim() || `income_${Date.now()}`,
          amount: amountCents,
          description: description.trim(),
          category,
          customer_name: customerName.trim() || undefined,
          received_to: receivedTo,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to record income')
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
    setDescription('')
    setCategory('sales')
    setReferenceId('')
    setCustomerName('')
    setReceivedTo('cash')
    setError(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Record Income
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
              <h3 className="text-lg font-semibold text-foreground">Income Recorded</h3>
              <p className="text-muted-foreground mt-1">
                ${parseFloat(amount).toFixed(2)} has been recorded as income.
              </p>
            </div>
          ) : (
            <>
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
                    autoFocus
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Consulting fee for Project X"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference ID */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reference ID <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  placeholder="Auto-generated if empty"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Customer Name <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Received To */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Received To
                </label>
                <select
                  value={receivedTo}
                  onChange={(e) => setReceivedTo(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="cash">Cash / Bank Account</option>
                  <option value="stripe">Processor Balance</option>
                </select>
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
                  disabled={loading || !amount || !description.trim()}
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Recording...' : 'Record Income'}
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
