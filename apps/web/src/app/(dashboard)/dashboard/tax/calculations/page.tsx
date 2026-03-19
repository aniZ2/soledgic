'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import Link from 'next/link'
import {
  Calculator,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  DollarSign,
} from 'lucide-react'

interface TaxSummaryRow {
  entity_id: string
  gross_earnings: number
  refunds_issued: number
  net_earnings: number
  total_paid_out: number
  requires_1099: boolean
  linked_user_id: string | null
  has_tax_profile: boolean
}

interface CreatorName {
  entity_id: string
  name: string
}

export default function TaxCalculationsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [summaries, setSummaries] = useState<(TaxSummaryRow & { name: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [taxYear, setTaxYear] = useState(new Date().getFullYear())
  const [ledgerId, setLedgerId] = useState<string | null>(null)

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
    if (!ledger) return
    setLedgerId(ledger.id)

    // Get stored tax year summaries
    const { data: stored } = await supabase
      .from('tax_year_summaries')
      .select('entity_id, gross_earnings, refunds_issued, net_earnings, total_paid_out, requires_1099')
      .eq('ledger_id', ledger.id)
      .eq('tax_year', taxYear)
      .order('gross_earnings', { ascending: false })

    // Get creator names
    const { data: accounts } = await supabase
      .from('accounts')
      .select('entity_id, name')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')

    const nameMap = new Map<string, string>(
      (accounts as CreatorName[] | null)?.map(a => [a.entity_id, a.name]) ?? []
    )

    const rows = (stored ?? []).map(s => ({
      ...s,
      linked_user_id: null as string | null,
      has_tax_profile: false,
      name: nameMap.get(s.entity_id) ?? s.entity_id,
    }))

    setSummaries(rows)
    setLoading(false)
  }, [activeLedgerGroupId, livemode, taxYear])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const computeSummaries = async () => {
    if (!ledgerId) return
    setComputing(true)
    try {
      const res = await callLedgerFunction('tax/summaries/' + taxYear, {
        ledgerId,
        method: 'GET',
      })
      const result = await res.json()
      if (result.success) {
        loadData()
      }
    } catch {
      // Will reload anyway
    } finally {
      setComputing(false)
      loadData()
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const totalGross = summaries.reduce((s, r) => s + Number(r.gross_earnings), 0)
  const totalRefunds = summaries.reduce((s, r) => s + Number(r.refunds_issued), 0)
  const totalNet = summaries.reduce((s, r) => s + Number(r.net_earnings), 0)
  const totalPaid = summaries.reduce((s, r) => s + Number(r.total_paid_out), 0)
  const requiring1099 = summaries.filter(s => s.requires_1099).length

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
          <h1 className="text-2xl font-bold text-foreground">Tax Calculations</h1>
          <p className="text-muted-foreground mt-1">Year-to-date earnings and 1099 threshold tracking</p>
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
            onClick={computeSummaries}
            disabled={computing}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${computing ? 'animate-spin' : ''}`} />
            {computing ? 'Computing...' : 'Compute'}
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-card p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Gross Earnings</span>
          </div>
          <div className="text-xl font-bold">{formatCurrency(totalGross)}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Refunds</span>
          </div>
          <div className="text-xl font-bold">{formatCurrency(totalRefunds)}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Net Earnings</span>
          </div>
          <div className="text-xl font-bold">{formatCurrency(totalNet)}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Total Paid Out</span>
          </div>
          <div className="text-xl font-bold">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Requires 1099</span>
          </div>
          <div className="text-xl font-bold">{requiring1099}</div>
        </div>
      </div>

      {/* 1099 Threshold Banner */}
      {requiring1099 > 0 && (
        <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-orange-900 dark:text-orange-300">
                {requiring1099} creator{requiring1099 !== 1 ? 's' : ''} above $600 threshold
              </p>
              <p className="text-orange-700 dark:text-orange-400 mt-1">
                These creators require 1099-NEC filing. Go to{' '}
                <Link href="/dashboard/tax/1099" className="underline font-medium">1099 Overview</Link>
                {' '}to generate and manage documents.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Per-Creator Table */}
      {summaries.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Calculator className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No tax calculations for {taxYear}</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Click &quot;Compute&quot; to calculate year-to-date summaries</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Creator</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Gross</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Refunds</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Net</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Paid Out</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">1099</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summaries.map(row => (
                <tr key={row.entity_id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.name}</div>
                    <code className="text-xs text-muted-foreground">{row.entity_id}</code>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    {formatCurrency(Number(row.gross_earnings))}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {Number(row.refunds_issued) > 0 ? formatCurrency(Number(row.refunds_issued)) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    {formatCurrency(Number(row.net_earnings))}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {formatCurrency(Number(row.total_paid_out))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.requires_1099 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-600">
                        <AlertTriangle className="w-3 h-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/creators/${row.entity_id}`}
                      className="text-sm text-primary hover:text-primary/80"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Footer */}
          <div className="border-t border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{summaries.length} creators</span>
              <div className="flex gap-6">
                <span className="text-muted-foreground">Gross: <strong className="text-foreground">{formatCurrency(totalGross)}</strong></span>
                <span className="text-muted-foreground">Net: <strong className="text-foreground">{formatCurrency(totalNet)}</strong></span>
                <span className="text-muted-foreground">Paid: <strong className="text-foreground">{formatCurrency(totalPaid)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
