'use client'

import React, { useState } from 'react'
import { X, AlertTriangle, ArrowRight, Loader2, CheckCircle, Info } from 'lucide-react'

interface LockedPeriodInfo {
  start: string
  end: string
  status: string
}

interface OriginalTransaction {
  id: string
  description: string
  amount: number
  type: string
  date: string
  entries?: Array<{
    account_id: string
    account_name: string
    entry_type: 'debit' | 'credit'
    amount: number
  }>
}

interface CorrectingEntryModalProps {
  open: boolean
  onClose: () => void
  originalTransaction: OriginalTransaction | null
  lockedPeriod: LockedPeriodInfo | null
  onSubmit: (data: { description: string; effectiveDate: string }) => Promise<void>
}

export function CorrectingEntryModal({ 
  open, 
  onClose, 
  originalTransaction, 
  lockedPeriod,
  onSubmit 
}: CorrectingEntryModalProps) {
  const [description, setDescription] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open || !originalTransaction) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await onSubmit({ 
        description: description || `Correction for: ${originalTransaction.description}`,
        effectiveDate 
      })
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setDescription('')
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to create correcting entry')
    } finally {
      setSubmitting(false)
    }
  }

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-stone-900">Create Correcting Entry</h2>
              <p className="text-[13px] text-amber-700">Original transaction is in a locked period</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-amber-100 rounded">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">Correcting Entry Created</h3>
            <p className="text-stone-500">The adjustment has been recorded in the current period.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="p-5 space-y-5">
              {/* Explanation */}
              <div className="bg-stone-50 rounded-lg p-4 flex gap-3">
                <Info className="w-5 h-5 text-stone-400 flex-shrink-0 mt-0.5" />
                <div className="text-[13px] text-stone-600">
                  <p className="font-medium text-stone-700 mb-1">Why a correcting entry?</p>
                  <p>The period <strong>{lockedPeriod?.start}</strong> to <strong>{lockedPeriod?.end}</strong> is {lockedPeriod?.status}. 
                  Instead of modifying historical records, we'll create an offsetting entry in the current open period.</p>
                </div>
              </div>

              {/* Original Transaction */}
              <div>
                <label className="block text-[12px] font-medium text-stone-500 uppercase tracking-wider mb-2">
                  Original Transaction
                </label>
                <div className="border rounded-lg p-4 bg-red-50/30 border-red-100">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-stone-900">{originalTransaction.description}</p>
                      <p className="text-[13px] text-stone-500">{formatDate(originalTransaction.date)}</p>
                    </div>
                    <span className="text-lg font-semibold text-red-600">
                      {formatAmount(originalTransaction.amount)}
                    </span>
                  </div>
                  <div className="text-[12px] text-stone-400 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-stone-100 rounded">{originalTransaction.type}</span>
                    <span>•</span>
                    <span>ID: {originalTransaction.id.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-stone-400 rotate-90" />
                </div>
              </div>

              {/* Correcting Entry Preview */}
              <div>
                <label className="block text-[12px] font-medium text-stone-500 uppercase tracking-wider mb-2">
                  Correcting Entry (Reversal)
                </label>
                <div className="border rounded-lg p-4 bg-emerald-50/30 border-emerald-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-medium text-stone-900">
                        {description || `Correction for: ${originalTransaction.description}`}
                      </p>
                      <p className="text-[13px] text-stone-500">Will be dated: {formatDate(effectiveDate)}</p>
                    </div>
                    <span className="text-lg font-semibold text-emerald-600">
                      {formatAmount(originalTransaction.amount)}
                    </span>
                  </div>
                  
                  {/* Entry preview */}
                  <div className="bg-white rounded border text-[12px]">
                    <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b bg-stone-50 font-medium text-stone-500">
                      <span>Account</span>
                      <span className="text-right">Debit</span>
                      <span className="text-right">Credit</span>
                    </div>
                    {originalTransaction.entries ? (
                      originalTransaction.entries.map((entry, i) => (
                        <div key={i} className="grid grid-cols-3 gap-2 px-3 py-2 border-b last:border-b-0">
                          <span className="text-stone-700">{entry.account_name}</span>
                          {/* Flip the entries for correction */}
                          <span className="text-right">
                            {entry.entry_type === 'credit' ? formatAmount(entry.amount * 100) : '—'}
                          </span>
                          <span className="text-right">
                            {entry.entry_type === 'debit' ? formatAmount(entry.amount * 100) : '—'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b">
                          <span className="text-stone-700">Original accounts</span>
                          <span className="text-right text-emerald-600">{formatAmount(originalTransaction.amount)}</span>
                          <span className="text-right">—</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 px-3 py-2">
                          <span className="text-stone-700">(reversed)</span>
                          <span className="text-right">—</span>
                          <span className="text-right text-emerald-600">{formatAmount(originalTransaction.amount)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">
                    Description <span className="text-stone-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={`Correction for: ${originalTransaction.description}`}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[14px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-stone-200"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="text"
                    value={formatAmount(originalTransaction.amount)}
                    disabled
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-[14px] bg-stone-50 text-stone-500"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-[13px] text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t bg-stone-50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[14px] font-medium text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Correcting Entry
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// Hook to handle the correcting entry flow
export function useCorrectingEntry() {
  const [showModal, setShowModal] = useState(false)
  const [originalTx, setOriginalTx] = useState<OriginalTransaction | null>(null)
  const [lockedPeriod, setLockedPeriod] = useState<LockedPeriodInfo | null>(null)

  const handleLockedPeriodError = (error: any, transaction: OriginalTransaction) => {
    if (error.period) {
      setOriginalTx(transaction)
      setLockedPeriod(error.period)
      setShowModal(true)
      return true
    }
    return false
  }

  const createCorrectingEntry = async (
    apiCall: (data: { description: string; effectiveDate: string; originalTxId: string }) => Promise<any>,
    data: { description: string; effectiveDate: string }
  ) => {
    if (!originalTx) throw new Error('No original transaction')
    return apiCall({ ...data, originalTxId: originalTx.id })
  }

  const closeModal = () => {
    setShowModal(false)
    setOriginalTx(null)
    setLockedPeriod(null)
  }

  return {
    showModal,
    originalTx,
    lockedPeriod,
    handleLockedPeriodError,
    createCorrectingEntry,
    closeModal
  }
}
