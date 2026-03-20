'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Users, Plus, RefreshCw, DollarSign, AlertTriangle, X, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'

interface Contractor {
  id: string
  name: string
  email: string | null
  company_name: string | null
  w9_status: string | null
  ytd_payments: number
  lifetime_payments: number
  needs_1099: boolean
  is_active: boolean
  created_at: string
  threshold_warning?: boolean
  over_threshold?: boolean
}

interface ThresholdInfo {
  current_year: number
  threshold_amount: number
  message: string
}

export default function ContractorsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [thresholdInfo, setThresholdInfo] = useState<ThresholdInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState<Contractor | null>(null)

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
      const res = await callLedgerFunction('manage-contractors', {
        ledgerId: ledger.id,
        method: 'GET',
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setContractors(data.contractors || [])
        setThresholdInfo(data.threshold_info || null)
      } else {
        setError(data.error || 'Failed to load contractors')
      }
    } catch {
      setError('Failed to load contractors')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const getW9Badge = (status: string | null) => {
    switch (status) {
      case 'received':
        return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Received</span>
      case 'requested':
        return <span className="px-2 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">Requested</span>
      case 'expired':
        return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Expired</span>
      default:
        return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Not Filed</span>
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
              <p className="font-medium text-red-900 dark:text-red-300">Error Loading Contractors</p>
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
          <h1 className="text-2xl font-bold text-foreground">Contractors</h1>
          <p className="text-muted-foreground mt-1">Manage contractors and track payments for 1099 reporting</p>
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
            Add Contractor
          </button>
        </div>
      </div>

      {/* Threshold Info */}
      {thresholdInfo && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-300">1099-NEC Threshold: ${thresholdInfo.threshold_amount}</p>
              <p className="text-blue-700 dark:text-blue-400 mt-1">{thresholdInfo.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Contractors Table */}
      {contractors.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No contractors yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Add your first contractor to start tracking payments</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">W-9 Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">YTD Payments</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Needs 1099</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contractors.map((contractor) => (
                <tr key={contractor.id} className={`hover:bg-muted/50 ${!contractor.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{contractor.name}</div>
                    {contractor.company_name && (
                      <div className="text-xs text-muted-foreground">{contractor.company_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {contractor.email || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {getW9Badge(contractor.w9_status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    <span className={contractor.threshold_warning ? 'text-yellow-600' : contractor.over_threshold ? 'text-red-600' : ''}>
                      ${contractor.ytd_payments.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {contractor.needs_1099 ? (
                      <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Yes</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setShowPaymentModal(contractor)}
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 ml-auto"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Record Payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Contractor Modal */}
      {showAddModal && ledgerId && (
        <AddContractorModal
          ledgerId={ledgerId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            loadData()
          }}
        />
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && ledgerId && (
        <RecordPaymentModal
          ledgerId={ledgerId}
          contractor={showPaymentModal}
          onClose={() => setShowPaymentModal(null)}
          onSuccess={() => {
            setShowPaymentModal(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}

function AddContractorModal({
  ledgerId,
  onClose,
  onSuccess,
}: {
  ledgerId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const res = await callLedgerFunction('manage-contractors', {
        ledgerId,
        method: 'POST',
        body: {
          name: name.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(companyName.trim() ? { company_name: companyName.trim() } : {}),
        },
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success('Contractor created', `${name} has been added`)
        onSuccess()
      } else {
        toast.error('Failed to create contractor', result.error || 'Unknown error')
      }
    } catch {
      toast.error('Failed to create contractor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add Contractor</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="Contractor name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="contractor@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="Company LLC"
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
              disabled={submitting || !name.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Creating...' : 'Add Contractor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RecordPaymentModal({
  ledgerId,
  contractor,
  onClose,
  onSuccess,
}: {
  ledgerId: string
  contractor: Contractor
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountCents = Math.round(parseFloat(amount) * 100)
    if (!amountCents || amountCents <= 0) return

    setSubmitting(true)
    try {
      const res = await callLedgerFunction('manage-contractors/payment', {
        ledgerId,
        method: 'POST',
        body: {
          contractor_id: contractor.id,
          amount: amountCents,
          payment_date: paymentDate,
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success('Payment recorded', `$${parseFloat(amount).toLocaleString()} recorded for ${contractor.name}`)
        if (result.warning) {
          toast.error('1099 Threshold Exceeded', result.warning)
        }
        onSuccess()
      } else {
        toast.error('Failed to record payment', result.error || 'Unknown error')
      }
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Record Payment</h2>
            <p className="text-sm text-muted-foreground">{contractor.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Amount (USD) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Payment Date *</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
              placeholder="Payment for services"
            />
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            Current YTD: ${contractor.ytd_payments.toLocaleString()}
            {amount && parseFloat(amount) > 0 && (
              <> &rarr; ${(contractor.ytd_payments + parseFloat(amount)).toLocaleString()}</>
            )}
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
              disabled={submitting || !amount || parseFloat(amount) <= 0}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
