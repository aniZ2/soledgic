'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Repeat, Plus, RefreshCw, X, Calendar } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'

interface RecurringExpense {
  id: string
  name: string
  merchant_name: string
  amount: number
  annual_cost: number
  recurrence_interval: string
  recurrence_day: number | null
  start_date: string
  end_date: string | null
  next_due_date: string
  is_active: boolean
  total_occurrences: number
  total_amount_spent: number
  business_purpose: string
  category: string | null
}

interface RecurringSummary {
  count: number
  active_count: number
  total_monthly: number
  total_annual: number
}

export default function RecurringPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [expenses, setExpenses] = useState<RecurringExpense[]>([])
  const [summary, setSummary] = useState<RecurringSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  // Create form state
  const [formName, setFormName] = useState('')
  const [formMerchant, setFormMerchant] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formFrequency, setFormFrequency] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')
  const [formCategory, setFormCategory] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formPurpose, setFormPurpose] = useState('')

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
      const res = await callLedgerFunction('manage-recurring', {
        ledgerId: ledger.id,
        method: 'GET',
      })

      const result = await res.json()
      if (result.success) {
        setExpenses(result.recurring_expenses || [])
        setSummary(result.summary || null)
      } else {
        setError(result.error || 'Failed to load recurring expenses')
      }
    } catch {
      setError('Failed to load recurring expenses')
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
    if (!formName.trim() || !formMerchant.trim() || isNaN(amount) || amount <= 0 || !formStartDate || !formPurpose.trim() || !formCategory.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    setCreating(true)
    try {
      const res = await callLedgerFunction('manage-recurring', {
        ledgerId,
        method: 'POST',
        body: {
          name: formName.trim(),
          merchant_name: formMerchant.trim(),
          amount: Math.round(amount * 100),
          recurrence_interval: formFrequency,
          category_code: formCategory.trim(),
          start_date: formStartDate,
          business_purpose: formPurpose.trim(),
        },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Recurring expense created', `"${result.recurring_expense.name}" has been created.`)
        setShowCreateModal(false)
        resetForm()
        loadData()
      } else {
        toast.error('Failed to create recurring expense', result.error)
      }
    } catch {
      toast.error('Failed to create recurring expense')
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormMerchant('')
    setFormAmount('')
    setFormFrequency('monthly')
    setFormCategory('')
    setFormStartDate('')
    setFormPurpose('')
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
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
          <h1 className="text-2xl font-bold text-foreground">Recurring Expenses</h1>
          <p className="text-muted-foreground mt-1">Manage recurring expense templates and schedules</p>
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
            Create Recurring
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
            <div className="text-2xl font-bold">{summary.count}</div>
            <div className="text-sm text-muted-foreground">Total Templates</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold text-green-600">{summary.active_count}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">${summary.total_monthly.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Monthly Cost</div>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border">
            <div className="text-2xl font-bold">${summary.total_annual.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Annual Cost</div>
          </div>
        </div>
      )}

      {/* Recurring Expenses List */}
      {expenses.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Repeat className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No recurring expenses</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Create a recurring template to track regular expenses</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Frequency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Next Due</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((expense) => (
                <tr key={expense.id} className={`hover:bg-muted/50 ${!expense.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{expense.name}</div>
                    <div className="text-xs text-muted-foreground">{expense.merchant_name}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">${expense.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{expense.recurrence_interval}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(expense.next_due_date)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{expense.category || '-'}</td>
                  <td className="px-4 py-3">
                    {expense.is_active ? (
                      <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Recurring Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Create Recurring Expense</h2>
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
                  placeholder="e.g. Hosting Fee"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Merchant *</label>
                <input
                  type="text"
                  value={formMerchant}
                  onChange={(e) => setFormMerchant(e.target.value)}
                  placeholder="e.g. AWS"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Amount *</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="99.99"
                  min="0.01"
                  step="0.01"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Frequency *</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as 'weekly' | 'monthly' | 'quarterly')}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category Code *</label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g. software"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Start Date *</label>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Business Purpose *</label>
                <input
                  type="text"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                  placeholder="e.g. Cloud infrastructure hosting"
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
                {creating ? 'Creating...' : 'Create Recurring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
