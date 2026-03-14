'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, FileEdit } from 'lucide-react'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface CorrectTaxDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  documentId: string
  currentGrossAmount: number
  recipientId: string
  taxYear: number
  onSuccess?: () => void
}

interface CorrectionResult {
  id: string
  original_document_id: string
  gross_amount: number
  reason: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function CorrectTaxDocumentModal({
  isOpen,
  onClose,
  ledgerId,
  documentId,
  currentGrossAmount,
  recipientId,
  taxYear,
  onSuccess,
}: CorrectTaxDocumentModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<CorrectionResult | null>(null)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  // Form state
  const [correctedGross, setCorrectedGross] = useState(String(currentGrossAmount))
  const [correctedFederal, setCorrectedFederal] = useState('')
  const [correctedState, setCorrectedState] = useState('')
  const [reason, setReason] = useState('')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const submitCorrection = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for the correction')
      return
    }

    const grossNum = parseFloat(correctedGross)
    if (isNaN(grossNum) || grossNum < 0) {
      setError('Please enter a valid corrected gross amount')
      return
    }

    const body: Record<string, unknown> = {
      gross_amount: grossNum,
      reason: reason.trim(),
    }

    if (correctedFederal.trim()) {
      const federalNum = parseFloat(correctedFederal)
      if (isNaN(federalNum) || federalNum < 0) {
        setError('Please enter a valid federal withholding amount')
        return
      }
      body.federal_withholding = federalNum
    }

    if (correctedState.trim()) {
      const stateNum = parseFloat(correctedState)
      if (isNaN(stateNum) || stateNum < 0) {
        setError('Please enter a valid state withholding amount')
        return
      }
      body.state_withholding = stateNum
    }

    setLoading(true)
    setError(null)

    try {
      const response = await callLedgerFunction(`tax/documents/${documentId}/correct`, {
        ledgerId,
        method: 'POST',
        body,
      })

      const data = await response.json()

      if (!response.ok) {
        if (handleProtectedResponse(response, data, submitCorrection)) {
          return
        }
        throw new Error(data.error || 'Failed to issue correction')
      }

      setSuccess({
        id: data.correction?.id,
        original_document_id: data.correction?.original_document_id,
        gross_amount: data.correction?.gross_amount,
        reason: data.correction?.reason,
      })

      setTimeout(() => {
        onSuccess?.()
        onClose()
        resetForm()
      }, 2000)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to issue corrected document'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitCorrection()
  }

  const resetForm = () => {
    setSuccess(null)
    setCorrectedGross(String(currentGrossAmount))
    setCorrectedFederal('')
    setCorrectedState('')
    setReason('')
    setError(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileEdit className="w-5 h-5" />
            Issue Corrected 1099
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
              <h3 className="text-lg font-semibold text-foreground">Correction Issued</h3>
              <p className="text-sm text-muted-foreground mt-1">
                New document: <code className="bg-muted px-1 rounded">{success.id}</code>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Corrected gross: {formatCurrency(success.gross_amount)}
              </p>
            </div>
          ) : (
            <>
              {/* Document Info */}
              <div className="p-3 bg-muted/50 rounded-md space-y-1">
                <p className="text-xs text-muted-foreground uppercase">Document</p>
                <code className="text-sm">{documentId}</code>
                <div className="flex gap-4 text-sm">
                  <span>Recipient: <code className="bg-muted px-1 rounded">{recipientId}</code></span>
                  <span>Year: {taxYear}</span>
                </div>
              </div>

              {/* Current Gross (read-only) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Current Gross Amount
                </label>
                <div className="px-3 py-2 border border-border rounded-md bg-muted/30 text-muted-foreground">
                  {formatCurrency(currentGrossAmount)}
                </div>
              </div>

              {/* Corrected Gross Amount */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Corrected Gross Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={correctedGross}
                    onChange={(e) => setCorrectedGross(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Corrected Federal Withholding */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Corrected Federal Withholding{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={correctedFederal}
                    onChange={(e) => setCorrectedFederal(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Corrected State Withholding */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Corrected State Withholding{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={correctedState}
                    onChange={(e) => setCorrectedState(e.target.value)}
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
                  placeholder="e.g., Incorrect payment amount reported"
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
                  disabled={loading || !reason.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Issuing Correction...' : 'Issue Correction'}
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
