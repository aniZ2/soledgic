'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Shield, AlertTriangle, Search, Filter, X,
  ChevronLeft, ChevronRight, Download
} from 'lucide-react'

interface AuditEntry {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  actor_type: string | null
  actor_id: string | null
  ip_address: string | null
  request_body: Record<string, unknown> | null
  response_status: number | null
  risk_score: number | null
  request_id: string | null
  created_at: string
}

const ACTIONS = [
  'api_error',
  'cross_ledger_violation',
  'webhook_invalid_signature',
  'webhook_replay_attempt',
  'payout_initiated',
  'batch_payout_executed',
  'nacha_generated',
  'api_key_created',
  'api_key_rotated',
  'ledger_deleted',
  'webhook_secret_rotated',
  'health_check_alert',
  'health_check_cron',
  'participant_identity_linked',
  'security_alert',
]

const PAGE_SIZE = 50

function getRiskBadge(score: number | null) {
  if (score === null || score === 0) return null
  if (score >= 70) return { label: 'High', className: 'bg-red-500/10 text-red-600' }
  if (score >= 40) return { label: 'Medium', className: 'bg-amber-500/10 text-amber-600' }
  return { label: 'Low', className: 'bg-blue-500/10 text-blue-600' }
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState<'' | 'high' | 'medium' | 'low'>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hasActiveFilters = search || actionFilter || riskFilter || dateFrom || dateTo

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()

      let query = supabase
        .from('audit_log')
        .select('id, action, entity_type, entity_id, actor_type, actor_id, ip_address, request_body, response_status, risk_score, request_id, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (actionFilter) {
        query = query.eq('action', actionFilter)
      }
      if (riskFilter === 'high') {
        query = query.gte('risk_score', 70)
      } else if (riskFilter === 'medium') {
        query = query.gte('risk_score', 40).lt('risk_score', 70)
      } else if (riskFilter === 'low') {
        query = query.gt('risk_score', 0).lt('risk_score', 40)
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom)
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
      }
      if (search) {
        query = query.or(`action.ilike.%${search}%,request_id.ilike.%${search}%,actor_id.ilike.%${search}%,ip_address::text.ilike.%${search}%`)
      }

      const { data, count, error } = await query

      if (error) {
        console.error('Audit log fetch error:', error.message)
        setEntries([])
        setTotalCount(0)
      } else {
        setEntries(data || [])
        setTotalCount(count || 0)
      }
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, riskFilter, dateFrom, dateTo, search])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setRiskFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  const handleExportCsv = () => {
    const rows = entries.map((e) => ({
      timestamp: new Date(e.created_at).toISOString(),
      action: e.action,
      actor_type: e.actor_type || '',
      actor_id: e.actor_id || '',
      ip_address: e.ip_address || '',
      risk_score: e.risk_score ?? 0,
      request_id: e.request_id || '',
      entity_type: e.entity_type || '',
      entity_id: e.entity_id || '',
    }))
    const header = 'Timestamp,Action,Actor Type,Actor ID,IP Address,Risk Score,Request ID,Entity Type,Entity ID'
    const csv = [header, ...rows.map((r) =>
      `${r.timestamp},${r.action},${r.actor_type},${r.actor_id},${r.ip_address},${r.risk_score},${r.request_id},${r.entity_type},${r.entity_id}`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Tamper-evident record of all system events
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={entries.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by action, request ID, actor, IP..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
              hasActiveFilters
                ? 'border-primary text-primary bg-primary/5'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 border border-border rounded-lg">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Action</label>
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              >
                <option value="">All actions</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Risk Level</label>
              <select
                value={riskFilter}
                onChange={(e) => { setRiskFilter(e.target.value as typeof riskFilter); setPage(0) }}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              >
                <option value="">All levels</option>
                <option value="high">High (70+)</option>
                <option value="medium">Medium (40-69)</option>
                <option value="low">Low (1-39)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {hasActiveFilters ? 'No matching events' : 'No audit events yet'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {hasActiveFilters ? 'Try adjusting your filters.' : 'Events will appear here as your platform is used.'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-2 text-primary hover:underline text-sm">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => {
                  const risk = getRiskBadge(entry.risk_score)
                  const isExpanded = expandedId === entry.id
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                        {formatTime(entry.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-foreground">
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                        {entry.entity_type && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({entry.entity_type})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {entry.actor_type && (
                          <span className="text-muted-foreground">
                            {entry.actor_type}
                            {entry.actor_id && (
                              <span className="ml-1 text-foreground">{entry.actor_id.slice(0, 8)}...</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {entry.ip_address || '—'}
                        </code>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {risk ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${risk.className}`}>
                            {risk.label === 'High' && <AlertTriangle className="w-3 h-3" />}
                            {risk.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {entry.request_id ? (
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {entry.request_id.slice(0, 16)}...
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Expanded detail (shown below table for selected row) */}
            {expandedId && (() => {
              const entry = entries.find((e) => e.id === expandedId)
              if (!entry) return null
              return (
                <div className="border-t border-border bg-muted/30 px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">Event Details</h4>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedId(null) }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Event ID</p>
                      <code className="text-xs">{entry.id}</code>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Full Request ID</p>
                      <code className="text-xs">{entry.request_id || '—'}</code>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entity</p>
                      <p>{entry.entity_type || '—'} {entry.entity_id ? `(${entry.entity_id.slice(0, 8)}...)` : ''}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Risk Score</p>
                      <p>{entry.risk_score ?? 0}/100</p>
                    </div>
                  </div>
                  {entry.request_body && Object.keys(entry.request_body).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Request Body</p>
                      <pre className="text-xs bg-background border border-border rounded-md p-3 overflow-x-auto max-h-48">
                        {JSON.stringify(entry.request_body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
              <p className="text-sm text-muted-foreground">
                {totalCount} event{totalCount === 1 ? '' : 's'} total
                {hasActiveFilters && ' (filtered)'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1.5 border border-border rounded-md disabled:opacity-50 hover:bg-accent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {Math.max(1, totalPages)}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 border border-border rounded-md disabled:opacity-50 hover:bg-accent"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
