'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import Link from 'next/link'
import { ArrowLeft, Upload, FileText, Check, AlertCircle, ChevronRight, ArrowRight } from 'lucide-react'

interface ParsedTransaction {
  date: string
  description: string
  amount: number
  reference?: string
}

interface ParseResult {
  format: string
  detected_template: string | null
  headers: string[]
  row_count: number
  preview: ParsedTransaction[]
  all_transactions: ParsedTransaction[]
}

interface ImportResult {
  imported: number
  skipped: number
  auto_matched?: number
  needs_review?: number
  errors?: string[]
}

const BANK_PRESETS = [
  { id: 'chase', name: 'Chase Bank' },
  { id: 'bofa', name: 'Bank of America' },
  { id: 'wells_fargo', name: 'Wells Fargo' },
  { id: 'citi', name: 'Citibank' },
  { id: 'stripe', name: 'Stripe' },
  { id: 'relay', name: 'Relay' },
  { id: 'mercury', name: 'Mercury' },
  { id: 'generic', name: 'Other / Generic CSV' },
]

export default function ImportTransactionsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Column mapping state
  const [mapping, setMapping] = useState({
    date: '',
    description: '',
    amount: '',
    debit: '',
    credit: '',
    reference: '',
  })
  const [useSeparateDebitCredit, setUseSeparateDebitCredit] = useState(false)

  // Load API key on mount
  useEffect(() => {
	    const loadApiKey = async () => {
	      const supabase = createClient()
	      const { data: { user } } = await supabase.auth.getUser()
	      if (!user) return

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!membership) return

      const { data: ledgers } = await supabase
        .from('ledgers')
        .select('id, ledger_group_id')
        .eq('organization_id', membership.organization_id)
        .eq('status', 'active')
        .eq('livemode', livemode)

      const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
      if (ledger) {
        setLedgerId(ledger.id)
      }
    }
    loadApiKey()
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile || !ledgerId) return

    setFile(selectedFile)
    setLoading(true)
    setError(null)

    try {
      // Read file as base64
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]

        // Parse preview
        const res = await callLedgerFunction('import-transactions', {
          ledgerId,
          method: 'POST',
          body: { action: 'parse_preview', data: base64 },
        })
        const data = await res.json()

        if (data.success) {
          setParseResult(data.data)
          
          // Auto-set mapping if template detected
          if (data.data.detected_template && data.data.detected_template !== 'generic') {
            setStep('preview')
          } else {
            setStep('map')
          }
        } else {
          setError(data.error || 'Failed to parse file')
        }
        setLoading(false)
      }
      reader.readAsDataURL(selectedFile)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }, [ledgerId])

  const handleImport = async () => {
    if (!ledgerId || !parseResult) return

    setLoading(true)
    setError(null)

    try {
      // Step 1: Import transactions
      const res = await callLedgerFunction('import-transactions', {
        ledgerId,
        method: 'POST',
        body: {
          action: 'import',
          transactions: parseResult.all_transactions,
        },
      })
      const data = await res.json()

      if (data.success) {
        let result: ImportResult = {
          imported: data.data.imported,
          skipped: data.data.skipped,
          errors: data.data.errors,
          auto_matched: 0,
          needs_review: data.data.imported,
        }

        // Step 2: Run auto-match if we imported any transactions
        if (data.data.imported > 0) {
          try {
            const matchRes = await callLedgerFunction('plaid', {
              ledgerId,
              method: 'POST',
              body: { action: 'auto_match_all' },
            })
            const matchData = await matchRes.json()
            
            if (matchData.success && matchData.data?.matched) {
              result.auto_matched = matchData.data.matched
              result.needs_review = data.data.imported - matchData.data.matched
            }
          } catch {
            // Auto-match failed, but import succeeded - not critical
          }
        }

        setImportResult(result)
        setStep('done')
      } else {
        setError(data.error || 'Failed to import')
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  return (
    <div>
      <div className="mb-8">
        <Link 
          href="/dashboard/reconciliation" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reconciliation
        </Link>

        <h1 className="text-3xl font-bold text-foreground">Import Bank Transactions</h1>
        <p className="text-muted-foreground mt-1">
          Upload a CSV or OFX file from your bank
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-8">
        {['Upload', 'Map Columns', 'Preview', 'Done'].map((label, i) => {
          const stepNames = ['upload', 'map', 'preview', 'done']
          const currentIdx = stepNames.indexOf(step)
          const isActive = i === currentIdx
          const isComplete = i < currentIdx

          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isComplete ? 'bg-green-500 text-white' :
                isActive ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {isComplete ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="max-w-xl mx-auto">
            <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors">
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Drop your bank export here
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Supports CSV, OFX, and QFX formats
              </p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".csv,.ofx,.qfx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="bg-primary text-primary-foreground px-4 py-2 rounded-md cursor-pointer hover:bg-primary/90">
                  Select File
                </span>
              </label>
            </div>

            <div className="mt-8">
              <h4 className="text-sm font-medium text-foreground mb-3">Supported Banks</h4>
              <div className="grid grid-cols-3 gap-2">
                {BANK_PRESETS.map((bank) => (
                  <div key={bank.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-green-500" />
                    {bank.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 'map' && parseResult && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Map Your Columns</h2>
          <p className="text-sm text-muted-foreground mb-6">
            We detected {parseResult.row_count} rows. Please map the columns to the correct fields.
          </p>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Date Column *
              </label>
              <select
                value={mapping.date}
                onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                className="w-full border border-border rounded-md px-3 py-2 bg-background"
              >
                <option value="">Select column...</option>
                {parseResult.headers.map((h, i) => (
                  <option key={i} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Description Column *
              </label>
              <select
                value={mapping.description}
                onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
                className="w-full border border-border rounded-md px-3 py-2 bg-background"
              >
                <option value="">Select column...</option>
                {parseResult.headers.map((h, i) => (
                  <option key={i} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={useSeparateDebitCredit}
                  onChange={(e) => setUseSeparateDebitCredit(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-foreground">Separate Debit/Credit columns</span>
              </label>

              {useSeparateDebitCredit ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Debit Column
                    </label>
                    <select
                      value={mapping.debit}
                      onChange={(e) => setMapping({ ...mapping, debit: e.target.value })}
                      className="w-full border border-border rounded-md px-3 py-2 bg-background"
                    >
                      <option value="">Select column...</option>
                      {parseResult.headers.map((h, i) => (
                        <option key={i} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Credit Column
                    </label>
                    <select
                      value={mapping.credit}
                      onChange={(e) => setMapping({ ...mapping, credit: e.target.value })}
                      className="w-full border border-border rounded-md px-3 py-2 bg-background"
                    >
                      <option value="">Select column...</option>
                      {parseResult.headers.map((h, i) => (
                        <option key={i} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Amount Column *
                  </label>
                  <select
                    value={mapping.amount}
                    onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                    className="w-full border border-border rounded-md px-3 py-2 bg-background"
                  >
                    <option value="">Select column...</option>
                    {parseResult.headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 border border-border rounded-md hover:bg-accent"
            >
              Back
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={!mapping.date || !mapping.description || (!mapping.amount && !useSeparateDebitCredit)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && parseResult && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Preview Import</h2>
              <p className="text-sm text-muted-foreground">
                {parseResult.row_count} transactions ready to import
                {parseResult.detected_template && (
                  <span className="ml-2 text-green-600">
                    • Auto-detected: {parseResult.detected_template}
                  </span>
                )}
              </p>
            </div>
          </div>

          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {parseResult.preview.map((txn, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-6 py-3 text-sm text-foreground">{txn.date}</td>
                  <td className="px-6 py-3 text-sm text-foreground">{txn.description}</td>
                  <td className={`px-6 py-3 text-sm text-right font-mono ${
                    txn.amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(txn.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {parseResult.row_count > 10 && (
            <div className="px-6 py-3 bg-muted/30 text-center text-sm text-muted-foreground">
              Showing 10 of {parseResult.row_count} transactions
            </div>
          )}

          <div className="px-6 py-4 border-t border-border flex justify-between">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 border border-border rounded-md hover:bg-accent"
            >
              Start Over
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Importing...' : `Import ${parseResult.row_count} Transactions`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done - Enhanced Summary */}
      {step === 'done' && importResult && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-8 text-center border-b border-border">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Import Complete!</h2>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 divide-x divide-border">
            <div className="p-6 text-center">
              <p className="text-3xl font-bold text-foreground">{importResult.imported}</p>
              <p className="text-sm text-muted-foreground mt-1">Imported</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-3xl font-bold text-green-600">{importResult.auto_matched || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Auto-Matched</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-3xl font-bold text-yellow-600">{importResult.needs_review || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Need Review</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-3xl font-bold text-muted-foreground">{importResult.skipped}</p>
              <p className="text-sm text-muted-foreground mt-1">Duplicates Skipped</p>
            </div>
          </div>

          {/* Status Messages */}
          <div className="p-6 border-t border-border space-y-3">
            {importResult.auto_matched && importResult.auto_matched > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-foreground">
                  {importResult.auto_matched} transactions automatically matched to ledger entries
                </span>
              </div>
            )}
            {importResult.needs_review && importResult.needs_review > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <span className="text-foreground">
                  {importResult.needs_review} transactions need manual review
                </span>
              </div>
            )}
            {importResult.skipped > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                <span className="text-muted-foreground">
                  {importResult.skipped} duplicate transactions were skipped
                </span>
              </div>
            )}
            {importResult.errors && importResult.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-500/10 rounded-lg">
                <p className="text-sm font-medium text-red-600 mb-2">
                  {importResult.errors.length} rows had errors:
                </p>
                <ul className="text-xs text-red-600 space-y-1">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-border flex justify-center gap-4">
            {(importResult.needs_review || 0) > 0 ? (
              <Link
                href="/dashboard/reconciliation"
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Review Transactions
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/dashboard/reconciliation"
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Go to Reconciliation
              </Link>
            )}
            <button
              onClick={() => {
                setStep('upload')
                setFile(null)
                setParseResult(null)
                setImportResult(null)
              }}
              className="px-6 py-2 border border-border rounded-md hover:bg-accent"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
