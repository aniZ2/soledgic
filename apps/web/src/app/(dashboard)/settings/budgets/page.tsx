'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Wallet, Plus, RefreshCw, X } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'

interface Budget {
  id: string
  name: string
  category: string
  category_code: string | null
  budget_period: string
  budget_amount: number
  spent: number
  remaining: number
  percent_used: number
  status: 'under' | 'warning' | 'over'
  alert_threshold: number
  period_start: string
  is_active: boolean
}

interface BudgetSummary {
  total_budgeted: number
  total_spent: number
  total_remaining: number
  over_budget_count: number
  warning_count: number
}

export default function BudgetsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [summary, setSummary] = useState<BudgetSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  // Create form state
  const [formName, setFormName] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formPeriod, setFormPeriod] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [formCategory, setFormCategory] = useState('')

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
      const res = await callLedgerFunction('manage-budgets', {
        ledgerId: ledger.id,
        method: 'GET',
      })

      const result = await res.json()
      if (result.success) {
        setBudgets(result.budgets || [])
        setSummary(result.summary || null)
      } else {
        setError(result.error || 'Failed to load budgets')
      }
    } catch {
      setError('Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleCreate = async () => {
    if (!ledgerId) return
    const amount = parseFloat(formAmount)
    if (!formName.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Please fill in all required fields')
      return
    }

    setCreating(true)
    try {
      const res = await callLedgerFunction('manage-budgets', {
        ledgerId,
        method: 'POST',
        body: {
          name: formName.trim(),
          budget_amount: Math.round(amount * 100),
          budget_period: formPeriod,
          ...(formCategory.trim() ? { category_code: formCategory.trim() } : {}),
        },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Budget created', `"${result.budget.name}" has been created.`)
        setShowCreateModal(false)
        resetForm()
        loadData()
      } else {
        toast.error('Failed to create budget', result.error)
      }
    } catch {
      toast.error('Failed to create budget')
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormAmount('')
    setFormPeriod('monthly')
    setFormCategory('')
  }

  const getStatusBadge = (status: 'under' | 'warning' | 'over') => {
    switch (status) {
      case 'under':
        return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">On Track</span>
      case 'warning':
        return <span className="px-2 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">Warning</span>
      case 'over':
        return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Over Budget</span>
    }
  }

  const getProgressBarColor = (status: 'under' | 'warning' | 'over') => {
    switch (status) {
      case 'under': return 'bg-green-500'
      case 'warning': return 'bg-yellow-500'
      case 'over': return 'bg-red-500'
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
          <h1 className="text-2xl font-bold text-foreground">Budgets</h1>
          <p className="text-muted-foreground mt-1">Track spending against budget envelopes</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Budget
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">${summary.total_budgeted.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Budgeted</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">${summary.total_spent.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Spent</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">${summary.total_remaining.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Remaining</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold text-red-600">{summary.over_budget_count}</div>
            <div className="text-sm text-muted-foreground">Over Budget</div>
          </div>
        </div>
      )}

      {/* Budgets List */}
      {budgets.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Wallet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No budgets configured</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Create a budget to start tracking spending against limits</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Limit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Spent / Remaining</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {budgets.map((budget) => (
                <tr key={budget.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{budget.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{budget.category}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">${budget.budget_amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>${budget.spent.toLocaleString()} spent</span>
                        <span>${budget.remaining.toLocaleString()} left</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getProgressBarColor(budget.status)}`}
                          style={{ width: `${Math.min(budget.percent_used, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground text-right">{budget.percent_used}%</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{budget.budget_period}</td>
                  <td className="px-4 py-3">{getStatusBadge(budget.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Budget Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Create Budget</h2>
              <button onClick={() => { setShowCreateModal(false); resetForm() }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Marketing Budget"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Amount Limit *</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="1000.00"
                  min="0.01"
                  step="0.01"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Period *</label>
                <select
                  value={formPeriod}
                  onChange={(e) => setFormPeriod(e.target.value as 'monthly' | 'quarterly' | 'annual')}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category Code</label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="Optional — leave blank for all expenses"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); resetForm() }}
                className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {creating && <RefreshCw className="w-4 h-4 animate-spin" />}
                {creating ? 'Creating...' : 'Create Budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
