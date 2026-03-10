'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Wallet, Clock, CheckCircle, XCircle, AlertCircle, Plus, FileText } from 'lucide-react'
import { ProcessPayoutModal } from '@/components/payouts/process-payout-modal'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface Payout {
  id: string
  reference_id: string
  amount: number
  description: string | null
  status: string
  created_at: string
  metadata: {
    creator_id?: string
    rail_used?: string
  } | null
}

interface PayoutRail {
  rail?: string
  enabled?: boolean
}

interface PayoutsClientProps {
  ledger: {
    id: string
    business_name: string
    payout_rails: PayoutRail[] | null
  }
  payouts: Payout[]
  stats: {
    total: number
    completed: number
    pending: number
    totalAmount: number
  }
}

export function PayoutsClient({ ledger, payouts, stats }: PayoutsClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState<'execute' | 'nacha' | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)

  const pendingPayouts = useMemo(
    () => payouts.filter((p) => p.status === 'pending'),
    [payouts]
  )

  const pendingIds = useMemo(
    () => new Set(pendingPayouts.map((p) => p.id)),
    [pendingPayouts]
  )

  const selectedTotal = useMemo(
    () =>
      payouts
        .filter((p) => selectedIds.has(p.id))
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [payouts, selectedIds]
  )

  const allPendingSelected =
    pendingPayouts.length > 0 &&
    pendingPayouts.every((p) => selectedIds.has(p.id))

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (allPendingSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingPayouts.map((p) => p.id)))
    }
  }, [allPendingSelected, pendingPayouts])

  const handleBatchExecute = async () => {
    if (selectedIds.size === 0) return
    setBatchLoading('execute')
    setBatchError(null)
    try {
      const res = await callLedgerFunction('execute-payout', {
        ledgerId: ledger.id,
        body: {
          action: 'batch_execute',
          payout_ids: Array.from(selectedIds),
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Batch execute failed (${res.status})`)
      }
      window.location.reload()
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Batch execute failed')
    } finally {
      setBatchLoading(null)
    }
  }

  const handleGenerateNacha = async () => {
    if (selectedIds.size === 0) return
    setBatchLoading('nacha')
    setBatchError(null)
    try {
      const res = await callLedgerFunction('execute-payout', {
        ledgerId: ledger.id,
        body: {
          action: 'generate_batch_file',
          payout_ids: Array.from(selectedIds),
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `NACHA generation failed (${res.status})`)
      }
      // If the response is a file download, trigger it
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/octet-stream') || contentType.includes('text/plain')) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `nacha-batch-${new Date().toISOString().slice(0, 10)}.ach`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } else {
        // JSON response — reload to reflect any status changes
        window.location.reload()
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'NACHA generation failed')
    } finally {
      setBatchLoading(null)
    }
  }

  const formatRailLabel = (rail: PayoutRail) => {
    const name = String(rail?.rail || '').toLowerCase()
    if (name === 'card') return 'Card'
    return name.replaceAll('_', ' ')
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />
    }
  }

  const handlePayoutSuccess = () => {
    window.location.reload()
  }

  const payoutRails = ledger.payout_rails || []

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payouts</h1>
          <p className="text-muted-foreground mt-1">
            Manage creator payouts for {ledger.business_name}
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Process Payout
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Payouts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.pending}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Amount</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(stats.totalAmount)}</p>
        </div>
      </div>

      {/* Payment Rails */}
      <div className="bg-card border border-border rounded-lg mb-8">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Payment Rails</h2>
          <Link
            href="/settings/payment-rails"
            className="text-sm text-primary hover:underline"
          >
            Configure
          </Link>
        </div>
        <div className="p-6">
          {payoutRails.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payment rails configured. Configure your card processor or manual bank transfers.
            </p>
          ) : (
            <div className="flex gap-4">
              {payoutRails.map((rail) => (
                <div
                  key={rail.rail || 'unknown'}
                  className={`px-4 py-2 rounded-lg border ${
                    rail.enabled
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-border'
                  }`}
                >
                  <span className="text-sm font-medium capitalize">
                    {formatRailLabel(rail)}
                  </span>
                  <span className={`ml-2 text-xs ${rail.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {rail.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-4 mb-4 flex items-center justify-between">
          <div className="text-sm text-foreground">
            <span className="font-semibold">{selectedIds.size}</span> payout{selectedIds.size !== 1 ? 's' : ''} selected
            <span className="mx-2 text-muted-foreground">|</span>
            Total: <span className="font-semibold">{formatCurrency(selectedTotal)}</span>
          </div>
          <div className="flex items-center gap-3">
            {batchError && (
              <span className="text-sm text-red-600 mr-2">{batchError}</span>
            )}
            <button
              onClick={handleGenerateNacha}
              disabled={batchLoading !== null}
              className="inline-flex items-center gap-2 bg-card border border-border text-foreground px-4 py-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <FileText className="w-4 h-4" />
              {batchLoading === 'nacha' ? 'Generating...' : 'Generate NACHA File'}
            </button>
            <button
              onClick={handleBatchExecute}
              disabled={batchLoading !== null}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {batchLoading === 'execute' ? 'Executing...' : 'Execute Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Payouts List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Recent Payouts</h2>
        </div>

        {!payouts || payouts.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No payouts yet</h3>
            <p className="text-muted-foreground mb-6">
              Process your first payout to pay out creator earnings.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Process Your First Payout
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  {pendingPayouts.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      title="Select all pending payouts"
                    />
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Creator
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Rail
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payouts.map((payout) => {
                const isPending = pendingIds.has(payout.id)
                const isSelected = selectedIds.has(payout.id)
                return (
                  <tr
                    key={payout.id}
                    className={`hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-4 w-10">
                      {isPending ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(payout.id)}
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        />
                      ) : (
                        <span className="block w-4" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {payout.reference_id}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {payout.metadata?.creator_id || '\u2014'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(payout.status)}
                        <span className="text-sm capitalize">{payout.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
                      {payout.metadata?.rail_used || 'pending'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-foreground">
                      {formatCurrency(payout.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(payout.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Process Payout Modal */}
      <ProcessPayoutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ledgerId={ledger.id}
        onSuccess={handlePayoutSuccess}
      />
    </div>
  )
}
