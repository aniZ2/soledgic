'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { 
  CheckCircle, AlertTriangle, XCircle, RefreshCw, 
  Activity, ChevronDown, ChevronUp
} from 'lucide-react'

interface HealthCheck {
  name: string
  description: string
  status: 'passed' | 'warning' | 'failed' | 'skipped'
  details: Record<string, unknown>
}

interface HealthResult {
  result_id: string
  status: 'healthy' | 'warning' | 'critical'
  summary: {
    total: number
    passed: number
    warnings: number
    failed: number
  }
  checks: HealthCheck[]
}

export default function HealthCheckWidget() {
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<HealthResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)

  async function loadHealthStatus() {
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
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .limit(1)

    const nextLedgerId = ledgers?.[0]?.id
    if (!nextLedgerId) return
    setLedgerId(nextLedgerId)

    // Get latest health status
    try {
      const res = await callLedgerFunction('health-check', {
        ledgerId: nextLedgerId,
        method: 'POST',
        body: { action: 'status' },
      })
      const data = await res.json()
      if (data.success && data.data?.status !== 'unknown') {
        // Load full result if we have one
        const histRes = await callLedgerFunction('health-check', {
          ledgerId: nextLedgerId,
          method: 'POST',
          body: { action: 'history' },
        })
        const histData = await histRes.json()
        if (histData.data?.[0]) {
          // Get the full check details from the most recent
          const { data: fullResult } = await supabase
            .from('health_check_results')
            .select('*')
            .eq('id', histData.data[0].id)
            .single()
          
          if (fullResult) {
            setResult({
              result_id: fullResult.id,
              status: fullResult.status,
              summary: {
                total: fullResult.total_checks,
                passed: fullResult.passed_checks,
                warnings: fullResult.warning_checks,
                failed: fullResult.failed_checks,
              },
              checks: fullResult.checks,
            })
          }
        }
      }
    } catch (e) {
      console.error('Failed to load health status:', e)
    }

    setLoading(false)
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadHealthStatus()
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [])

  const runHealthCheck = async () => {
    if (!ledgerId) return
    setRunning(true)

    try {
      const res = await callLedgerFunction('health-check', {
        ledgerId,
        method: 'POST',
        body: { action: 'run' },
      })
      const data = await res.json()
      if (data.success) {
        setResult(data.data)
      }
    } catch (e) {
      console.error('Failed to run health check:', e)
    }

    setRunning(false)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'critical':
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Activity className="w-5 h-5 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'passed':
        return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
      case 'critical':
      case 'failed':
        return 'bg-red-500/10 text-red-600 border-red-500/20'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-muted rounded-lg"></div>
          <div className="flex-1">
            <div className="h-4 bg-muted rounded w-24 mb-2"></div>
            <div className="h-3 bg-muted rounded w-32"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${result ? getStatusColor(result.status) : 'bg-muted'}`}>
            {result ? getStatusIcon(result.status) : <Activity className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Ledger Health</h3>
            <p className="text-sm text-muted-foreground">
              {result ? (
                <>
                  {result.summary.passed}/{result.summary.total} checks passed
                </>
              ) : (
                'No health check run yet'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 hover:bg-muted rounded-md"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
          <button
            onClick={runHealthCheck}
            disabled={running}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running...' : 'Run Check'}
          </button>
        </div>
      </div>

      {/* Status Summary */}
      {result && (
        <div className="px-6 py-3 border-t border-border bg-muted/30 flex gap-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm">{result.summary.passed} passed</span>
          </div>
          {result.summary.warnings > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-sm">{result.summary.warnings} warnings</span>
            </div>
          )}
          {result.summary.failed > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm">{result.summary.failed} failed</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded Details */}
      {expanded && result?.checks && (
        <div className="border-t border-border divide-y divide-border">
          {result.checks.map((check, i) => (
            <div key={i} className="px-6 py-3 flex items-start gap-3">
              {getStatusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">{check.description}</p>
                <code className="text-xs text-muted-foreground">{check.name}</code>
                {check.status !== 'passed' && check.details && (
                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(check.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
