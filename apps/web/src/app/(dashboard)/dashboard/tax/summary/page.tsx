'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Users,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Calculator,
} from 'lucide-react'

interface QuarterlyBreakdown {
  quarter: string
  label: string
  revenue: number
  fees: number
  refunds: number
  payouts: number
  net: number
}

interface SalesTaxStateSummary {
  stateCode: string
  stateName: string
  reviewStatus: string
  registrationStatus: string
  taxableSales: number
  salesTaxCollected: number
  transactionCount: number
  thresholdSales: number | null
  thresholdTransactions: number | null
  thresholdReachedAt: string | null
  defaultTaxRateBps: number | null
}

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getAmountCents(value: unknown): number | null {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function getSaleAmounts(meta: Record<string, unknown> | null) {
  const amounts = isJsonRecord(meta?.amounts_cents) ? meta.amounts_cents : null
  const grossCents = getAmountCents(amounts?.gross)
  const subtotalCents = getAmountCents(amounts?.subtotal)
  const salesTaxCents = getAmountCents(amounts?.sales_tax) ?? 0
  const feeCents = getAmountCents(amounts?.fee) ?? 0
  const soledgicFeeCents = getAmountCents(amounts?.soledgic_fee) ?? 0

  return {
    subtotal: subtotalCents !== null
      ? subtotalCents / 100
      : grossCents !== null
        ? (grossCents - salesTaxCents) / 100
        : null,
    salesTax: salesTaxCents / 100,
    fees: (feeCents + soledgicFeeCents) / 100,
  }
}

export default function TaxSummaryPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [loading, setLoading] = useState(true)
  const [taxYear, setTaxYear] = useState(new Date().getFullYear())
  const [totals, setTotals] = useState({
    grossRevenue: 0,
    platformFees: 0,
    processingFees: 0,
    refunds: 0,
    creatorPayouts: 0,
    netIncome: 0,
    expenses: 0,
  })
  const [quarters, setQuarters] = useState<QuarterlyBreakdown[]>([])
  const [creatorCompliance, setCreatorCompliance] = useState({ total: 0, withTaxInfo: 0 })
  const [salesTaxCollected, setSalesTaxCollected] = useState(0)
  const [salesTaxStates, setSalesTaxStates] = useState<SalesTaxStateSummary[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      setLoading(false)
      return
    }

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

    // Get all non-voided transactions for the year
    const yearStart = `${taxYear}-01-01T00:00:00Z`
    const yearEnd = `${taxYear}-12-31T23:59:59Z`

    const { data: transactions } = await supabase
      .from('transactions')
      .select('transaction_type, amount, created_at, metadata, status')
      .eq('ledger_id', ledger.id)
      .not('status', 'in', '("voided","reversed")')
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd)

    let grossRevenue = 0
    let platformFees = 0
    let processingFees = 0
    let refunds = 0
    let creatorPayouts = 0
    let expenses = 0

    const quarterBuckets: Record<string, { revenue: number; fees: number; refunds: number; payouts: number }> = {
      Q1: { revenue: 0, fees: 0, refunds: 0, payouts: 0 },
      Q2: { revenue: 0, fees: 0, refunds: 0, payouts: 0 },
      Q3: { revenue: 0, fees: 0, refunds: 0, payouts: 0 },
      Q4: { revenue: 0, fees: 0, refunds: 0, payouts: 0 },
    }

    for (const tx of transactions ?? []) {
      const amount = Number(tx.amount)
      const month = new Date(tx.created_at).getMonth()
      const q = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4'
      const meta = tx.metadata as Record<string, unknown> | null

      switch (tx.transaction_type) {
        case 'sale':
          {
            const saleAmounts = getSaleAmounts(meta)
            const revenueAmount = saleAmounts.subtotal ?? amount
            grossRevenue += revenueAmount
            quarterBuckets[q].revenue += revenueAmount
            platformFees += saleAmounts.fees
            processingFees += 0
            if (saleAmounts.fees > 0) {
              quarterBuckets[q].fees += saleAmounts.fees
            }
          }
          break
        case 'refund':
          refunds += amount
          quarterBuckets[q].refunds += amount
          break
        case 'payout':
          creatorPayouts += amount
          quarterBuckets[q].payouts += amount
          break
        case 'expense':
          expenses += amount
          break
      }
    }

    const totalFees = platformFees + processingFees
    const netIncome = grossRevenue - totalFees - refunds - creatorPayouts - expenses

    setTotals({ grossRevenue, platformFees, processingFees, refunds, creatorPayouts, netIncome, expenses })

    const quarterLabels: Record<string, string> = {
      Q1: 'Jan – Mar',
      Q2: 'Apr – Jun',
      Q3: 'Jul – Sep',
      Q4: 'Oct – Dec',
    }

    setQuarters(
      ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({
        quarter: q,
        label: quarterLabels[q],
        revenue: quarterBuckets[q].revenue,
        fees: quarterBuckets[q].fees,
        refunds: quarterBuckets[q].refunds,
        payouts: quarterBuckets[q].payouts,
        net: quarterBuckets[q].revenue - quarterBuckets[q].fees - quarterBuckets[q].refunds - quarterBuckets[q].payouts,
      }))
    )

    // Creator compliance — just counts, no PII
    const { count: totalCreators } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('is_active', true)

    const { count: creatorsWithTax } = await supabase
      .from('tax_info_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('status', 'active')

    setCreatorCompliance({
      total: totalCreators ?? 0,
      withTaxInfo: creatorsWithTax ?? 0,
    })

    const { data: stateStatusRows } = await supabase
      .from('ledger_sales_tax_state_status')
      .select('state_code, taxable_sales_cents, tax_amount_cents, transaction_count, threshold_sales_cents, threshold_transactions, threshold_reached_at, registration_status')
      .eq('ledger_id', ledger.id)
      .eq('calendar_year', taxYear)
      .order('taxable_sales_cents', { ascending: false })

    const activeStateCodes = Array.from(new Set([
      'MD',
      ...((stateStatusRows ?? []).map((row) => row.state_code).filter((code): code is string => typeof code === 'string' && code.length > 0)),
    ]))

    const { data: stateRuleRows } = await supabase
      .from('sales_tax_state_rules')
      .select('state_code, state_name, review_status, default_tax_rate_bps')
      .in('state_code', activeStateCodes)

    const statusMap = new Map((stateStatusRows ?? []).map((row) => [row.state_code, row]))
    const summaries = (stateRuleRows ?? [])
      .map((rule) => {
        const status = statusMap.get(rule.state_code)
        return {
          stateCode: rule.state_code,
          stateName: rule.state_name,
          reviewStatus: rule.review_status,
          registrationStatus: status?.registration_status ?? (rule.review_status === 'reviewed' ? 'monitoring' : 'pending_review'),
          taxableSales: Number(status?.taxable_sales_cents ?? 0) / 100,
          salesTaxCollected: Number(status?.tax_amount_cents ?? 0) / 100,
          transactionCount: Number(status?.transaction_count ?? 0),
          thresholdSales: status?.threshold_sales_cents ? Number(status.threshold_sales_cents) / 100 : null,
          thresholdTransactions: status?.threshold_transactions ? Number(status.threshold_transactions) : null,
          thresholdReachedAt: status?.threshold_reached_at ?? null,
          defaultTaxRateBps: rule.default_tax_rate_bps ?? null,
        } satisfies SalesTaxStateSummary
      })
      .sort((a, b) => {
        if (b.taxableSales !== a.taxableSales) return b.taxableSales - a.taxableSales
        return a.stateCode.localeCompare(b.stateCode)
      })

    setSalesTaxStates(summaries)
    setSalesTaxCollected(summaries.reduce((sum, row) => sum + row.salesTaxCollected, 0))

    setLoading(false)
  }, [activeLedgerGroupId, livemode, taxYear])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [loadData])

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

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

  const complianceRate = creatorCompliance.total > 0
    ? Math.round((creatorCompliance.withTaxInfo / creatorCompliance.total) * 100)
    : 100

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tax Summary</h1>
          <p className="text-muted-foreground mt-1">Annual revenue, deductions, and estimated tax data</p>
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

      {/* Annual Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm text-muted-foreground">Gross Revenue</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{fmt(totals.grossRevenue)}</div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-muted-foreground">Fees & Deductions</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{fmt(totals.platformFees + totals.processingFees + totals.refunds)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Platform {fmt(totals.platformFees)} · Processing {fmt(totals.processingFees)} · Refunds {fmt(totals.refunds)}
          </div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">Creator Payouts</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{fmt(totals.creatorPayouts)}</div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-muted-foreground">Net Income</span>
          </div>
          <div className={`text-2xl font-bold ${totals.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(totals.netIncome)}
          </div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="w-4 h-4 text-sky-500" />
            <span className="text-sm text-muted-foreground">Sales Tax Collected</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{fmt(salesTaxCollected)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Tracked separately from creator and platform revenue.
          </div>
        </div>
      </div>

      {/* Creator Compliance Status — counts only, no PII */}
      <div className="bg-card border border-border rounded-lg p-5 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-muted-foreground" />
            <div>
              <h3 className="font-medium text-foreground">Creator Tax Compliance</h3>
              <p className="text-sm text-muted-foreground">
                {creatorCompliance.withTaxInfo} of {creatorCompliance.total} creators have tax info on file
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${complianceRate === 100 ? 'bg-green-500' : complianceRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${complianceRate}%` }}
              />
            </div>
            <span className={`text-sm font-medium ${complianceRate === 100 ? 'text-green-600' : complianceRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {complianceRate}%
            </span>
          </div>
        </div>
        {complianceRate < 100 && (
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            Creators without tax info are subject to 24% IRS backup withholding on payouts.
          </p>
        )}
      </div>

      {/* Sales Tax Threshold Tracking */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Sales Tax Threshold Tracking
        </h2>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 text-sm text-muted-foreground">
            Maryland digital goods is the only reviewed auto-collect rule in this repo. Other states are monitored for threshold activity and remain pending review.
          </div>
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">State</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Taxable Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Tax Collected</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Transactions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Threshold</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {salesTaxStates.map((row) => (
                <tr key={row.stateCode} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.stateName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.defaultTaxRateBps ? `${(row.defaultTaxRateBps / 100).toFixed(2)}% reviewed rate` : 'Rate pending review'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    {row.taxableSales > 0 ? fmt(row.taxableSales) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-foreground">
                    {row.salesTaxCollected > 0 ? fmt(row.salesTaxCollected) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {row.transactionCount > 0 ? row.transactionCount : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {row.thresholdSales || row.thresholdTransactions
                      ? `${row.thresholdSales ? fmt(row.thresholdSales) : 'No sales threshold'}${row.thresholdTransactions ? ` or ${row.thresholdTransactions} tx` : ''}`
                      : 'Needs legal review'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      row.registrationStatus === 'threshold_reached'
                        ? 'bg-yellow-500/15 text-yellow-700'
                        : row.registrationStatus === 'collecting' || row.registrationStatus === 'registered'
                          ? 'bg-green-500/15 text-green-700'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {row.registrationStatus === 'threshold_reached'
                        ? 'Threshold reached'
                        : row.reviewStatus === 'reviewed'
                          ? 'Monitoring'
                          : 'Pending review'}
                    </span>
                    {row.thresholdReachedAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Reached {new Date(row.thresholdReachedAt).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quarterly Breakdown */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Quarterly Breakdown
        </h2>
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Quarter</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Fees</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Refunds</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Payouts</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quarters.map(q => (
                <tr key={q.quarter} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{q.quarter}</span>
                    <span className="text-xs text-muted-foreground ml-2">{q.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                    {q.revenue > 0 ? fmt(q.revenue) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {q.fees > 0 ? fmt(q.fees) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {q.refunds > 0 ? fmt(q.refunds) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {q.payouts > 0 ? fmt(q.payouts) : '-'}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${q.net >= 0 ? 'text-foreground' : 'text-red-600'}`}>
                    {q.revenue > 0 || q.net !== 0 ? fmt(q.net) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Annual Total Footer */}
          <div className="border-t border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-foreground">Annual Total</span>
              <div className="flex gap-8">
                <span className="text-green-600">{fmt(totals.grossRevenue)}</span>
                <span className="text-muted-foreground">{fmt(totals.platformFees + totals.processingFees)}</span>
                <span className="text-muted-foreground">{fmt(totals.refunds)}</span>
                <span className="text-muted-foreground">{fmt(totals.creatorPayouts)}</span>
                <span className={totals.netIncome >= 0 ? 'text-foreground' : 'text-red-600'}>{fmt(totals.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Prompt */}
      <div className="bg-muted/50 rounded-lg p-6">
        <h3 className="font-medium text-foreground mb-2">For Your Accountant</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Export transaction data from the{' '}
          <Link href="/dashboard/tax/documents" className="text-primary hover:underline">Documents</Link>
          {' '}page to share with your tax preparer. Includes revenue, fees, refunds, and payout summaries.
        </p>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          Soledgic handles 1099 filing for your creators as Merchant of Record.
        </div>
      </div>
    </div>
  )
}
