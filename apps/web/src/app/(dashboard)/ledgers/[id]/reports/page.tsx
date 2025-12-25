import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, FileText, TrendingUp, Scale } from 'lucide-react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function getProfitLoss(apiKey: string, year: number) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/profit-loss?year=${year}&breakdown=monthly`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-api-key': apiKey,
      },
    }
  )
  return response.json()
}

async function getTrialBalance(apiKey: string) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/trial-balance`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-api-key': apiKey,
      },
    }
  )
  return response.json()
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  // Get ledger
  const { data: ledger, error } = await supabase
    .from('ledgers')
    .select('id, platform_name, api_key')
    .eq('id', id)
    .single()

  if (error || !ledger) {
    notFound()
  }

  const currentYear = new Date().getFullYear()
  
  // Fetch reports
  const [plData, tbData] = await Promise.all([
    getProfitLoss(ledger.api_key, currentYear),
    getTrialBalance(ledger.api_key),
  ])

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
            Financial reports for {ledger.platform_name}
          </p>
        </div>
      </div>

      {/* Report Cards */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Profit & Loss */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Profit & Loss</h2>
                <p className="text-sm text-muted-foreground">{currentYear}</p>
              </div>
            </div>
          </div>

          {plData.success ? (
            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Revenue</span>
                <span className="font-medium text-green-500">
                  ${plData.revenue?.total?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Expenses</span>
                <span className="font-medium text-red-500">
                  ${plData.expenses?.total?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="font-medium text-foreground">Net Income</span>
                <span className={`font-bold ${plData.net_income >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  ${plData.net_income?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load report</p>
          )}
        </div>

        {/* Trial Balance */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Scale className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Trial Balance</h2>
                <p className="text-sm text-muted-foreground">As of today</p>
              </div>
            </div>
          </div>

          {tbData.success ? (
            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Debits</span>
                <span className="font-medium text-foreground">
                  ${tbData.totals?.total_debits?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Credits</span>
                <span className="font-medium text-foreground">
                  ${tbData.totals?.total_credits?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="font-medium text-foreground">Balance</span>
                <span className={`font-bold ${tbData.totals?.is_balanced ? 'text-green-500' : 'text-red-500'}`}>
                  {tbData.totals?.is_balanced ? '✓ Balanced' : '✗ Unbalanced'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {tbData.integrity?.account_count} accounts, {tbData.integrity?.transaction_count} transactions
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load report</p>
          )}
        </div>
      </div>

      {/* Expense Categories (if P&L has expense breakdown) */}
      {plData.success && plData.expenses?.by_category && Object.keys(plData.expenses.by_category).length > 0 && (
        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Expenses by Category</h2>
          <div className="space-y-3">
            {Object.entries(plData.expenses.by_category).map(([category, amount]: [string, any]) => (
              <div key={category} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-muted-foreground capitalize">{category.replace(/_/g, ' ')}</span>
                <span className="font-medium text-foreground">${amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Options */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Export Reports</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <button className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent">
            <Download className="h-4 w-4" />
            P&L (CSV)
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent">
            <Download className="h-4 w-4" />
            Trial Balance (CSV)
          </button>
          <button className="flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-md hover:bg-accent">
            <Download className="h-4 w-4" />
            All Transactions (CSV)
          </button>
        </div>
      </div>
    </div>
  )
}
