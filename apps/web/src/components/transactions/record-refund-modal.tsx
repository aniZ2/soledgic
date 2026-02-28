'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, RotateCcw, Search } from 'lucide-react'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface RecordRefundModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  preselectedSaleRef?: string
  onSuccess?: () => void
}

type RefundFrom = 'both' | 'platform_only' | 'creator_only'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function RecordRefundModal({
  isOpen,
  onClose,
  ledgerId,
  preselectedSaleRef,
  onSuccess
}: RecordRefundModalProps) {
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saleInfo, setSaleInfo] = useState<{ id: string; amount: number; creator?: string } | null>(null)

  // Form state
  const [saleReference, setSaleReference] = useState(preselectedSaleRef || '')
  const [refundAmount, setRefundAmount] = useState('')
  const [reason, setReason] = useState('')
  const [refundFrom, setRefundFrom] = useState<RefundFrom>('both')

  const lookupSale = useCallback(async (ref: string) => {
    if (!ref.trim()) return

    setSearching(true)
    setError(null)

    try {
      const response = await fetch(`/api/transactions/lookup?ledger_id=${ledgerId}&reference_id=${encodeURIComponent(ref)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.transaction) {
          setSaleInfo({
            id: data.transaction.id,
            amount: data.transaction.amount * 100,
            creator: data.transaction.metadata?.creator_id
          })
          setRefundAmount((data.transaction.amount).toFixed(2))
        } else {
          setSaleInfo(null)
          setError('Sale not found')
        }
      } else {
        setSaleInfo(null)
      }
    } catch {
      setSaleInfo(null)
    } finally {
      setSearching(false)
    }
  }, [ledgerId])

  useEffect(() => {
    if (isOpen && preselectedSaleRef) {
      setSaleReference(preselectedSaleRef)
      void lookupSale(preselectedSaleRef)
    }
  }, [isOpen, preselectedSaleRef, lookupSale])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!saleReference.trim()) {
      setError('Please enter the original sale reference')
      return
    }

    if (!reason.trim()) {
      setError('Please provide a reason for the refund')
      return
    }

    const amountCents = refundAmount ? Math.floor(parseFloat(refundAmount) * 100) : null
    if (refundAmount && (isNaN(amountCents!) || amountCents! <= 0)) {
      setError('Please enter a valid refund amount')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await callLedgerFunction('record-refund', {
        ledgerId,
        method: 'POST',
        body: {
          original_sale_reference: saleReference.trim(),
          amount: amountCents,
          reason: reason.trim(),
          refund_from: refundFrom,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process refund')
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose()
        resetForm()
      }, 1500)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to process refund'))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSuccess(false)
    setSaleReference('')
    setRefundAmount('')
    setReason('')
    setRefundFrom('both')
    setSaleInfo(null)
    setError(null)
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            Record Refund
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
              <h3 className="text-lg font-semibold text-foreground">Refund Recorded</h3>
              <p className="text-muted-foreground mt-1">
                The refund has been processed successfully.
              </p>
            </div>
          ) : (
            <>
              {/* Sale Reference */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Original Sale Reference *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={saleReference}
                    onChange={(e) => setSaleReference(e.target.value)}
                    placeholder="e.g., sale_abc123"
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => lookupSale(saleReference)}
                    disabled={searching || !saleReference.trim()}
                    className="px-3 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-50"
                  >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
                {saleInfo && (
                  <div className="mt-2 p-2 bg-green-500/10 rounded text-sm text-green-600">
                    Found: {formatCurrency(saleInfo.amount)}
                    {saleInfo.creator && ` (Creator: ${saleInfo.creator})`}
                  </div>
                )}
              </div>

              {/* Refund Amount */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Refund Amount <span className="text-muted-foreground">(leave empty for full refund)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={saleInfo ? saleInfo.amount / 100 : undefined}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
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
                  placeholder="e.g., Customer requested refund"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Refund From */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Refund From
                </label>
                <select
                  value={refundFrom}
                  onChange={(e) => setRefundFrom(e.target.value as RefundFrom)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="both">Both Creator & Platform (Proportional)</option>
                  <option value="platform_only">Platform Only</option>
                  <option value="creator_only">Creator Only</option>
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
                  disabled={loading || !saleReference.trim() || !reason.trim()}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Processing...' : 'Record Refund'}
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
