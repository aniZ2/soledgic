'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import {
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  Calendar,
} from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'

interface ExportableReport {
  id: string
  name: string
  description: string
  type: 'revenue' | 'expenses' | 'fees' | 'payouts' | 'full'
}

const AVAILABLE_REPORTS: ExportableReport[] = [
  {
    id: 'revenue-summary',
    name: 'Revenue Summary',
    description: 'All sales transactions with dates, amounts, and reference IDs',
    type: 'revenue',
  },
  {
    id: 'expense-summary',
    name: 'Expense Summary',
    description: 'All recorded expenses with categories and amounts',
    type: 'expenses',
  },
  {
    id: 'fee-summary',
    name: 'Platform & Processing Fees',
    description: 'Breakdown of all fees deducted (deductible business expenses)',
    type: 'fees',
  },
  {
    id: 'payout-summary',
    name: 'Creator Payout Summary',
    description: 'All payouts made to creators (contractor payments for your records)',
    type: 'payouts',
  },
  {
    id: 'full-export',
    name: 'Full Transaction Export',
    description: 'Complete transaction history for the tax year',
    type: 'full',
  },
]

export default function TaxDocumentsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)
  const [taxYear, setTaxYear] = useState(new Date().getFullYear())
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [txCounts, setTxCounts] = useState<Record<string, number>>({})
  const toast = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
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
    if (!ledger) {
      setLoading(false)
      return
    }
    setLedgerId(ledger.id)

    const yearStart = `${taxYear}-01-01T00:00:00Z`
    const yearEnd = `${taxYear}-12-31T23:59:59Z`

    // Get counts per transaction type for the year
    const { data: transactions } = await supabase
      .from('transactions')
      .select('transaction_type')
      .eq('ledger_id', ledger.id)
      .not('status', 'in', '("voided","reversed")')
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd)

    const counts: Record<string, number> = { sale: 0, expense: 0, payout: 0, refund: 0, total: 0 }
    for (const tx of transactions ?? []) {
      counts[tx.transaction_type] = (counts[tx.transaction_type] ?? 0) + 1
      counts.total++
    }
    setTxCounts(counts)
    setLoading(false)
  }, [activeLedgerGroupId, livemode, taxYear])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportReport = async (report: ExportableReport) => {
    if (!ledgerId) return
    setExporting(report.id)

    try {
      const supabase = createClient()
      const yearStart = `${taxYear}-01-01T00:00:00Z`
      const yearEnd = `${taxYear}-12-31T23:59:59Z`

      let query = supabase
        .from('transactions')
        .select('id, transaction_type, amount, description, reference_id, status, created_at, metadata')
        .eq('ledger_id', ledgerId)
        .not('status', 'in', '("voided","reversed")')
        .gte('created_at', yearStart)
        .lte('created_at', yearEnd)
        .order('created_at', { ascending: true })

      // Filter by type unless full export
      if (report.type === 'revenue') query = query.eq('transaction_type', 'sale')
      else if (report.type === 'expenses') query = query.eq('transaction_type', 'expense')
      else if (report.type === 'payouts') query = query.eq('transaction_type', 'payout')
      else if (report.type === 'fees') query = query.in('transaction_type', ['sale']) // fees are embedded in sale metadata

      const { data: rows, error } = await query
      if (error) throw error

      // Build CSV
      const headers = ['Date', 'Type', 'Description', 'Reference', 'Amount', 'Status']
      if (report.type === 'fees') {
        headers.push('Platform Fee', 'Processing Fee')
      }

      const csvRows = [headers.join(',')]
      for (const row of rows ?? []) {
        const meta = row.metadata as Record<string, unknown> | null
        const line = [
          new Date(row.created_at).toISOString().split('T')[0],
          row.transaction_type,
          `"${(row.description ?? '').replace(/"/g, '""')}"`,
          row.reference_id ?? '',
          Number(row.amount).toFixed(2),
          row.status,
        ]
        if (report.type === 'fees') {
          line.push(
            Number(meta?.platform_fee ?? 0).toFixed(2),
            Number(meta?.processing_fee ?? 0).toFixed(2),
          )
        }
        csvRows.push(line.join(','))
      }

      const csv = csvRows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `soledgic_${report.id}_${taxYear}.csv`
      a.click()
      window.URL.revokeObjectURL(url)

      toast.success('Export complete', `${report.name} downloaded`)
    } catch {
      toast.error('Export failed', 'Could not generate the report')
    } finally {
      setExporting(null)
    }
  }

  const getCountForReport = (report: ExportableReport): number => {
    switch (report.type) {
      case 'revenue': return txCounts.sale ?? 0
      case 'expenses': return txCounts.expense ?? 0
      case 'payouts': return txCounts.payout ?? 0
      case 'fees': return txCounts.sale ?? 0
      case 'full': return txCounts.total ?? 0
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tax Documents</h1>
          <p className="text-muted-foreground mt-1">Export transaction data for your tax preparer</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
          >
            {[...Array(5)].map((_, i) => {
              const year = new Date().getFullYear() - i
              return <option key={year} value={year}>{year}</option>
            })}
          </select>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* MoR Notice */}
      <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-green-900 dark:text-green-300">1099 Filing Handled by Soledgic</p>
            <p className="text-green-700 dark:text-green-400 mt-1">
              As Merchant of Record, Soledgic handles 1099-NEC filing for all creators on your platform.
              You do not need to file 1099s for creators — only for your own business obligations.
            </p>
          </div>
        </div>
      </div>

      {/* Available Reports */}
      <div className="space-y-4">
        {AVAILABLE_REPORTS.map(report => {
          const count = getCountForReport(report)
          return (
            <div key={report.id} className="bg-card border border-border rounded-lg p-5 flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{report.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{report.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {taxYear}
                    </span>
                    <span>{count} transaction{count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => exportReport(report)}
                disabled={exporting === report.id || count === 0}
                className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
              >
                <Download className="w-4 h-4" />
                {exporting === report.id ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          )
        })}
      </div>

      {/* What's Included */}
      <div className="mt-8 bg-muted/50 rounded-lg p-6">
        <h3 className="font-medium text-foreground mb-3">What&apos;s Included</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-foreground mb-1">Deductible Expenses</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>Platform fees (Soledgic subscription + usage)</li>
              <li>Payment processing fees (Stripe)</li>
              <li>Refunds issued to customers</li>
              <li>Recorded business expenses</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-1">Income Records</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>Gross sales revenue by date</li>
              <li>Creator payout amounts</li>
              <li>Net income after fees and payouts</li>
              <li>Quarterly estimated tax breakdowns</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
