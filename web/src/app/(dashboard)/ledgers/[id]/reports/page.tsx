'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, TrendingUp, Scale, Calendar, RefreshCw, FileText, ExternalLink } from 'lucide-react'

interface ReportData {
  trialBalance: any
  profitLoss: any
  runway: any
}

export default function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const currentYear = new Date().getFullYear()
  
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReportData>({ trialBalance: null, profitLoss: null, runway: null })

  useEffect(() => {
    async function loadReports() {
      setLoading(true)
      try {
        const [tbRes, plRes, runwayRes] = await Promise.all([
          fetch(`/api/ledgers/${id}/reports?type=trial-balance`),
          fetch(`/api/ledgers/${id}/reports?type=profit-loss&year=${year}`),
          fetch(`/api/ledgers/${id}/reports?type=runway`),
        ])

        const [tb, pl, runway] = await Promise.all([
          tbRes.json(),
          plRes.json(),
          runwayRes.json(),
        ])

        setData({ trialBalance: tb, profitLoss: pl, runway: runway })
      } catch (err) {
        console.error('Failed to load reports:', err)
      }
      setLoading(false)
    }

    loadReports()
  }, [id, year])

  const handleExport = async (reportType: string, format: string) => {
    try {
      const response = await fetch(`/api/ledgers/${id}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: reportType,
          format,
          year,
        }),
      })

      const result = await response.json()
      
      if (result.download_url) {
        window.open(result.download_url, '_blank')
      } else if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportType}-${year}.json`
        a.click()
      }
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const { trialBalance: tb, profitLoss: pl, runway } = data

  // Calculate Schedule C values from P&L
  const scheduleC = pl?.success !== false ? {
    line1: pl?.revenue?.total || 0, // Gross receipts
    line4: pl?.revenue?.total || 0, // Gross profit (simplified)
    line27: pl?.expenses?.total || 0, // Total expenses
    line28: pl?.expenses?.total || 0, // Total expenses
    line29: (pl?.revenue?.total || 0) - (pl?.expenses?.total || 0), // Tentative profit
    line31: pl?.net_income || 0, // Net profit
  } : null

  return (
    <div>
      <Link
        href={`/ledgers/${id}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Financial reports and tax exports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Report Cards */}
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Trial Balance */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Scale className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Trial Balance</h2>
                  <p className="text-xs text-muted-foreground">As of today</p>
                </div>
              </div>

              {tb?.success !== false ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Debits</span>
                    <span className="font-medium">${tb?.totals?.total_debits?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Credits</span>
                    <span className="font-medium">${tb?.totals?.total_credits?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="pt-2 border-t border-border flex justify-between text-sm">
                    <span className="font-medium">Status</span>
                    <span className={tb?.totals?.is_balanced ? 'text-green-500' : 'text-red-500'}>
                      {tb?.totals?.is_balanced ? '✓ Balanced' : '✗ Unbalanced'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}

              <button
                onClick={() => handleExport('trial_balance', 'csv')}
                className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-md hover:bg-accent text-sm"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>

            {/* Profit & Loss */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Profit & Loss</h2>
                  <p className="text-xs text-muted-foreground">{year}</p>
                </div>
              </div>

              {pl?.success !== false ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Revenue</span>
                    <span className="font-medium text-green-500">
                      ${pl?.revenue?.total?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-medium text-red-500">
                      ${pl?.expenses?.total?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-border flex justify-between text-sm">
                    <span className="font-medium">Net Income</span>
                    <span className={`font-bold ${(pl?.net_income || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${pl?.net_income?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}

              <button
                onClick={() => handleExport('profit_loss', 'csv')}
                className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-md hover:bg-accent text-sm"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>

            {/* Cash Runway */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Cash Runway</h2>
                  <p className="text-xs text-muted-foreground">Projection</p>
                </div>
              </div>

              {runway?.success !== false ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cash Balance</span>
                    <span className="font-medium">${runway?.current_cash?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Monthly Burn</span>
                    <span className="font-medium">${runway?.monthly_burn?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="pt-2 border-t border-border flex justify-between text-sm">
                    <span className="font-medium">Runway</span>
                    <span className="font-bold">
                      {runway?.runway_months ? `${runway.runway_months} months` : '∞'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </div>
          </div>

          {/* Schedule C Summary */}
          {scheduleC && (
            <div className="mt-8 bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <FileText className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Schedule C Summary</h2>
                    <p className="text-xs text-muted-foreground">
                      {year} • Copy these values to your tax return
                    </p>
                  </div>
                </div>
                <a
                  href="https://www.irs.gov/forms-pubs/about-schedule-c-form-1040"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  IRS Schedule C
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-md">
                  <span className="text-sm">
                    <span className="font-mono text-muted-foreground">Line 1</span>
                    <span className="ml-2 text-foreground">Gross receipts</span>
                  </span>
                  <span className="font-medium font-mono">${scheduleC.line1.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-md">
                  <span className="text-sm">
                    <span className="font-mono text-muted-foreground">Line 28</span>
                    <span className="ml-2 text-foreground">Total expenses</span>
                  </span>
                  <span className="font-medium font-mono">${scheduleC.line28.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-foreground/5 rounded-md border border-border">
                  <span className="text-sm">
                    <span className="font-mono text-muted-foreground">Line 31</span>
                    <span className="ml-2 font-medium text-foreground">Net profit (or loss)</span>
                  </span>
                  <span className={`font-bold font-mono ${scheduleC.line31 >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${scheduleC.line31.toFixed(2)}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                These figures are derived from your ledger transactions. Export detailed breakdowns below for your records or accountant.
              </p>
            </div>
          )}

          {/* Expense Breakdown */}
          {pl?.expenses?.by_category && Object.keys(pl.expenses.by_category).length > 0 && (
            <div className="mt-6 bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Expenses by Category</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(pl.expenses.by_category)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([category, amount]) => (
                    <div key={category} className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
                      <span className="text-sm text-muted-foreground capitalize">
                        {category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-medium">${(amount as number).toFixed(2)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Export All */}
          <div className="mt-6 bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Export Data</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Download for your records, accountant, or to file via IRS Free File.
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <button
                onClick={() => handleExport('transactions', 'csv')}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent text-sm"
              >
                <Download className="h-4 w-4" />
                All Transactions
              </button>
              <button
                onClick={() => handleExport('expenses', 'csv')}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent text-sm"
              >
                <Download className="h-4 w-4" />
                Expenses Only
              </button>
              <button
                onClick={() => handleExport('1099_summary', 'csv')}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent text-sm"
              >
                <Download className="h-4 w-4" />
                1099 Summary
              </button>
              <button
                onClick={() => handleExport('profit_loss', 'json')}
                className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent text-sm"
              >
                <Download className="h-4 w-4" />
                Full JSON Export
              </button>
            </div>
          </div>

          {/* Tax Filing Note */}
          <div className="mt-6 bg-muted/30 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Note:</strong> Soledge provides accurate financial data for your records. 
              To file taxes, export your Schedule C summary and enter the values into{' '}
              <a href="https://www.irs.gov/filing/free-file-do-your-federal-taxes-for-free" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                IRS Free File
              </a>
              , or send exports to your accountant.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
