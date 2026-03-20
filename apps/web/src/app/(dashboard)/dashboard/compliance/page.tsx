'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import type {
  ComplianceOverview,
  AccessPattern,
  SecuritySummaryEntry,
  ComplianceOverviewResponse,
  AccessPatternsResponse,
  SecuritySummaryResponse,
} from '@/lib/api-types'
import Link from 'next/link'
import { ArrowLeft, Shield, RefreshCw, AlertTriangle } from 'lucide-react'

export default function ComplianceDashboardPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [overview, setOverview] = useState<ComplianceOverview | null>(null)
  const [accessPatterns, setAccessPatterns] = useState<AccessPattern[]>([])
  const [securitySummary, setSecuritySummary] = useState<SecuritySummaryEntry[]>([])

  const resolveLedgerId = useCallback(async (): Promise<string | null> => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return null

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, ledger_group_id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)

    const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
    return ledger?.id || null
  }, [activeLedgerGroupId, livemode])

  const loadData = useCallback(async () => {
    setError(null)

    const id = await resolveLedgerId()
    if (!id) {
      setLoading(false)
      return
    }

    try {
      const [overviewRes, patternsRes, summaryRes] = await Promise.all([
        callLedgerFunction('compliance', {
          ledgerId: id,
          method: 'GET',
        }),
        callLedgerFunction('compliance/access-patterns', {
          ledgerId: id,
          method: 'GET',
          query: { hours: 24 },
        }),
        callLedgerFunction('compliance/security-summary', {
          ledgerId: id,
          method: 'GET',
          query: { days: 30 },
        }),
      ])

      const [overviewData, patternsData, summaryData]: [ComplianceOverviewResponse, AccessPatternsResponse, SecuritySummaryResponse] = await Promise.all([
        overviewRes.json(),
        patternsRes.json(),
        summaryRes.json(),
      ])

      if (overviewData.success && overviewData.overview) {
        setOverview(overviewData.overview)
      } else {
        setError(overviewData.error || 'Failed to load compliance overview')
      }

      if (patternsData.success) {
        setAccessPatterns(patternsData.patterns || [])
      }

      if (summaryData.success) {
        setSecuritySummary(summaryData.summary || [])
      }
    } catch {
      setError('Failed to load compliance data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [resolveLedgerId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    void loadData()
  }

  const getRiskBadge = (score: number) => {
    if (score >= 90) {
      return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Critical</span>
    }
    if (score >= 70) {
      return <span className="px-2 py-1 text-xs rounded bg-orange-500/10 text-orange-700 dark:text-orange-400">High</span>
    }
    if (score >= 40) {
      return <span className="px-2 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">Medium</span>
    }
    return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Low</span>
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
          <div className="grid grid-cols-4 gap-4 mt-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance Dashboard</h1>
          <p className="text-muted-foreground mt-1">Security monitoring and access pattern analysis</p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Overview Stats */}
      {overview && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">{overview.total_events.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Events ({overview.window_days}d)</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">{overview.unique_ips}</div>
            <div className="text-sm text-muted-foreground">Unique IPs</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold text-orange-600">{overview.high_risk_events}</div>
            <div className="text-sm text-muted-foreground">High Risk Events</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold text-red-600">{overview.critical_risk_events}</div>
            <div className="text-sm text-muted-foreground">Critical Risk Events</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold text-yellow-600">{overview.failed_auth_events}</div>
            <div className="text-sm text-muted-foreground">Failed Auth ({overview.access_window_hours}h)</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">{overview.refunds_recorded}</div>
            <div className="text-sm text-muted-foreground">Refunds Recorded</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">{overview.payouts_failed}</div>
            <div className="text-sm text-muted-foreground">Payouts Failed</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">{overview.dispute_events}</div>
            <div className="text-sm text-muted-foreground">Dispute Events</div>
          </div>
        </div>
      )}

      {/* Access Patterns Table */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Suspicious Access Patterns (24h)
        </h2>

        {accessPatterns.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No suspicious access patterns detected</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Patterns with high request volume, failed auths, or elevated risk scores appear here</p>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Hour</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Requests</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Failed Auth</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Max Risk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accessPatterns.map((pattern, idx) => (
                  <tr key={`${pattern.ip_address}-${pattern.hour}-${idx}`} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <code className="text-sm bg-muted px-2 py-1 rounded">{pattern.ip_address}</code>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(pattern.hour).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {pattern.request_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {pattern.failed_auths > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{pattern.failed_auths}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {pattern.max_risk_score}
                    </td>
                    <td className="px-4 py-3">
                      {getRiskBadge(pattern.max_risk_score)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Summary */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Security Summary (30 days)
        </h2>

        {securitySummary.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No security events in the last 30 days</p>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Events</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Unique IPs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Avg Risk</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Max Risk</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">High Risk</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Critical</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {securitySummary.map((entry, idx) => (
                  <tr key={`${entry.date}-${entry.action}-${idx}`} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.date}</td>
                    <td className="px-4 py-3">
                      <code className="text-sm bg-muted px-2 py-1 rounded">{entry.action}</code>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{entry.event_count}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{entry.unique_ips}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{entry.avg_risk_score}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{entry.max_risk_score}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {entry.high_risk_count > 0 ? (
                        <span className="text-orange-600 dark:text-orange-400 font-medium">{entry.high_risk_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {entry.critical_risk_count > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{entry.critical_risk_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
