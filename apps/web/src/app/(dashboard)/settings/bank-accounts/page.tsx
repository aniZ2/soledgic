'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Landmark, Plus, RefreshCw, X, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'

interface BankAccount {
  id: string
  bank_name: string
  account_name: string
  account_type: string
  account_last_four: string | null
  is_active: boolean
  created_at: string
}

export default function BankAccountsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
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
      const res = await callLedgerFunction('manage-bank-accounts', {
        ledgerId: ledger.id,
        method: 'GET',
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setAccounts(data.bank_accounts || [])
      } else {
        setError(data.error || 'Failed to load bank accounts')
      }
    } catch {
      setError('Failed to load bank accounts')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'checking':
        return <span className="px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">Checking</span>
      case 'savings':
        return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Savings</span>
      case 'credit_card':
        return <span className="px-2 py-1 text-xs rounded bg-purple-500/10 text-purple-700 dark:text-purple-400">Credit Card</span>
      default:
        return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">{type}</span>
    }
  }

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Active</span>
    }
    return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Inactive</span>
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
              <p className="font-medium text-red-900 dark:text-red-300">Error Loading Bank Accounts</p>
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
          <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage your linked bank accounts</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      {accounts.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Landmark className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No bank accounts</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Add a bank account to get started with reconciliation and payouts</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Account Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Institution</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Last 4</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((account) => (
                <tr key={account.id} className={`hover:bg-muted/50 ${!account.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium">{account.account_name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{account.bank_name}</td>
                  <td className="px-4 py-3">{getTypeBadge(account.account_type)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {account.account_last_four ? `****${account.account_last_four}` : '-'}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(account.is_active)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(account.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && ledgerId && (
        <AddBankAccountModal
          ledgerId={ledgerId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

function AddBankAccountModal({
  ledgerId,
  onClose,
  onSuccess,
}: {
  ledgerId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountType, setAccountType] = useState<string>('checking')
  const [lastFour, setLastFour] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountName.trim() || !bankName.trim()) return

    setSubmitting(true)
    try {
      const res = await callLedgerFunction('manage-bank-accounts', {
        ledgerId,
        method: 'POST',
        body: {
          account_name: accountName.trim(),
          bank_name: bankName.trim(),
          account_type: accountType,
          ...(lastFour.trim() ? { account_last_four: lastFour.trim() } : {}),
        },
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success('Bank account added', `${accountName} has been added`)
        onSuccess()
      } else {
        toast.error('Failed to add bank account', result.error || 'Unknown error')
      }
    } catch {
      toast.error('Failed to add bank account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add Bank Account</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Account Name *</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="Business Checking"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Institution Name *</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="Chase Bank"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Account Type *</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Last 4 Digits</label>
            <input
              type="text"
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="1234"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !accountName.trim() || !bankName.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
