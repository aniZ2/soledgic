'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Shield, RefreshCw, Unlock, DollarSign, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'

interface HeldFund {
  id: string
  participant_id: string
  participant_name: string | null
  amount: number
  currency: string
  reason: string | null
  status: string
  release_eligible_at: string | null
  created_at: string
  venture_id: string | null
}

interface HoldsSummary {
  total_held: number
  eligible_for_release: number
  count: number
}

export default function HoldsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [holds, setHolds] = useState<HeldFund[]>([])
  const [summary, setSummary] = useState<HoldsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [releasingId, setReleasingId] = useState<string | null>(null)
  const [confirmRelease, setConfirmRelease] = useState<HeldFund | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const toast = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
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

    try {
      // Load holds list
      const listRes = await callLedgerFunction('holds', {
        ledgerId: ledger.id,
        method: 'GET',
      })
      const listData = await listRes.json()
      if (listRes.ok && listData.data) {
        setHolds(listData.data)
      } else if (listRes.ok && Array.isArray(listData)) {
        setHolds(listData)
      } else {
        setHolds([])
      }

      // Load summary
      const summaryRes = await callLedgerFunction('holds/summary', {
        ledgerId: ledger.id,
        method: 'GET',
      })
      const summaryData = await summaryRes.json()
      if (summaryRes.ok && summaryData.data) {
        setSummary(summaryData.data)
      } else if (summaryRes.ok) {
        setSummary(summaryData)
      }
    } catch {
      setError('Failed to load holds data')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRelease = async () => {
    if (!ledgerId || !confirmRelease) return

    setReleasingId(confirmRelease.id)
    try {
      const res = await callLedgerFunction(`holds/${confirmRelease.id}/release`, {
        ledgerId,
        method: 'POST',
        body: { execute_transfer: true },
      })

      const result = await res.json()
      if (res.ok && (result.success !== false)) {
        toast.success('Hold released', `Successfully released funds for ${confirmRelease.participant_name || confirmRelease.participant_id}`)
        loadData()
      } else {
        toast.error('Release failed', result.error || 'Unknown error')
      }
    } catch {
      toast.error('Failed to release hold')
    } finally {
      setReleasingId(null)
      setConfirmRelease(null)
    }
  }

  const isEligibleForRelease = (hold: HeldFund) => {
    if (hold.status !== 'held') return false
    if (!hold.release_eligible_at) return true
    return new Date(hold.release_eligible_at) <= new Date()
  }

  const getStatusBadge = (hold: HeldFund) => {
    switch (hold.status) {
      case 'held':
        if (isEligibleForRelease(hold)) {
          return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Eligible</span>
        }
        return <span className="px-2 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">Held</span>
      case 'released':
        return <span className="px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">Released</span>
      case 'expired':
        return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Expired</span>
      default:
        return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">{hold.status}</span>
    }
  }

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

  if (error) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-red-900 dark:text-red-300">Error Loading Holds</p>
              <p className="text-red-700 dark:text-red-400 mt-1">{error}</p>
              <button
                onClick={loadData}
                className="mt-2 text-red-700 dark:text-red-400 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Held Funds</h1>
          <p className="text-muted-foreground mt-1">Manage funds held in escrow before release</p>
        </div>

        <button
          onClick={loadData}
          className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Total Held</div>
            </div>
            <div className="text-2xl font-bold">${Number(summary.total_held).toLocaleString()}</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Unlock className="w-4 h-4 text-green-600" />
              <div className="text-sm text-muted-foreground">Eligible for Release</div>
            </div>
            <div className="text-2xl font-bold text-green-600">${Number(summary.eligible_for_release).toLocaleString()}</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Active Holds</div>
            </div>
            <div className="text-2xl font-bold">{summary.count}</div>
          </div>
        </div>
      )}

      {/* Holds Table */}
      {holds.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No held funds</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Funds placed on hold will appear here</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Creator</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Release Eligible</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {holds.map((hold) => (
                <tr key={hold.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{hold.participant_name || 'Unknown'}</div>
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{hold.participant_id}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    ${Number(hold.amount).toLocaleString()} {hold.currency || 'USD'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {hold.reason || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {hold.release_eligible_at ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(hold.release_eligible_at).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-green-600">Now</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(hold)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {hold.status === 'held' && isEligibleForRelease(hold) && (
                      <button
                        onClick={() => setConfirmRelease(hold)}
                        disabled={releasingId === hold.id}
                        className="text-sm text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:text-muted-foreground flex items-center gap-1 ml-auto"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        {releasingId === hold.id ? 'Releasing...' : 'Release'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmRelease}
        onClose={() => setConfirmRelease(null)}
        onConfirm={handleRelease}
        title="Release Held Funds"
        message={confirmRelease ? `Release $${Number(confirmRelease.amount).toLocaleString()} held for ${confirmRelease.participant_name || confirmRelease.participant_id}? This will transfer the funds to the creator's balance.` : ''}
        confirmLabel="Release Funds"
      />
    </div>
  )
}
