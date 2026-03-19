'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Receipt, Download, Upload, FileText, CheckCircle2, AlertCircle,
  Clock, RefreshCw, Shield, ChevronRight, ArrowLeftRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { ProvenanceReport } from '@/components/reconciliation/provenance-report'

interface Expense {
  id: string
  amount: number
  description: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

interface ImportSession {
  id: string
  file_name: string | null
  file_format: string
  row_count: number
  imported_count: number
  skipped_count: number
  matched_count: number
  unmatched_count: number
  balance_verified: boolean | null
  balance_discrepancy: number | null
  status: string
  created_at: string
}

interface MatchStats {
  total: number
  matched: number
  unmatched: number
  excluded: number
}

interface ExpensesClientProps {
  ledger: { id: string; business_name: string }
  expenses: Expense[]
  totalExpenses: number
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function ExpensesClient({ ledger, expenses, totalExpenses }: ExpensesClientProps) {
  const [tab, setTab] = useState<'expenses' | 'reconciliation'>('expenses')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Expenses</h1>
          <p className="mt-1 text-muted-foreground">{ledger.business_name}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
        <button
          onClick={() => setTab('expenses')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'expenses'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Expenses
        </button>
        <button
          onClick={() => setTab('reconciliation')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'reconciliation'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Reconciliation
        </button>
      </div>

      {tab === 'expenses' ? (
        <ExpensesTab ledger={ledger} expenses={expenses} totalExpenses={totalExpenses} />
      ) : (
        <ReconciliationTab ledgerId={ledger.id} />
      )}
    </div>
  )
}

// ── Expenses Tab ───────────────────────────────────────

function ExpensesTab({
  ledger,
  expenses,
  totalExpenses,
}: {
  ledger: { id: string; business_name: string }
  expenses: Expense[]
  totalExpenses: number
}) {
  const handleExport = () => {
    const rows = expenses.map((e) => ({
      date: new Date(e.created_at).toISOString().slice(0, 10),
      merchant: (e.metadata?.merchant_name as string) || '',
      category: (e.metadata?.category_code as string) || 'other',
      purpose: e.description || (e.metadata?.business_purpose as string) || '',
      amount: e.amount.toFixed(2),
    }))
    const header = 'Date,Merchant,Category,Purpose,Amount'
    const csv = [header, ...rows.map((r) =>
      `${r.date},"${r.merchant.replace(/"/g, '""')}",${r.category},"${r.purpose.replace(/"/g, '""')}",${r.amount}`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${ledger.business_name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          Total: {formatCurrency(totalExpenses)}
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={expenses.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent text-foreground disabled:opacity-50 text-sm"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <Link
            href={`/ledgers/${ledger.id}/expenses/new`}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Link>
        </div>
      </div>

      {expenses.length > 0 ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Merchant</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Category</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Purpose</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-3 px-4 text-muted-foreground text-sm">
                    {new Date(expense.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 font-medium text-foreground">
                    {(expense.metadata?.merchant_name as string) || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground capitalize">
                      {((expense.metadata?.category_code as string) || 'other').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">
                    {expense.description || (expense.metadata?.business_purpose as string) || '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-foreground">
                    {formatCurrency(expense.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No expenses yet</h3>
          <p className="mt-2 text-muted-foreground">
            Expenses will appear here once your integration sends them via the API. You can also add them manually.
          </p>
          <div className="mt-6 flex items-center gap-3 justify-center">
            <Link
              href="/connect"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              Set Up Integration
            </Link>
            <Link
              href={`/ledgers/${ledger.id}/expenses/new`}
              className="inline-flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-md hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              Add Manually
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

// ── Reconciliation Tab ─────────────────────────────────

function ReconciliationTab({ ledgerId }: { ledgerId: string }) {
  const [sessions, setSessions] = useState<ImportSession[]>([])
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const sessRes = await callLedgerFunction('import-transactions', {
        ledgerId,
        method: 'POST',
        body: { action: 'get_sessions' },
      })
      const sessData = await sessRes.json()
      if (sessData.success) setSessions(sessData.data || [])

      const supabase = createClient()
      const [{ count: totalCount }, { count: matchedCount }, { count: unmatchedCount }, { count: excludedCount }] =
        await Promise.all([
          supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('ledger_id', ledgerId),
          supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('ledger_id', ledgerId).eq('reconciliation_status', 'matched'),
          supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('ledger_id', ledgerId).eq('reconciliation_status', 'unmatched'),
          supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('ledger_id', ledgerId).eq('reconciliation_status', 'excluded'),
        ])

      setMatchStats({
        total: totalCount || 0,
        matched: matchedCount || 0,
        unmatched: unmatchedCount || 0,
        excluded: excludedCount || 0,
      })
    } catch {
      // Silent fail
    }
    setLoading(false)
  }, [ledgerId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const matchRate = matchStats && matchStats.total > 0
    ? Math.round((matchStats.matched / matchStats.total) * 100)
    : null

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-muted rounded-lg" />
        <div className="h-40 bg-muted rounded-lg" />
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-6">
        Import bank statements, verify balances, and match transactions to your ledger.
        Supports CSV, OFX, QFX, CAMT.053, BAI2, and MT940 formats.
      </p>

      {/* Stats Overview */}
      {matchStats && matchStats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Total Imported</p>
            <p className="text-2xl font-bold text-foreground mt-1">{matchStats.total}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Matched</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{matchStats.matched}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Needs Review</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{matchStats.unmatched}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Match Rate</p>
            <p className={`text-2xl font-bold mt-1 ${
              matchRate !== null && matchRate >= 90 ? 'text-green-600' :
              matchRate !== null && matchRate >= 70 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {matchRate !== null ? `${matchRate}%` : '--'}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Link
          href="/dashboard/reconciliation/import"
          className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                Import Bank Statement
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload a file from your bank. Auto-detects format, verifies balances,
                and runs tiered matching against your ledger.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['CSV', 'OFX', 'QFX', 'CAMT.053', 'BAI2', 'MT940'].map(f => (
                  <span key={f} className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">{f}</span>
                ))}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary mt-1" />
          </div>
        </Link>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">Ledger Integrity</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Triple-entry verification ensures your ledger, processor, and bank records agree.
              </p>
              <div className="mt-4">
                <ProvenanceReport />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Import History</h2>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-10 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No imports yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your first bank statement to start reconciling expenses.
            </p>
            <Link
              href="/dashboard/reconciliation/import"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
            >
              <Upload className="w-4 h-4" />
              Import Statement
            </Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">File</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Format</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Rows</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Matched</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Balance</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map(session => {
                  const sessionMatchRate = session.imported_count > 0
                    ? Math.round((session.matched_count / session.imported_count) * 100)
                    : 0

                  return (
                    <tr key={session.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                          {session.file_name || 'Untitled import'}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground uppercase">
                          {session.file_format}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-foreground font-mono">
                        {session.imported_count}
                        {session.skipped_count > 0 && (
                          <span className="text-muted-foreground text-xs ml-1">+{session.skipped_count} dup</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-sm font-mono text-foreground">{session.matched_count}</span>
                        <span className="text-xs text-muted-foreground ml-1">/ {session.imported_count}</span>
                        {session.imported_count > 0 && (
                          <span className={`text-xs ml-2 ${
                            sessionMatchRate >= 90 ? 'text-green-600' :
                            sessionMatchRate >= 70 ? 'text-yellow-600' : 'text-muted-foreground'
                          }`}>
                            {sessionMatchRate}%
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {session.balance_verified === true ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : session.balance_verified === false ? (
                          <span className="inline-flex items-center gap-1 text-red-600 text-xs" title={
                            session.balance_discrepancy ? `Off by ${formatCurrency(session.balance_discrepancy)}` : ''
                          }>
                            <AlertCircle className="w-3.5 h-3.5" />
                            {session.balance_discrepancy ? formatCurrency(session.balance_discrepancy) : 'Mismatch'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          session.status === 'imported' ? 'bg-green-500/10 text-green-600' :
                          session.status === 'failed' ? 'bg-red-500/10 text-red-600' :
                          'bg-yellow-500/10 text-yellow-600'
                        }`}>
                          {session.status === 'imported' ? <CheckCircle2 className="w-3 h-3" /> :
                           session.status === 'failed' ? <AlertCircle className="w-3 h-3" /> :
                           <Clock className="w-3 h-3" />}
                          {session.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        {formatDate(session.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
