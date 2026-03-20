'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { useToast } from '@/components/notifications/toast-provider'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'
import { ShieldAlert, Plus, Trash2, Loader2 } from 'lucide-react'

type PolicyType = 'require_instrument' | 'budget_cap' | 'projection_guard'
type Severity = 'hard' | 'soft'

interface FraudPolicy {
  id: string
  type: PolicyType
  severity: Severity
  priority: number
  is_active: boolean
  config: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  require_instrument: 'Require Instrument',
  budget_cap: 'Budget Cap',
  projection_guard: 'Projection Guard',
}

const POLICY_TYPE_DESCRIPTIONS: Record<PolicyType, string> = {
  require_instrument: 'Require an authorizing instrument for transactions above a threshold',
  budget_cap: 'Enforce spending caps over a configurable period',
  projection_guard: 'Alert when projected cash coverage drops below a ratio',
}

function getSeverityBadge(severity: Severity) {
  switch (severity) {
    case 'hard':
      return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Block</span>
    case 'soft':
      return <span className="px-2 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">Flag</span>
  }
}

function formatConfig(policy: FraudPolicy): string {
  const config = policy.config
  switch (policy.type) {
    case 'require_instrument': {
      const threshold = Number(config.threshold_amount || 100000)
      return `Threshold: $${(threshold / 100).toLocaleString()}`
    }
    case 'budget_cap': {
      const cap = Number(config.cap_amount || 0)
      const period = String(config.period || 'monthly')
      const category = config.category ? ` (${String(config.category)})` : ''
      return `${period.charAt(0).toUpperCase() + period.slice(1)} cap: $${(cap / 100).toLocaleString()}${category}`
    }
    case 'projection_guard': {
      const ratio = Number(config.min_coverage_ratio || 0.5)
      return `Min coverage: ${Math.round(ratio * 100)}%`
    }
    default:
      return JSON.stringify(config)
  }
}

export default function FraudPoliciesPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [policies, setPolicies] = useState<FraudPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingPolicy, setDeletingPolicy] = useState<FraudPolicy | null>(null)
  const toast = useToast()

  // Create form state
  const [formPolicyType, setFormPolicyType] = useState<PolicyType>('require_instrument')
  const [formSeverity, setFormSeverity] = useState<Severity>('hard')
  const [formPriority, setFormPriority] = useState('100')
  // require_instrument config
  const [formThresholdAmount, setFormThresholdAmount] = useState('100000')
  // budget_cap config
  const [formCapAmount, setFormCapAmount] = useState('')
  const [formPeriod, setFormPeriod] = useState('monthly')
  const [formCategory, setFormCategory] = useState('')
  // projection_guard config
  const [formMinCoverageRatio, setFormMinCoverageRatio] = useState('0.5')
  const [creating, setCreating] = useState(false)

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

    try {
      const res = await callLedgerFunction('fraud/policies', {
        ledgerId: ledger.id,
        method: 'GET',
      })

      const result = await res.json()
      if (result.success) {
        setPolicies(result.policies || [])
      } else {
        toast.error('Failed to load policies', result.error)
      }
    } catch {
      toast.error('Failed to load fraud policies')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleCreate = async () => {
    if (!ledgerId) return
    setCreating(true)

    const config: Record<string, unknown> = {}

    switch (formPolicyType) {
      case 'require_instrument':
        if (formThresholdAmount) config.threshold_amount = parseInt(formThresholdAmount, 10)
        break
      case 'budget_cap':
        if (formCapAmount) config.cap_amount = parseInt(formCapAmount, 10)
        if (formPeriod) config.period = formPeriod
        if (formCategory) config.category = formCategory
        break
      case 'projection_guard':
        if (formMinCoverageRatio) config.min_coverage_ratio = parseFloat(formMinCoverageRatio)
        break
    }

    try {
      const res = await callLedgerFunction('fraud/policies', {
        ledgerId,
        method: 'POST',
        body: {
          policy_type: formPolicyType,
          config,
          severity: formSeverity,
          priority: parseInt(formPriority, 10),
        },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Policy created', `${POLICY_TYPE_LABELS[formPolicyType]} policy added`)
        setShowCreateModal(false)
        resetForm()
        loadData()
      } else {
        toast.error('Failed to create policy', result.error)
      }
    } catch {
      toast.error('Failed to create policy')
    } finally {
      setCreating(false)
    }
  }

  const confirmDelete = async () => {
    if (!ledgerId || !deletingPolicy) return

    try {
      const res = await callLedgerFunction(`fraud/policies/${deletingPolicy.id}`, {
        ledgerId,
        method: 'DELETE',
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Policy deleted')
        loadData()
      } else {
        toast.error('Failed to delete policy', result.error)
      }
    } catch {
      toast.error('Failed to delete policy')
    }
    setDeletingPolicy(null)
  }

  const resetForm = () => {
    setFormPolicyType('require_instrument')
    setFormSeverity('hard')
    setFormPriority('100')
    setFormThresholdAmount('100000')
    setFormCapAmount('')
    setFormPeriod('monthly')
    setFormCategory('')
    setFormMinCoverageRatio('0.5')
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
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Fraud Policies</h1>
          <p className="text-muted-foreground mt-1">
            Configure fraud detection rules that evaluate transactions before they execute
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Policy
        </button>
      </div>

      {/* Policies List */}
      {policies.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No fraud policies configured</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Create a policy to evaluate transactions against custom rules
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Policy Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Configuration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.map((policy) => (
                <tr key={policy.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {POLICY_TYPE_LABELS[policy.type] || policy.type}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {POLICY_TYPE_DESCRIPTIONS[policy.type]}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatConfig(policy)}
                  </td>
                  <td className="px-4 py-3">
                    {getSeverityBadge(policy.severity)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {policy.priority}
                  </td>
                  <td className="px-4 py-3">
                    {policy.is_active ? (
                      <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeletingPolicy(policy)}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Policy Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Create Fraud Policy</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Define a rule to evaluate against incoming transactions
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Policy Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Policy Type</label>
                <select
                  value={formPolicyType}
                  onChange={(e) => setFormPolicyType(e.target.value as PolicyType)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="require_instrument">Require Instrument</option>
                  <option value="budget_cap">Budget Cap</option>
                  <option value="projection_guard">Projection Guard</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {POLICY_TYPE_DESCRIPTIONS[formPolicyType]}
                </p>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Action on Match</label>
                <select
                  value={formSeverity}
                  onChange={(e) => setFormSeverity(e.target.value as Severity)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="hard">Block (hard) - prevent transaction</option>
                  <option value="soft">Flag (soft) - allow with warning</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Priority</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">Lower numbers evaluate first</p>
              </div>

              {/* Policy-specific config */}
              {formPolicyType === 'require_instrument' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Threshold Amount (cents)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formThresholdAmount}
                    onChange={(e) => setFormThresholdAmount(e.target.value)}
                    placeholder="100000"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Transactions above this amount require an authorizing instrument (100000 = $1,000)
                  </p>
                </div>
              )}

              {formPolicyType === 'budget_cap' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Cap Amount (cents)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formCapAmount}
                      onChange={(e) => setFormCapAmount(e.target.value)}
                      placeholder="5000000"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum spending for the period (5000000 = $50,000)
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Period</label>
                      <select
                        value={formPeriod}
                        onChange={(e) => setFormPeriod(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Category <span className="text-muted-foreground">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        placeholder="e.g. marketing"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                      />
                    </div>
                  </div>
                </>
              )}

              {formPolicyType === 'projection_guard' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Minimum Coverage Ratio
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formMinCoverageRatio}
                    onChange={(e) => setFormMinCoverageRatio(e.target.value)}
                    placeholder="0.5"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Trigger when cash-to-obligations ratio drops below this (0.5 = 50%)
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {creating ? 'Creating...' : 'Create Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingPolicy}
        onClose={() => setDeletingPolicy(null)}
        onConfirm={confirmDelete}
        title="Delete Policy"
        message={`Delete this ${deletingPolicy ? POLICY_TYPE_LABELS[deletingPolicy.type] : ''} policy? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
