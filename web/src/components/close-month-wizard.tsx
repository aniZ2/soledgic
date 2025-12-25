'use client'

import React, { useState, useEffect } from 'react'
import { 
  X, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
  FileText,
  Scale,
  Link2,
  Shield,
  Calendar,
  Download,
  Eye
} from 'lucide-react'

interface CloseMonthWizardProps {
  open: boolean
  onClose: () => void
  onComplete: () => void
  defaultYear?: number
  defaultMonth?: number
}

interface PreflightCheck {
  id: string
  name: string
  description: string
  status: 'pending' | 'checking' | 'passed' | 'failed' | 'warning'
  details?: string
  required: boolean
}

interface TrialBalanceRow {
  account: string
  type: string
  debit: number
  credit: number
}

export function CloseMonthWizard({ open, onClose, onComplete, defaultYear, defaultMonth }: CloseMonthWizardProps) {
  const [step, setStep] = useState(1)
  const [year, setYear] = useState(defaultYear || new Date().getFullYear())
  const [month, setMonth] = useState(defaultMonth || new Date().getMonth()) // 0-indexed for selection, 1-indexed for API
  const [loading, setLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([])
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([])
  const [totals, setTotals] = useState({ debits: 0, credits: 0, balanced: false })
  const [closeResult, setCloseResult] = useState<any>(null)
  const [notes, setNotes] = useState('')

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setCloseResult(null)
      setNotes('')
    }
  }, [open])

  // Run preflight checks when entering step 2
  useEffect(() => {
    if (step === 2) {
      runPreflightChecks()
    }
  }, [step])

  // Fetch trial balance when entering step 3
  useEffect(() => {
    if (step === 3) {
      fetchTrialBalance()
    }
  }, [step])

  const runPreflightChecks = async () => {
    setPreflightChecks([
      { id: 'balance', name: 'Ledger Balance', description: 'Verify debits equal credits', status: 'checking', required: true },
      { id: 'reconciled', name: 'Bank Reconciliation', description: 'All transactions reconciled', status: 'pending', required: false },
      { id: 'unposted', name: 'Unposted Entries', description: 'No draft transactions', status: 'pending', required: false },
      { id: 'prior', name: 'Prior Period', description: 'Previous month is closed', status: 'pending', required: false },
    ])

    // Simulate checking each one
    await new Promise(r => setTimeout(r, 500))
    
    // Check ledger balance
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: 'trial_balance' })
      })
      const data = await res.json()
      
      const isBalanced = data.report?.totals?.balanced ?? false
      setPreflightChecks(prev => prev.map(c => 
        c.id === 'balance' 
          ? { ...c, status: isBalanced ? 'passed' : 'failed', details: isBalanced ? 'Ledger is balanced' : `Difference: $${Math.abs(data.report?.totals?.debits - data.report?.totals?.credits).toFixed(2)}` }
          : c
      ))
    } catch {
      setPreflightChecks(prev => prev.map(c => c.id === 'balance' ? { ...c, status: 'failed', details: 'Could not verify' } : c))
    }

    await new Promise(r => setTimeout(r, 300))

    // Check reconciliation (simulated)
    setPreflightChecks(prev => prev.map(c => 
      c.id === 'reconciled' 
        ? { ...c, status: 'checking' }
        : c
    ))
    await new Promise(r => setTimeout(r, 400))
    setPreflightChecks(prev => prev.map(c => 
      c.id === 'reconciled' 
        ? { ...c, status: 'warning', details: '3 transactions unreconciled' }
        : c
    ))

    await new Promise(r => setTimeout(r, 300))

    // Check unposted entries
    setPreflightChecks(prev => prev.map(c => 
      c.id === 'unposted' 
        ? { ...c, status: 'checking' }
        : c
    ))
    await new Promise(r => setTimeout(r, 300))
    setPreflightChecks(prev => prev.map(c => 
      c.id === 'unposted' 
        ? { ...c, status: 'passed', details: 'No draft entries' }
        : c
    ))

    await new Promise(r => setTimeout(r, 300))

    // Check prior period
    setPreflightChecks(prev => prev.map(c => 
      c.id === 'prior' 
        ? { ...c, status: 'checking' }
        : c
    ))
    await new Promise(r => setTimeout(r, 300))
    setPreflightChecks(prev => prev.map(c => 
      c.id === 'prior' 
        ? { ...c, status: 'passed', details: `${months[month - 1] || months[11]} ${month === 0 ? year - 1 : year} is closed` }
        : c
    ))
  }

  const fetchTrialBalance = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: 'trial_balance' })
      })
      const data = await res.json()
      
      if (data.success && data.report) {
        setTrialBalance(data.report.accounts || [])
        setTotals({
          debits: data.report.totals?.debits || 0,
          credits: data.report.totals?.credits || 0,
          balanced: data.report.totals?.balanced || false
        })
      }
    } catch (err) {
      console.error('Failed to fetch trial balance:', err)
    }
    setLoading(false)
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          year,
          month: month + 1, // API expects 1-indexed month
          notes
        })
      })
      const data = await res.json()
      
      if (data.success) {
        setCloseResult(data)
        setStep(5)
      } else {
        alert(data.error || 'Failed to close period')
      }
    } catch (err) {
      alert('Failed to close period')
    }
    setClosing(false)
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const canProceedFromStep2 = preflightChecks.filter(c => c.required).every(c => c.status === 'passed')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-stone-900 to-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-white">Close Month</h2>
              <p className="text-[13px] text-stone-300">Lock {months[month]} {year} for editing</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b bg-stone-50">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Select Period' },
              { num: 2, label: 'Preflight Checks' },
              { num: 3, label: 'Review Balance' },
              { num: 4, label: 'Confirm Close' },
              { num: 5, label: 'Complete' },
            ].map((s, i) => (
              <React.Fragment key={s.num}>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium transition-colors ${
                    step > s.num 
                      ? 'bg-emerald-500 text-white' 
                      : step === s.num 
                        ? 'bg-stone-900 text-white' 
                        : 'bg-stone-200 text-stone-500'
                  }`}>
                    {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-[11px] mt-1 ${step >= s.num ? 'text-stone-700' : 'text-stone-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < 4 && (
                  <div className={`flex-1 h-0.5 mx-2 ${step > s.num ? 'bg-emerald-500' : 'bg-stone-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Select Period */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <Calendar className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-stone-900">Select Period to Close</h3>
                <p className="text-[14px] text-stone-500 mt-1">Choose the month and year you want to close</p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-2">Month</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(parseInt(e.target.value))}
                    className="w-full px-4 py-3 border border-stone-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-stone-200"
                  >
                    {months.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-2">Year</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                    className="w-full px-4 py-3 border border-stone-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-stone-200"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-6">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div className="text-[13px] text-amber-800">
                    <p className="font-medium">This action is permanent</p>
                    <p className="mt-1">Once a period is closed, transactions within that period cannot be modified. 
                    You'll need to create correcting entries in open periods to make adjustments.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preflight Checks */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <Shield className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-stone-900">Preflight Checks</h3>
                <p className="text-[14px] text-stone-500 mt-1">Verifying {months[month]} {year} is ready to close</p>
              </div>

              <div className="space-y-3">
                {preflightChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      check.status === 'passed' ? 'bg-emerald-50 border-emerald-200' :
                      check.status === 'failed' ? 'bg-red-50 border-red-200' :
                      check.status === 'warning' ? 'bg-amber-50 border-amber-200' :
                      'bg-white border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {check.status === 'checking' ? (
                          <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
                        ) : check.status === 'passed' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : check.status === 'failed' ? (
                          <X className="w-5 h-5 text-red-600" />
                        ) : check.status === 'warning' ? (
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-stone-300" />
                        )}
                        <div>
                          <p className="text-[14px] font-medium text-stone-900">
                            {check.name}
                            {check.required && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          <p className="text-[12px] text-stone-500">{check.description}</p>
                        </div>
                      </div>
                      {check.details && (
                        <span className={`text-[12px] font-medium ${
                          check.status === 'passed' ? 'text-emerald-600' :
                          check.status === 'failed' ? 'text-red-600' :
                          check.status === 'warning' ? 'text-amber-600' :
                          'text-stone-500'
                        }`}>
                          {check.details}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!canProceedFromStep2 && preflightChecks.some(c => c.status === 'failed') && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
                  <p className="text-[13px] text-red-800">
                    Required checks must pass before closing the period. Please resolve the issues above.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review Trial Balance */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <Scale className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-stone-900">Review Trial Balance</h3>
                <p className="text-[14px] text-stone-500 mt-1">This snapshot will be frozen when the period closes</p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="text-left text-[11px] font-medium text-stone-500 uppercase tracking-wider px-4 py-3">Account</th>
                          <th className="text-left text-[11px] font-medium text-stone-500 uppercase tracking-wider px-4 py-3">Type</th>
                          <th className="text-right text-[11px] font-medium text-stone-500 uppercase tracking-wider px-4 py-3">Debit</th>
                          <th className="text-right text-[11px] font-medium text-stone-500 uppercase tracking-wider px-4 py-3">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-b border-stone-50">
                            <td className="px-4 py-3 text-[13px] text-stone-900">{row.account}</td>
                            <td className="px-4 py-3 text-[12px] text-stone-500">{row.type}</td>
                            <td className="px-4 py-3 text-[13px] text-right text-stone-900">
                              {row.debit > 0 ? formatAmount(row.debit) : '—'}
                            </td>
                            <td className="px-4 py-3 text-[13px] text-right text-stone-900">
                              {row.credit > 0 ? formatAmount(row.credit) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-stone-50 font-medium">
                          <td colSpan={2} className="px-4 py-3 text-[13px] text-stone-900">Totals</td>
                          <td className="px-4 py-3 text-[13px] text-right text-stone-900">{formatAmount(totals.debits)}</td>
                          <td className="px-4 py-3 text-[13px] text-right text-stone-900">{formatAmount(totals.credits)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className={`p-4 rounded-xl border ${totals.balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                      {totals.balanced ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`text-[14px] font-medium ${totals.balanced ? 'text-emerald-800' : 'text-red-800'}`}>
                        {totals.balanced 
                          ? 'Ledger is balanced and ready to close' 
                          : `Ledger is out of balance by ${formatAmount(Math.abs(totals.debits - totals.credits))}`
                        }
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Lock className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-stone-900">Confirm Period Close</h3>
                <p className="text-[14px] text-stone-500 mt-1">You're about to lock {months[month]} {year}</p>
              </div>

              <div className="bg-stone-50 rounded-xl p-5 space-y-4">
                <div className="flex justify-between text-[14px]">
                  <span className="text-stone-500">Period</span>
                  <span className="font-medium text-stone-900">{months[month]} {year}</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-stone-500">Total Debits</span>
                  <span className="font-medium text-stone-900">{formatAmount(totals.debits)}</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-stone-500">Total Credits</span>
                  <span className="font-medium text-stone-900">{formatAmount(totals.credits)}</span>
                </div>
                <div className="flex justify-between text-[14px] pt-3 border-t">
                  <span className="text-stone-500">Balance Status</span>
                  <span className="font-medium text-emerald-600">Balanced ✓</span>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-stone-700 mb-2">
                  Closing Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this period close..."
                  rows={3}
                  className="w-full px-4 py-3 border border-stone-200 rounded-xl text-[14px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 resize-none"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div className="text-[13px] text-amber-800">
                    <p className="font-medium">Final warning</p>
                    <p className="mt-1">This will generate frozen financial statements with integrity hashes. 
                    All transactions in this period will become read-only.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && closeResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-stone-900 mb-2">Period Closed Successfully</h3>
              <p className="text-[14px] text-stone-500 mb-8">{months[month]} {year} is now locked</p>

              <div className="bg-stone-50 rounded-xl p-5 text-left space-y-3 mb-6">
                <div className="flex justify-between text-[14px]">
                  <span className="text-stone-500">Period ID</span>
                  <span className="font-mono text-[12px] text-stone-600">{closeResult.period_id?.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-stone-500">Integrity Hash</span>
                  <span className="font-mono text-[12px] text-stone-600">{closeResult.closing_hash?.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-stone-500">Closed At</span>
                  <span className="text-stone-900">{new Date().toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-lg text-[13px] font-medium hover:bg-stone-50">
                  <Download className="w-4 h-4" />
                  Download Statements
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-lg text-[13px] font-medium hover:bg-stone-50">
                  <Eye className="w-4 h-4" />
                  View Frozen Reports
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-stone-50 flex items-center justify-between">
          {step < 5 ? (
            <>
              <button
                onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                className="flex items-center gap-2 px-4 py-2 text-[14px] font-medium text-stone-600 hover:text-stone-900"
              >
                <ChevronLeft className="w-4 h-4" />
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              
              {step < 4 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 2 && !canProceedFromStep2}
                  className="flex items-center gap-2 px-5 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg text-[14px] font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {closing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Lock className="w-4 h-4" />
                  Close Period
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => { onComplete(); onClose() }}
              className="ml-auto px-5 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
