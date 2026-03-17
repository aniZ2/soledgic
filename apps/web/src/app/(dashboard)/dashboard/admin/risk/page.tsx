'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { ShieldAlert, CheckCircle, AlertTriangle, ArrowLeft, X, Users, BarChart3, Zap } from 'lucide-react'
import Link from 'next/link'

interface RiskSignal {
  id: string
  signal_type: string
  severity: string
  entity_type: string | null
  entity_id: string | null
  description: string
  details: Record<string, unknown> | null
  resolved: boolean
  created_at: string
  organization_id: string
}

interface OrgRiskSummary {
  organization_id: string
  organization_name: string
  kyc_status: string
  composite_risk_score: number
  open_risk_signals: number
  critical_signals: number
  high_signals: number
  high_risk_actions_30d: number
  failed_auths_30d: number
}

interface CreatorRisk {
  id: string
  entity_id: string
  display_name: string | null
  email: string | null
  risk_score: number
  risk_flags: string[]
  payout_delay_days: number
  payout_delay_reason: string | null
  kyc_status: string | null
  created_at: string
}

type Tab = 'signals' | 'summary' | 'creators'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
}

function riskScoreColor(score: number): string {
  if (score >= 60) return 'text-red-600'
  if (score >= 30) return 'text-orange-600'
  if (score >= 10) return 'text-yellow-600'
  return 'text-green-600'
}

function riskBadge(score: number): string {
  if (score >= 60) return 'High'
  if (score >= 30) return 'Elevated'
  if (score >= 10) return 'Low'
  return 'Clean'
}

export default function AdminRiskPage() {
  const [tab, setTab] = useState<Tab>('signals')
  const [signals, setSignals] = useState<RiskSignal[]>([])
  const [summary, setSummary] = useState<OrgRiskSummary[]>([])
  const [creators, setCreators] = useState<CreatorRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      if (tab === 'summary') {
        const res = await fetchWithCsrf('/api/admin/risk?view=summary')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSummary(data.summary || [])
      } else if (tab === 'creators') {
        const res = await fetchWithCsrf('/api/admin/risk?view=creators')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setCreators(data.creators || [])
      } else {
        const params = new URLSearchParams({ resolved: 'false' })
        if (severityFilter) params.set('severity', severityFilter)
        const res = await fetchWithCsrf(`/api/admin/risk?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSignals(data.signals || [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tab, severityFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleResolve = async (signalId: string) => {
    try {
      const res = await fetchWithCsrf('/api/admin/risk', {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve', signal_id: signalId, resolution_note: resolutionNote || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSignals((prev) => prev.filter((s) => s.id !== signalId))
      setResolvingId(null)
      setResolutionNote('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve')
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6" />
            Risk Monitor
          </h1>
          <p className="text-muted-foreground mt-1">Behavioral risk signals, org scores, and creator risk profiles</p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3 mb-6">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'signals' as Tab, label: 'Open Signals', icon: Zap },
          { key: 'creators' as Tab, label: 'Creator Risk', icon: Users },
          { key: 'summary' as Tab, label: 'Org Scores', icon: BarChart3 },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Signals Tab */}
      {tab === 'signals' && (
        <>
          <div className="flex gap-2 mb-4">
            {['', 'critical', 'high', 'medium', 'low'].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  severityFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>
          ) : signals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No open risk signals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {signals.map((signal) => (
                <div key={signal.id} className={`border rounded-lg p-4 ${SEVERITY_COLORS[signal.severity] || ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase">{signal.severity}</span>
                        <span className="text-xs px-2 py-0.5 bg-background/50 rounded">{signal.signal_type.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-sm font-medium">{signal.description}</p>
                      <p className="text-xs mt-1 opacity-70">
                        {signal.entity_type && `${signal.entity_type}: ${signal.entity_id}`}
                        {signal.entity_type && ' · '}
                        {new Date(signal.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {resolvingId === signal.id ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="Note (optional)" className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground w-40" />
                          <button onClick={() => handleResolve(signal.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Confirm</button>
                          <button onClick={() => { setResolvingId(null); setResolutionNote('') }} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setResolvingId(signal.id)} className="text-xs px-2 py-1 border border-border rounded hover:bg-background/50">Resolve</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Creator Risk Tab */}
      {tab === 'creators' && (
        loading ? (
          <div className="animate-pulse space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>
        ) : creators.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No creator risk data available</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Creator</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Risk Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Risk Level</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Payout Delay</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Flags</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">KYC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creators.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{c.display_name || c.entity_id}</p>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${riskScoreColor(c.risk_score)}`}>
                      {c.risk_score}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        c.risk_score >= 60 ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                        : c.risk_score >= 30 ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
                        : c.risk_score >= 10 ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                        : 'bg-green-500/10 text-green-700 dark:text-green-400'
                      }`}>
                        {riskBadge(c.risk_score)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                      {c.payout_delay_days}d
                      {c.payout_delay_reason && c.payout_delay_reason !== 'default' && (
                        <span className="text-xs text-orange-600 ml-1">({c.payout_delay_reason})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.risk_flags || []).map((flag) => (
                          <span key={flag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {flag.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {(!c.risk_flags || c.risk_flags.length === 0) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{c.kyc_status || 'pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Org Scores Tab */}
      {tab === 'summary' && (
        loading ? (
          <div className="animate-pulse space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>
        ) : summary.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No organization risk data available</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Organization</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Risk Score</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Open Signals</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Critical</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">High Risk Actions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">KYC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.map((org) => (
                  <tr key={org.organization_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{org.organization_name}</td>
                    <td className={`px-4 py-3 text-sm text-right font-bold ${riskScoreColor(org.composite_risk_score)}`}>{org.composite_risk_score}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{org.open_risk_signals}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {org.critical_signals > 0 ? <span className="text-red-600 font-medium">{org.critical_signals}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{org.high_risk_actions_30d}</td>
                    <td className="px-4 py-3 text-sm capitalize text-muted-foreground">{org.kyc_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
