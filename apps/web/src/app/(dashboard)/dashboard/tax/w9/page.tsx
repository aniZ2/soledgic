'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react'

export default function W9StatusPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    withTaxInfo: 0,
    certified: 0,
    missing: 0,
  })

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
    if (!ledger) {
      setLoading(false)
      return
    }

    // Counts only — no PII
    const { count: totalCreators } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('is_active', true)

    const { count: withTaxInfo } = await supabase
      .from('tax_info_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('status', 'active')

    const { count: certified } = await supabase
      .from('tax_info_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('status', 'active')
      .not('certified_at', 'is', null)

    const total = totalCreators ?? 0
    const collected = withTaxInfo ?? 0

    setStats({
      total,
      withTaxInfo: collected,
      certified: certified ?? 0,
      missing: total - collected,
    })

    setLoading(false)
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [loadData])

  const collectionRate = stats.total > 0
    ? Math.round((stats.withTaxInfo / stats.total) * 100)
    : 100

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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">W-9 Status</h1>
          <p className="text-muted-foreground mt-1">Tax information collection status for your creators</p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Collection Rate */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Collection Rate</h2>
          <span className={`text-3xl font-bold ${
            collectionRate === 100 ? 'text-green-600' : collectionRate >= 50 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {collectionRate}%
          </span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              collectionRate === 100 ? 'bg-green-500' : collectionRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${collectionRate}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          {stats.withTaxInfo} of {stats.total} creator{stats.total !== 1 ? 's' : ''} have submitted tax information
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Total Creators</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-muted-foreground">On File</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.withTaxInfo}</div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">Certified</span>
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.certified}</div>
        </div>
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-muted-foreground">Missing</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.missing}</div>
        </div>
      </div>

      {/* Backup Withholding Notice */}
      {stats.missing > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-900 dark:text-yellow-300">Backup Withholding Active</p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                {stats.missing} creator{stats.missing !== 1 ? 's' : ''} have not submitted tax information.
                IRS backup withholding (24%) is automatically applied to their payouts until a W-9 is on file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-muted/50 rounded-lg p-6">
        <h3 className="font-medium text-foreground mb-3">How Tax Collection Works</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>Creators submit their tax information (W-9) through the creator portal.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>Only the last 4 digits of their TIN are stored. Full tax IDs are never retained by Soledgic.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>Creators without tax info on file are subject to 24% IRS backup withholding on payouts.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>Soledgic handles 1099-NEC filing as Merchant of Record — you don&apos;t need to file for creators.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
