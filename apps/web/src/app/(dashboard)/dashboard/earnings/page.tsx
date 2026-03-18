'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, DollarSign, Users, ArrowDownRight } from 'lucide-react'

interface PeriodBucket {
  period: string
  period_label: string
  earned: number
  paid: number
  net: number
}

interface CreatorEarnings {
  creator_id: string
  name: string
  periods: PeriodBucket[]
  totals: { earned: number; paid: number; net: number }
}

interface EarningsData {
  period: { start: string; end: string }
  granularity: string
  creators: CreatorEarnings[]
  creator_count: number
  totals: { earned: number; paid: number; net: number }
}

type Granularity = 'monthly' | 'quarterly' | 'total'

function formatCurrency(dollars: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars)
}

export default function EarningsDashboardPage() {
  const [data, setData] = useState<EarningsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedCreator, setSelectedCreator] = useState<string>('')

  const loadData = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()

      // Get active ledger
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (!membership) throw new Error('No organization')

      const { data: ledgers } = await supabase
        .from('ledgers')
        .select('id')
        .eq('organization_id', membership.organization_id)
        .eq('status', 'active')
        .limit(1)

      const ledger = ledgers?.[0]
      if (!ledger) throw new Error('No ledger')

      // Call earnings edge function via proxy
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        granularity,
      })
      if (selectedCreator) params.set('creator_id', selectedCreator)

      const { data: apiKey } = await supabase
        .from('ledgers')
        .select('id')
        .eq('id', ledger.id)
        .single()

      if (!apiKey) throw new Error('No ledger access')

      // Use the proxy endpoint
      const res = await fetch(`/api/ledger-functions/earnings?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to load earnings')

      setData(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [granularity, year, selectedCreator])

  useEffect(() => {
    loadData()
  }, [loadData])

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Earnings</h1>
        <p className="text-muted-foreground mt-1">
          Historical earnings breakdown by creator and period
        </p>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Total Earned</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totals.earned)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownRight className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Total Paid Out</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totals.paid)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Net Balance</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totals.net)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Active Creators</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{data.creator_count}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity)}
          className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="total">Total</option>
        </select>
        {selectedCreator && (
          <button
            onClick={() => setSelectedCreator('')}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded"
          >
            Clear creator filter
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !data || data.creators.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No earnings data</h3>
            <p className="text-muted-foreground text-sm">No creator activity found for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted/50">Creator</th>
                  {data.creators[0]?.periods.map((p) => (
                    <th key={p.period} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {p.period_label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.creators.map((creator) => (
                  <tr
                    key={creator.creator_id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelectedCreator(
                      selectedCreator === creator.creator_id ? '' : creator.creator_id
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-card">
                      <span className="text-sm font-medium text-foreground">{creator.name}</span>
                      <span className="block text-xs text-muted-foreground">{creator.creator_id}</span>
                    </td>
                    {creator.periods.map((p) => (
                      <td key={p.period} className="px-4 py-3 whitespace-nowrap text-right">
                        <span className={`text-sm ${p.earned > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {p.earned > 0 ? formatCurrency(p.earned) : '—'}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(creator.totals.earned)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-sm text-foreground sticky left-0 bg-muted/30">Totals</td>
                  {data.creators[0]?.periods.map((_, i) => {
                    const periodTotal = data.creators.reduce((sum, c) => sum + c.periods[i].earned, 0)
                    return (
                      <td key={i} className="px-4 py-3 whitespace-nowrap text-right text-sm text-foreground">
                        {periodTotal > 0 ? formatCurrency(periodTotal) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-foreground">
                    {formatCurrency(data.totals.earned)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
