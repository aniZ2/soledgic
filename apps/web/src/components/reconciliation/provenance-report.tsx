'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Loader2,
  ChevronDown, ChevronRight, Download, Cpu
} from 'lucide-react'

interface Transaction {
  id: string
  transaction_type: string
  reference_id: string
  amount: number
  description: string | null
  status: string
  created_at: string
  metadata: Record<string, unknown> | null
  entry_method: string | null
}

interface ProvenanceData {
  ledger_id: string
  business_name: string
  counts: Record<string, number>
  manual_revenue: Transaction[]
  system_repaired: Transaction[]
  totals: {
    manual_revenue: number
    processor_revenue: number
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function ProvenanceReport() {
  const [data, setData] = useState<ProvenanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [showSystem, setShowSystem] = useState(false)

  useEffect(() => {
    fetch('/api/reconciliation/provenance')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load')
        return res.json()
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading provenance report...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-muted-foreground text-sm">
          {error || 'Could not load provenance data.'}
        </p>
      </div>
    )
  }

  const totalTx = Object.values(data.counts).reduce((s, n) => s + n, 0)
  const manualRevenueCount = data.manual_revenue.length
  const manualPct = totalTx > 0
    ? ((data.counts.manual || 0) / totalTx * 100).toFixed(1)
    : '0'
  const hasManualRevenue = manualRevenueCount > 0
  const hasSystemRepairs = data.system_repaired.length > 0

  const totalRevenue = data.totals.manual_revenue + data.totals.processor_revenue
  const manualRevenuePct = totalRevenue > 0
    ? (data.totals.manual_revenue / totalRevenue * 100).toFixed(1)
    : '0'

  // Health: green if <5% manual revenue, yellow 5-20%, red >20%
  const manualRatio = totalRevenue > 0 ? data.totals.manual_revenue / totalRevenue : 0
  const healthColor = manualRatio < 0.05
    ? 'text-green-600'
    : manualRatio < 0.20
    ? 'text-yellow-600'
    : 'text-red-600'
  const healthBg = manualRatio < 0.05
    ? 'bg-green-500/10 border-green-500/20'
    : manualRatio < 0.20
    ? 'bg-yellow-500/10 border-yellow-500/20'
    : 'bg-red-500/10 border-red-500/20'
  const HealthIcon = manualRatio < 0.05 ? ShieldCheck : manualRatio < 0.20 ? AlertTriangle : ShieldAlert

  const handleExportManual = () => {
    if (!data.manual_revenue.length) return
    const rows = data.manual_revenue.map((tx) => ({
      date: new Date(tx.created_at).toISOString().slice(0, 10),
      type: tx.transaction_type,
      reference: tx.reference_id,
      description: tx.description || '',
      amount: tx.amount.toFixed(2),
      status: tx.status,
    }))
    const header = 'Date,Type,Reference,Description,Amount,Status'
    const csv = [header, ...rows.map((r) =>
      `${r.date},${r.type},${r.reference},"${r.description.replace(/"/g, '""')}",${r.amount},${r.status}`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `manual-revenue-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Health Summary */}
      <div className={`rounded-lg border p-6 ${healthBg}`}>
        <div className="flex items-start gap-4">
          <HealthIcon className={`w-8 h-8 mt-0.5 ${healthColor}`} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">Provenance Integrity</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {manualRatio < 0.05
                ? 'Ledger integrity is strong. Nearly all revenue is processor-verified.'
                : manualRatio < 0.20
                ? 'Some revenue entries are manually recorded without processor verification.'
                : 'A significant portion of revenue is manually entered. Review recommended.'}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Processor-Verified</p>
            <p className="text-xl font-bold text-foreground mt-1">{data.counts.processor || 0}</p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Manual Entries</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {data.counts.manual || 0}
              <span className="text-sm font-normal text-muted-foreground ml-1">({manualPct}%)</span>
            </p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">System Auto-Repaired</p>
            <p className="text-xl font-bold text-foreground mt-1">{data.counts.system || 0}</p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {(data.counts.untagged || 0) > 0 ? 'Untagged (Pre-Migration)' : 'Imported'}
            </p>
            <p className="text-xl font-bold text-foreground mt-1">
              {(data.counts.untagged || 0) > 0 ? data.counts.untagged : data.counts.import || 0}
            </p>
          </div>
        </div>

        {/* Revenue Breakdown */}
        {totalRevenue > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Revenue via Processor</span>
              <span className="font-medium text-foreground">{formatCurrency(data.totals.processor_revenue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Revenue via Manual Entry</span>
              <span className={`font-medium ${hasManualRevenue ? healthColor : 'text-foreground'}`}>
                {formatCurrency(data.totals.manual_revenue)}
                {hasManualRevenue && (
                  <span className="text-xs ml-1">({manualRevenuePct}% of revenue)</span>
                )}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${100 - Number(manualRevenuePct)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Processor-verified</span>
              <span>Manual</span>
            </div>
          </div>
        )}
      </div>

      {/* Manual Revenue Entries (expandable) */}
      {hasManualRevenue && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowManual(!showManual)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <div className="text-left">
                <h3 className="font-semibold text-foreground">
                  Manual Revenue Entries ({manualRevenueCount})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Sales and income recorded without processor verification
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showManual && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleExportManual() }}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs border border-border rounded-md hover:bg-accent text-muted-foreground"
                >
                  <Download className="w-3 h-3" />
                  Export
                </button>
              )}
              {showManual ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
            </div>
          </button>

          {showManual && (
            <div className="border-t border-border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Reference</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.manual_revenue.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(tx.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-sm font-medium text-foreground">{tx.transaction_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/transactions/${tx.id}`}>
                          <code className="text-xs bg-muted px-2 py-1 rounded hover:underline">{tx.reference_id}</code>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                        {tx.description || '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* System-Repaired Entries (expandable) */}
      {hasSystemRepairs && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSystem(!showSystem)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-blue-500" />
              <div className="text-left">
                <h3 className="font-semibold text-foreground">
                  System Auto-Repaired ({data.system_repaired.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Transactions auto-booked by reconciler or webhook processor
                </p>
              </div>
            </div>
            {showSystem ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
          </button>

          {showSystem && (
            <div className="border-t border-border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Reference</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Source</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.system_repaired.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(tx.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-sm font-medium text-foreground">{tx.transaction_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/transactions/${tx.id}`}>
                          <code className="text-xs bg-muted px-2 py-1 rounded hover:underline">{tx.reference_id}</code>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {(tx.metadata?.booked_from as string) === 'process_processor_inbox'
                          ? 'Webhook processor'
                          : (tx.metadata?.reconciled as boolean)
                          ? 'Reconciler'
                          : (tx.metadata?.auto_repaired as boolean)
                          ? 'Auto-repair'
                          : 'System'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* All clear state */}
      {!hasManualRevenue && !hasSystemRepairs && totalTx > 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-green-500 mx-auto" />
          <h3 className="mt-3 font-semibold text-foreground">All entries verified</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No manual revenue entries or system repairs to review.
          </p>
        </div>
      )}
    </div>
  )
}
