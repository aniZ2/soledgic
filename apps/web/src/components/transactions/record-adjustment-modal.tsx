'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, FileEdit, Plus, Trash2 } from 'lucide-react'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface RecordAdjustmentModalProps {
  isOpen: boolean
  onClose: () => void
  ledgerId: string
  onSuccess?: () => void
}

interface Entry {
  id: string
  account_type: string
  entity_id?: string
  entry_type: 'debit' | 'credit'
  amount: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const ADJUSTMENT_TYPES = [
  { value: 'correction', label: 'Correction', description: 'Fix an error in previous entry' },
  { value: 'reclassification', label: 'Reclassification', description: 'Move between categories' },
  { value: 'accrual', label: 'Accrual', description: 'Record accrued revenue/expense' },
  { value: 'deferral', label: 'Deferral', description: 'Defer revenue/expense' },
  { value: 'depreciation', label: 'Depreciation', description: 'Record depreciation' },
  { value: 'write_off', label: 'Write-off', description: 'Write off bad debt/asset' },
  { value: 'year_end', label: 'Year End', description: 'Year-end adjustment' },
  { value: 'opening_balance', label: 'Opening Balance', description: 'Set opening balance' },
  { value: 'other', label: 'Other', description: 'Other adjustment' },
]

const ACCOUNT_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'creator_balance', label: 'Creator Balance' },
  { value: 'platform_revenue', label: 'Platform Revenue' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
  { value: 'tax_reserve', label: 'Tax Reserve' },
  { value: 'accounts_receivable', label: 'Accounts Receivable' },
  { value: 'accounts_payable', label: 'Accounts Payable' },
  { value: 'retained_earnings', label: 'Retained Earnings' },
  { value: 'owner_equity', label: 'Owner Equity' },
]

export function RecordAdjustmentModal({
  isOpen,
  onClose,
  ledgerId,
  onSuccess
}: RecordAdjustmentModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [adjustmentType, setAdjustmentType] = useState('correction')
  const [reason, setReason] = useState('')
  const [preparedBy, setPreparedBy] = useState('')
  const [entries, setEntries] = useState<Entry[]>([
    { id: '1', account_type: 'cash', entry_type: 'debit', amount: '' },
    { id: '2', account_type: 'revenue', entry_type: 'credit', amount: '' },
  ])

  const addEntry = () => {
    const newId = String(Date.now())
    setEntries([...entries, { id: newId, account_type: 'cash', entry_type: 'debit', amount: '' }])
  }

  const removeEntry = (id: string) => {
    if (entries.length <= 2) return
    setEntries(entries.filter(e => e.id !== id))
  }

  const updateEntry = (id: string, field: keyof Entry, value: string) => {
    setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const calculateTotals = () => {
    let debits = 0
    let credits = 0
    for (const entry of entries) {
      const amount = parseFloat(entry.amount) || 0
      if (entry.entry_type === 'debit') {
        debits += amount
      } else {
        credits += amount
      }
    }
    return { debits, credits, balanced: Math.abs(debits - credits) < 0.01 }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!reason.trim()) {
      setError('Please provide a reason for the adjustment')
      return
    }

    if (!preparedBy.trim()) {
      setError('Please enter who prepared this adjustment')
      return
    }

    const totals = calculateTotals()
    if (!totals.balanced) {
      setError(`Entries must balance. Debits: $${totals.debits.toFixed(2)}, Credits: $${totals.credits.toFixed(2)}`)
      return
    }

    const entriesWithAmounts = entries.filter(e => parseFloat(e.amount) > 0)
    if (entriesWithAmounts.length < 2) {
      setError('At least 2 entries with amounts are required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await callLedgerFunction('record-adjustment', {
        ledgerId,
        method: 'POST',
        body: {
          adjustment_type: adjustmentType,
          reason: reason.trim(),
          prepared_by: preparedBy.trim(),
          entries: entriesWithAmounts.map(e => ({
            account_type: e.account_type,
            entity_id: e.entity_id || undefined,
            entry_type: e.entry_type,
            amount: Math.floor(parseFloat(e.amount) * 100),
          })),
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to record adjustment')
      }

      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose()
        resetForm()
      }, 1500)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to record adjustment'))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSuccess(false)
    setAdjustmentType('correction')
    setReason('')
    setPreparedBy('')
    setEntries([
      { id: '1', account_type: 'cash', entry_type: 'debit', amount: '' },
      { id: '2', account_type: 'revenue', entry_type: 'credit', amount: '' },
    ])
    setError(null)
  }

  const totals = calculateTotals()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-purple-500" />
            Record Adjustment Journal
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
              <h3 className="text-lg font-semibold text-foreground">Adjustment Recorded</h3>
              <p className="text-muted-foreground mt-1">
                The adjustment journal entry has been created.
              </p>
            </div>
          ) : (
            <>
              {/* Adjustment Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Adjustment Type
                </label>
                <select
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {ADJUSTMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {ADJUSTMENT_TYPES.find(t => t.value === adjustmentType)?.description}
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reason *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe why this adjustment is needed..."
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Prepared By */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Prepared By *
                </label>
                <input
                  type="text"
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Journal Entries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground">
                    Journal Entries
                  </label>
                  <button
                    type="button"
                    onClick={addEntry}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Line
                  </button>
                </div>

                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-24">Type</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">Amount</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-2 py-2">
                            <select
                              value={entry.account_type}
                              onChange={(e) => updateEntry(entry.id, 'account_type', e.target.value)}
                              className="w-full px-2 py-1 border border-border rounded text-sm bg-background"
                            >
                              {ACCOUNT_TYPES.map((acc) => (
                                <option key={acc.value} value={acc.value}>
                                  {acc.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={entry.entry_type}
                              onChange={(e) => updateEntry(entry.id, 'entry_type', e.target.value)}
                              className="w-full px-2 py-1 border border-border rounded text-sm bg-background"
                            >
                              <option value="debit">Debit</option>
                              <option value="credit">Credit</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={entry.amount}
                              onChange={(e) => updateEntry(entry.id, 'amount', e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1 border border-border rounded text-sm text-right bg-background"
                            />
                          </td>
                          <td className="px-2 py-2">
                            {entries.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeEntry(entry.id)}
                                className="p-1 text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr>
                        <td className="px-3 py-2 text-sm font-medium">Totals</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={totals.balanced ? 'text-green-600' : 'text-red-600'}>
                            {totals.balanced ? 'Balanced' : 'Unbalanced'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-mono">
                          <div>D: ${totals.debits.toFixed(2)}</div>
                          <div>C: ${totals.credits.toFixed(2)}</div>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
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
                  disabled={loading || !reason.trim() || !preparedBy.trim() || !totals.balanced}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Recording...' : 'Record Adjustment'}
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
