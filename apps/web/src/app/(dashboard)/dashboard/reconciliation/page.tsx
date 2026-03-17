'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Upload, FileText, CheckCircle2, AlertCircle, Clock,
  ArrowRight, RefreshCw, Shield, ChevronRight,
} from 'lucide-react'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { createClient } from '@/lib/supabase/client'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { ProvenanceReport } from '@/components/reconciliation/provenance-report'

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

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function ReconciliationPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ImportSession[]>([])
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  useEffect(() => {
    async function init() {
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
      if (ledger) setLedgerId(ledger.id)
    }

    void init()
  }, [livemode, activeLedgerGroupId])

  const loadData = useCallback(async () => {
    if (!ledgerId) return
    setLoadingSessions(true)

    try {
      // Load import sessions
      const sessRes = await callLedgerFunction('import-transactions', {
        ledgerId,
        method: 'POST',
        body: { action: 'get_sessions' },
      })
      const sessData = await sessRes.json()
      if (sessData.success) setSessions(sessData.data || [])

      // Load match stats from bank_transactions
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
    setLoadingSessions(false)
  }, [ledgerId])

  useEffect(() => {
    if (ledgerId) void loadData()
  }, [ledgerId, loadData])

  const matchRate = matchStats && matchStats.total > 0
    ? Math.round((matchStats.matched / matchStats.total) * 100)
    : null

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-foreground">Reconciliation</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Import bank statements, verify balances, and match transactions to your ledger.
          Supports CSV, OFX, QFX, CAMT.053, BAI2, and MT940 formats.
        </p>
      </div>

      {/* Stats Overview */}
      {matchStats && matchStats.total > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-10">
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

      {/* Main Actions */}
      <div className="grid grid-cols-2 gap-6 mb-10">
        {/* Import */}
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

        {/* Provenance */}
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
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Import History</h2>
          <button
            onClick={() => void loadData()}
            disabled={loadingSessions}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSessions ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-10 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No imports yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your first bank statement to get started with reconciliation.
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
    </div>
  )
}
