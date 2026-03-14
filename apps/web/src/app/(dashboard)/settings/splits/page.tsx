'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Percent, RefreshCw, X, TrendingUp, Trash2 } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'

interface Tier {
  id: string
  name: string
  creator_percent: number
  min_earnings: number
  tier_order: number
}

interface CreatorSplit {
  creator_id: string
  creator_percent: number
  platform_percent: number
  source: 'custom' | 'tier' | 'default'
  tier_name?: string
}

export default function SplitsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [promoting, setPromoting] = useState(false)
  const toast = useToast()

  // Creator override lookup
  const [lookupCreatorId, setLookupCreatorId] = useState('')
  const [lookupResult, setLookupResult] = useState<CreatorSplit | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

  // Set override
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideCreatorId, setOverrideCreatorId] = useState('')
  const [overridePercent, setOverridePercent] = useState('')
  const [settingOverride, setSettingOverride] = useState(false)

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
      const res = await callLedgerFunction('manage-splits', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'list_tiers' },
      })

      const result = await res.json()
      if (result.success) {
        setTiers(result.data || [])
      } else {
        setError(result.error || 'Failed to load tiers')
      }
    } catch {
      setError('Failed to load tiers')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleLookup = async () => {
    if (!ledgerId || !lookupCreatorId.trim()) return
    setLookingUp(true)
    setLookupResult(null)

    try {
      const res = await callLedgerFunction('manage-splits', {
        ledgerId,
        method: 'POST',
        body: { action: 'get_effective_split', creator_id: lookupCreatorId.trim() },
      })

      const result = await res.json()
      if (result.success) {
        setLookupResult(result.data)
      } else {
        toast.error('Lookup failed', result.error)
      }
    } catch {
      toast.error('Failed to look up creator split')
    } finally {
      setLookingUp(false)
    }
  }

  const handleSetOverride = async () => {
    if (!ledgerId) return
    const percent = parseFloat(overridePercent)
    if (!overrideCreatorId.trim() || isNaN(percent) || percent < 0 || percent > 100) {
      toast.error('Please provide a valid creator ID and percentage (0-100)')
      return
    }

    setSettingOverride(true)
    try {
      const res = await callLedgerFunction('manage-splits', {
        ledgerId,
        method: 'POST',
        body: {
          action: 'set_creator_split',
          creator_id: overrideCreatorId.trim(),
          creator_percent: percent,
        },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Override set', `Creator ${overrideCreatorId.trim()} now receives ${percent}%.`)
        setShowOverrideModal(false)
        setOverrideCreatorId('')
        setOverridePercent('')
        // Refresh lookup if the same creator is displayed
        if (lookupCreatorId.trim() === overrideCreatorId.trim()) {
          handleLookup()
        }
      } else {
        toast.error('Failed to set override', result.error)
      }
    } catch {
      toast.error('Failed to set override')
    } finally {
      setSettingOverride(false)
    }
  }

  const handleClearOverride = async (creatorId: string) => {
    if (!ledgerId) return

    try {
      const res = await callLedgerFunction('manage-splits', {
        ledgerId,
        method: 'POST',
        body: { action: 'clear_creator_split', creator_id: creatorId },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Override cleared', `Custom split for ${creatorId} has been removed.`)
        if (lookupCreatorId.trim() === creatorId) {
          handleLookup()
        }
      } else {
        toast.error('Failed to clear override', result.error)
      }
    } catch {
      toast.error('Failed to clear override')
    }
  }

  const handleAutoPromote = async () => {
    if (!ledgerId) return
    setPromoting(true)

    try {
      const res = await callLedgerFunction('manage-splits', {
        ledgerId,
        method: 'POST',
        body: { action: 'auto_promote_creators' },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Auto-promote complete', result.message)
      } else {
        toast.error('Auto-promote failed', result.error)
      }
    } catch {
      toast.error('Failed to run auto-promote')
    } finally {
      setPromoting(false)
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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue Splits</h1>
          <p className="text-muted-foreground mt-1">Configure tier-based and per-creator revenue sharing</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleAutoPromote}
            disabled={promoting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            <TrendingUp className={`w-4 h-4 ${promoting ? 'animate-pulse' : ''}`} />
            {promoting ? 'Promoting...' : 'Auto-Promote'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Tiers Table */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-3">Tier Configuration</h2>
        {tiers.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <Percent className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No tiers configured</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Tiers are configured via the API. The default split applies to all creators.</p>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tier Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Min Earnings</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Creator %</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Platform %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tiers.map((tier) => (
                  <tr key={tier.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{tier.tier_order}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{tier.name}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">${Number(tier.min_earnings || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-green-600">{tier.creator_percent}%</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{100 - tier.creator_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creator Split Lookup */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-3">Creator Split Lookup</h2>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={lookupCreatorId}
              onChange={(e) => setLookupCreatorId(e.target.value)}
              placeholder="Enter creator ID"
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            />
            <button
              onClick={handleLookup}
              disabled={lookingUp || !lookupCreatorId.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {lookingUp && <RefreshCw className="w-4 h-4 animate-spin" />}
              Look Up
            </button>
          </div>

          {lookupResult && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Creator</div>
                  <div className="text-sm font-medium"><code className="bg-muted px-2 py-1 rounded">{lookupResult.creator_id}</code></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Creator %</div>
                  <div className="text-sm font-medium text-green-600">{lookupResult.creator_percent}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Platform %</div>
                  <div className="text-sm font-medium">{lookupResult.platform_percent}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase mb-1">Source</div>
                  <div className="text-sm">
                    {lookupResult.source === 'custom' && (
                      <span className="px-2 py-1 text-xs rounded bg-purple-500/10 text-purple-700 dark:text-purple-400">Custom Override</span>
                    )}
                    {lookupResult.source === 'tier' && (
                      <span className="px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">Tier: {lookupResult.tier_name}</span>
                    )}
                    {lookupResult.source === 'default' && (
                      <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Default</span>
                    )}
                  </div>
                </div>
              </div>

              {lookupResult.source === 'custom' && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => handleClearOverride(lookupResult.creator_id)}
                    className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Override
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Per-Creator Overrides */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Per-Creator Overrides</h2>
          <button
            onClick={() => setShowOverrideModal(true)}
            className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 text-sm flex items-center gap-2"
          >
            <Percent className="w-4 h-4" />
            Set Override
          </button>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Use the lookup above to check a creator&apos;s effective split, or set a custom override using the button above.
            Custom overrides take priority over tier-based splits.
          </p>
        </div>
      </div>

      {/* Set Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Set Creator Override</h2>
              <button onClick={() => { setShowOverrideModal(false); setOverrideCreatorId(''); setOverridePercent('') }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Creator ID *</label>
                <input
                  type="text"
                  value={overrideCreatorId}
                  onChange={(e) => setOverrideCreatorId(e.target.value)}
                  placeholder="e.g. creator_abc123"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Creator Percentage *</label>
                <input
                  type="number"
                  value={overridePercent}
                  onChange={(e) => setOverridePercent(e.target.value)}
                  placeholder="80"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">Platform receives the remainder (100 - creator %).</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowOverrideModal(false); setOverrideCreatorId(''); setOverridePercent('') }}
                className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSetOverride}
                disabled={settingOverride}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {settingOverride && <RefreshCw className="w-4 h-4 animate-spin" />}
                {settingOverride ? 'Saving...' : 'Set Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
