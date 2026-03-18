'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { ShieldAlert, CheckCircle, AlertTriangle, ArrowLeft, Ban, Clock } from 'lucide-react'
import Link from 'next/link'

interface SecurityAlert {
  id: string
  severity: string
  alert_type: string
  title: string
  metadata: Record<string, unknown> | null
  acknowledged_at: string | null
  created_at: string
}

interface BoundaryViolation {
  id: string
  ledger_id: string | null
  entity_type: string | null
  entity_id: string | null
  ip_address: string | null
  request_body: Record<string, unknown> | null
  risk_score: number | null
  created_at: string
}

type Tab = 'alerts' | 'violations'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  warning: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminSecurityEventsPage() {
  const [tab, setTab] = useState<Tab>('alerts')
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [violations, setViolations] = useState<BoundaryViolation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState('')
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [hoursBack, setHoursBack] = useState(24)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      if (tab === 'alerts') {
        const params = new URLSearchParams({
          view: 'alerts',
          acknowledged: showAcknowledged ? 'all' : 'false',
        })
        if (severityFilter) params.set('severity', severityFilter)
        const res = await fetchWithCsrf(`/api/admin/security-events?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setAlerts(data.alerts || [])
      } else {
        const params = new URLSearchParams({
          view: 'boundary_violations',
          hours: String(hoursBack),
        })
        const res = await fetchWithCsrf(`/api/admin/security-events?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setViolations(data.violations || [])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tab, severityFilter, showAcknowledged, hoursBack])

  useEffect(() => {
    loadData()
  }, [loadData])

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetchWithCsrf('/api/admin/security-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alert_id: alertId }),
      })
      if (res.ok) {
        setAlerts((prev) => prev.map((a) =>
          a.id === alertId ? { ...a, acknowledged_at: new Date().toISOString() } : a
        ))
      }
    } catch {
      setError('Failed to acknowledge alert')
    }
  }

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged_at).length
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.acknowledged_at).length

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/admin/risk" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" />
          Risk Monitor
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Security Events</h1>
        <p className="text-muted-foreground mt-1">
          Platform-wide security alerts and cross-ledger boundary violations
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Ban className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-muted-foreground">Critical</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{criticalCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-muted-foreground">Warnings</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{warningCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-muted-foreground">Boundary Violations (24h)</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{tab === 'violations' ? violations.length : '—'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'alerts'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Security Alerts
        </button>
        <button
          onClick={() => setTab('violations')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'violations'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Boundary Violations
        </button>
      </div>

      {/* Filters */}
      {tab === 'alerts' && (
        <div className="flex items-center gap-3 mb-4">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showAcknowledged}
              onChange={(e) => setShowAcknowledged(e.target.checked)}
              className="rounded border-border"
            />
            Show acknowledged
          </label>
        </div>
      )}

      {tab === 'violations' && (
        <div className="flex items-center gap-3 mb-4">
          <select
            value={hoursBack}
            onChange={(e) => setHoursBack(Number(e.target.value))}
            className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
          >
            <option value={1}>Last hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
        </div>
      )}

      {/* Error state */}
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
        ) : tab === 'alerts' ? (
          alerts.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="w-12 h-12 text-green-500/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No security alerts</h3>
              <p className="text-muted-foreground text-sm">All clear — no active security events.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 ${alert.acknowledged_at ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-sm font-medium text-foreground">{alert.alert_type}</span>
                        {alert.acknowledged_at && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle className="w-3 h-3" /> Acknowledged
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{alert.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(alert.created_at)}
                        </span>
                      </div>
                      {alert.metadata && expandedId === alert.id && (
                        <pre className="mt-3 text-xs bg-muted border border-border rounded-md p-3 overflow-x-auto max-h-48">
                          {JSON.stringify(alert.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded"
                      >
                        {expandedId === alert.id ? 'Hide' : 'Details'}
                      </button>
                      {!alert.acknowledged_at && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="text-xs text-primary hover:text-primary/80 px-2 py-1 border border-primary/30 rounded"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          violations.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="w-12 h-12 text-green-500/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No boundary violations</h3>
              <p className="text-muted-foreground text-sm">No cross-ledger access attempts detected.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Ledger</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Violation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {violations.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {formatTime(v.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="text-muted-foreground">{v.entity_type || '—'}</span>
                      {v.entity_id && (
                        <code className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded">{v.entity_id}</code>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {v.ledger_id ? v.ledger_id.slice(0, 8) + '...' : '—'}
                      </code>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {v.ip_address || '—'}
                      </code>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {(v.request_body?.violation as string) || 'unknown'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
                        <AlertTriangle className="w-3 h-3" />
                        {v.risk_score || 100}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}
