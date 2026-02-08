import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { ExportButton } from '@/components/reports/export-button'

export default async function ProfitLossPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { session } } = await supabase.auth.getSession(); const user = session?.user
  // Auth handled by layout

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user?.id ?? '')
    .single()

  if (!membership) redirect('/onboarding')

  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, api_key, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)

  if (!ledger) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No ledger found.</p>
      </div>
    )
  }

  // Get current month/year
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // Calculate revenue (platform_revenue credits)
  const { data: revenueAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'platform_revenue')
    .single()

  let totalRevenue = 0
  if (revenueAccount) {
    const { data: revenueEntries } = await supabase
      .from('entries')
      .select('amount, transactions!inner(status, created_at)')
      .eq('account_id', revenueAccount.id)
      .eq('entry_type', 'credit')
      .not('transactions.status', 'in', '("voided","reversed","draft")')

    for (const e of revenueEntries || []) {
      totalRevenue += Number(e.amount)
    }
  }

  // Calculate expenses (processing_fees debits)
  const { data: feeAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'processing_fees')
    .single()

  let totalFees = 0
  if (feeAccount) {
    const { data: feeEntries } = await supabase
      .from('entries')
      .select('amount, transactions!inner(status)')
      .eq('account_id', feeAccount.id)
      .eq('entry_type', 'debit')
      .not('transactions.status', 'in', '("voided","reversed","draft")')

    for (const e of feeEntries || []) {
      totalFees += Number(e.amount)
    }
  }

  // Get total sales volume
  const { data: salesData } = await supabase
    .from('transactions')
    .select('amount')
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'sale')
    .not('status', 'in', '("voided","reversed","draft")')

  const totalSales = (salesData || []).reduce((sum, t) => sum + Number(t.amount), 0)

  // Get total payouts
  const { data: payoutData } = await supabase
    .from('transactions')
    .select('amount')
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'payout')
    .not('status', 'in', '("voided","reversed","draft")')

  const totalPayouts = (payoutData || []).reduce((sum, t) => sum + Number(t.amount), 0)

  // Get creator payments (total credits to creator accounts)
  const { data: creatorAccounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')

  let totalCreatorPayments = 0
  for (const acc of creatorAccounts || []) {
    const { data: entries } = await supabase
      .from('entries')
      .select('amount, transactions!inner(status)')
      .eq('account_id', acc.id)
      .eq('entry_type', 'credit')
      .not('transactions.status', 'in', '("voided","reversed","draft")')

    for (const e of entries || []) {
      totalCreatorPayments += Number(e.amount)
    }
  }

  const netIncome = totalRevenue - totalFees
  const effectiveMargin = totalSales > 0 ? (totalRevenue / totalSales) * 100 : 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div>
      <div className="mb-8">
        <Link 
          href="/dashboard/reports" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Profit & Loss</h1>
            <p className="text-muted-foreground mt-1">
              {ledger.business_name} • Year to Date {year}
            </p>
          </div>
          <ExportButton
            reportType="profit-loss"
            ledgerId={ledger.id}
            year={year}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Gross Sales Volume</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Platform Revenue</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Processing Fees</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalFees)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Net Income</p>
          <p className={`text-2xl font-bold mt-1 ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(netIncome)}
          </p>
        </div>
      </div>

      {/* P&L Statement */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <h2 className="text-lg font-semibold text-foreground">Income Statement</h2>
        </div>
        
        <div className="divide-y divide-border">
          {/* Revenue Section */}
          <div className="px-6 py-4 bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Revenue</h3>
          </div>
          
          <div className="px-6 py-3 flex justify-between items-center">
            <span className="text-foreground">Gross Sales Volume</span>
            <span className="font-mono text-foreground">{formatCurrency(totalSales)}</span>
          </div>
          
          <div className="px-6 py-3 flex justify-between items-center pl-10">
            <span className="text-muted-foreground">Less: Creator Payments</span>
            <span className="font-mono text-muted-foreground">({formatCurrency(totalCreatorPayments)})</span>
          </div>
          
          <div className="px-6 py-3 flex justify-between items-center bg-green-500/5 border-l-4 border-green-500">
            <span className="font-semibold text-foreground">Platform Revenue (Take Rate)</span>
            <span className="font-mono font-semibold text-green-600">{formatCurrency(totalRevenue)}</span>
          </div>
          
          <div className="px-6 py-2 flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Effective Take Rate</span>
            <span className="font-mono text-muted-foreground">{effectiveMargin.toFixed(1)}%</span>
          </div>

          {/* Expenses Section */}
          <div className="px-6 py-4 bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Expenses</h3>
          </div>
          
          <div className="px-6 py-3 flex justify-between items-center">
            <span className="text-foreground">Payment Processing Fees</span>
            <span className="font-mono text-red-600">({formatCurrency(totalFees)})</span>
          </div>
          
          <div className="px-6 py-3 flex justify-between items-center bg-muted/30">
            <span className="font-semibold text-foreground">Total Expenses</span>
            <span className="font-mono font-semibold text-red-600">({formatCurrency(totalFees)})</span>
          </div>

          {/* Net Income */}
          <div className={`px-6 py-4 flex justify-between items-center ${
            netIncome >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
          }`}>
            <div className="flex items-center gap-2">
              {netIncome >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
              <span className="font-bold text-lg text-foreground">Net Income</span>
            </div>
            <span className={`font-mono font-bold text-lg ${
              netIncome >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(netIncome)}
            </span>
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Payout Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-foreground">Total Payouts Processed</span>
              <span className="font-mono">{formatCurrency(totalPayouts)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground">Pending Balances</span>
              <span className="font-mono">{formatCurrency(totalCreatorPayments - totalPayouts)}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Transaction Volume</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-foreground">Total Transactions</span>
              <span className="font-mono">{salesData?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground">Average Transaction</span>
              <span className="font-mono">
                {salesData && salesData.length > 0 
                  ? formatCurrency(totalSales / salesData.length) 
                  : '$0.00'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Fee Analysis</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-foreground">Fee Rate</span>
              <span className="font-mono">
                {totalSales > 0 ? ((totalFees / totalSales) * 100).toFixed(2) : '0.00'}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground">Net Margin</span>
              <span className="font-mono">
                {totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
