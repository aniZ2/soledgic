'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, RotateCcw, Search } from 'lucide-react'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import type { RefundResponse } from '@/lib/api-types'

interface RecordRefundModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  preselectedSaleRef?: string
  onSuccess?: () => void
}

type RefundFrom = 'both' | 'platform_only' | 'creator_only'
type RefundMode = 'ledger_only' | 'processor_refund'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatErrorFromResponse(data: {
  error?: string
  error_code?: string
  transaction_id?: string
}): string {
  const code = data.error_code || ''
  const message = data.error || ''

  switch (code) {
    case 'duplicate_refund_reference':
      return data.transaction_id
        ? `This refund was already processed (transaction: ${data.transaction_id})`
        : 'This refund was already processed'
    case 'sale_already_reversed':
      return 'This sale has already been reversed and cannot be refunded'
    case 'sale_already_fully_refunded':
      return 'This sale has already been fully refunded'
    case 'refund_amount_exceeds_remaining':
      return message || 'Refund amount exceeds the remaining refundable balance'
    case 'missing_processor_payment_id':
      return 'Processor Payment ID is required for processor refunds'
    default:
      return message || 'Failed to process refund'
  }
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
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  // Form state
  const [saleReference, setSaleReference] = useState(preselectedSaleRef || '')
  const [refundAmount, setRefundAmount] = useState('')
  const [reason, setReason] = useState('')
  const [refundFrom, setRefundFrom] = useState<RefundFrom>('both')
  const [mode, setMode] = useState<RefundMode>('ledger_only')
  const [processorPaymentId, setProcessorPaymentId] = useState('')

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

  const submitRefund = async () => {
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

    if (mode === 'processor_refund' && !processorPaymentId.trim()) {
      setError('Processor Payment ID is required for processor refunds')
      return
    }

    const idempotencyKey = crypto.randomUUID()

    setLoading(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        sale_reference: saleReference.trim(),
        amount: amountCents,
        reason: reason.trim(),
        refund_from: refundFrom,
        idempotency_key: idempotencyKey,
        mode,
      }

      if (mode === 'processor_refund') {
        body.processor_payment_id = processorPaymentId.trim()
      }

      const response = await callLedgerFunction('refunds', {
        ledgerId,
        method: 'POST',
        body,
      })

      const data: RefundResponse = await response.json()

      if (!response.ok) {
        if (handleProtectedResponse(response, data, submitRefund)) {
          return
        }
        throw new Error(formatErrorFromResponse(data))
      }

      // The backend returns { success: false } with 200 for some conflict cases
      if (data.success === false && data.error_code) {
        throw new Error(formatErrorFromResponse(data))
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitRefund()
  }

  const resetForm = () => {
    setSuccess(false)
    setSaleReference('')
    setRefundAmount('')
    setReason('')
    setRefundFrom('both')
    setMode('ledger_only')
    setProcessorPaymentId('')
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

              {/* Mode Selector */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Refund Mode
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="refund_mode"
                      value="ledger_only"
                      checked={mode === 'ledger_only'}
                      onChange={() => setMode('ledger_only')}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">Ledger Only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="refund_mode"
                      value="processor_refund"
                      checked={mode === 'processor_refund'}
                      onChange={() => setMode('processor_refund')}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">Processor Refund</span>
                  </label>
                </div>
              </div>

              {/* Processor Payment ID (only for processor_refund mode) */}
              {mode === 'processor_refund' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Processor Payment ID *
                  </label>
                  <input
                    type="text"
                    value={processorPaymentId}
                    onChange={(e) => setProcessorPaymentId(e.target.value)}
                    placeholder="e.g., TRxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    The payment processor transfer ID to refund against
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading || !saleReference.trim() || !reason.trim() || (mode === 'processor_refund' && !processorPaymentId.trim())}
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

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
