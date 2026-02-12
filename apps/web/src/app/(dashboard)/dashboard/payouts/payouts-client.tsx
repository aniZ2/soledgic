'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wallet, Clock, CheckCircle, XCircle, AlertCircle, Plus } from 'lucide-react'
import { ProcessPayoutModal } from '@/components/payouts/process-payout-modal'

interface Payout {
  id: string
  reference_id: string
  amount: number
  description: string | null
  status: string
  created_at: string
  metadata: any
}

interface PayoutsClientProps {
  ledger: {
    id: string
    business_name: string
    payout_rails: any[] | null
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
  const [refreshKey, setRefreshKey] = useState(0)

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
        return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const handlePayoutSuccess = () => {
    // Trigger a page refresh to show the new payout
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
              No payment rails configured. Configure Finix or manual bank transfers.
            </p>
          ) : (
            <div className="flex gap-4">
              {payoutRails.map((rail: any) => (
                <div
                  key={rail.rail}
                  className={`px-4 py-2 rounded-lg border ${
                    rail.enabled
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-border'
                  }`}
                >
                  <span className="text-sm font-medium capitalize">
                    {rail.rail.replace('_', ' ')}
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
              {payouts.map((payout) => (
                <tr key={payout.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {payout.reference_id}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {payout.metadata?.creator_id || '—'}
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
              ))}
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
