'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface ReverseTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  transactionId: string
  transactionAmount: number
  onSuccess?: () => void
}

interface ReversalResult {
  reversal_id: string | null
  void_type: string
  reversed_amount?: number
  is_partial?: boolean
  warning?: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function ReverseTransactionModal({
  isOpen,
  onClose,
  ledgerId,
  transactionId,
  transactionAmount,
  onSuccess,
}: ReverseTransactionModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<ReversalResult | null>(null)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  // Form state
  const [reason, setReason] = useState('')
  const [partialAmount, setPartialAmount] = useState('')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const submitReversal = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for the reversal')
      return
    }

    let partialAmountCents: number | undefined
    if (partialAmount.trim()) {
      partialAmountCents = Math.floor(parseFloat(partialAmount))
      if (isNaN(partialAmountCents) || partialAmountCents <= 0) {
        setError('Partial amount must be a positive number (in cents)')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const idempotencyKey = crypto.randomUUID()

      const response = await callLedgerFunction('reverse-transaction', {
        ledgerId,
        method: 'POST',
        body: {
          transaction_id: transactionId,
          reason: reason.trim(),
          ...(partialAmountCents !== undefined && { partial_amount: partialAmountCents }),
          idempotency_key: idempotencyKey,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        // Check for step-up auth challenge
        if (handleProtectedResponse(response, data, submitReversal)) {
          return
        }

        if (response.status === 409) {
          // Handle specific 409 cases
          if (data.idempotent || data.error_code === 'duplicate_reversal_reference') {
            setError('This reversal was already processed')
          } else if (data.error?.includes('already')) {
            setError(data.error)
          } else if (data.error?.includes('exceeds') || data.error?.includes('remaining')) {
            setError(data.error)
          } else {
            setError(data.error || 'Conflict: reversal could not be processed')
          }
          return
        }

        throw new Error(data.error || 'Failed to reverse transaction')
      }

      setSuccess({
        reversal_id: data.reversal_id,
        void_type: data.void_type,
        reversed_amount: data.reversed_amount,
        is_partial: data.is_partial,
        warning: data.warning,
      })

      setTimeout(() => {
        onSuccess?.()
        onClose()
        resetForm()
      }, 2000)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to reverse transaction'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitReversal()
  }

  const resetForm = () => {
    setSuccess(null)
    setReason('')
    setPartialAmount('')
    setError(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            Reverse Transaction
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
            <div className="py-6 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Transaction Reversed</h3>
              {success.reversal_id && (
                <p className="text-sm text-muted-foreground mt-1">
                  Reversal ID: <code className="bg-muted px-1 rounded">{success.reversal_id}</code>
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Method: <span className="font-medium">
                  {success.void_type === 'soft_delete' ? 'Soft Delete (Voided)' : 'Reversing Entry'}
                </span>
              </p>
              {success.reversed_amount !== undefined && (
                <p className="text-sm text-muted-foreground mt-1">
                  Reversed: {formatCurrency(success.reversed_amount)}
                  {success.is_partial && ' (partial)'}
                </p>
              )}
              {success.warning && (
                <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-600">
                  {success.warning}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Transaction Info */}
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground uppercase mb-1">Transaction</p>
                <code className="text-sm">{transactionId}</code>
                <p className="text-sm font-medium mt-1">
                  Amount: {formatCurrency(transactionAmount)}
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reason *
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Duplicate entry, incorrect amount"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Partial Amount */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Partial Amount (cents){' '}
                  <span className="text-muted-foreground font-normal">
                    — leave empty for full reversal
                  </span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="e.g., 5000 for $50.00"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {partialAmount && !isNaN(parseInt(partialAmount)) && parseInt(partialAmount) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    = {formatCurrency(parseInt(partialAmount) / 100)}
                  </p>
                )}
              </div>

              {/* Info about idempotency */}
              <p className="text-xs text-muted-foreground">
                An idempotency key will be auto-generated to prevent duplicate reversals.
              </p>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !reason.trim()}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Reversing...' : 'Reverse Transaction'}
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

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
