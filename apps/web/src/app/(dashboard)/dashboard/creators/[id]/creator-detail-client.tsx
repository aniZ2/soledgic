'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, DollarSign, TrendingUp, FileText, Wallet, Clock } from 'lucide-react'
import { ProcessPayoutModal } from '@/components/payouts/process-payout-modal'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface Creator {
  id: string
  entity_id: string
  name: string
  balance: number
  metadata?: {
    email?: string
  }
}

interface Transaction {
  id: string
  transaction_type: string
  reference_id: string
  description: string | null
  status: string
  created_at: string
  amount: number
  entry_type: string
}

interface HeldFund {
  entry_id: string
  hold_reason: string | null
  held_amount: number
  release_eligible_at: string | null
  release_status: 'held' | 'pending_release'
}

interface CreatorDetailClientProps {
  ledger: {
    id: string
  }
  creatorAccount: {
    id: string
    entity_id: string
    name: string
    created_at: string
    metadata: Record<string, unknown> | null
  }
  stats: {
    totalEarnings: number
    totalPayouts: number
    totalWithheld: number
    currentBalance: number
    availableBalance: number
  }
  transactions: Transaction[]
  heldFunds: HeldFund[]
  hasTaxInfo: boolean
}

export function CreatorDetailClient({
  ledger,
  creatorAccount,
  stats,
  transactions,
  heldFunds,
  hasTaxInfo,
}: CreatorDetailClientProps) {
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false)
  const [releasingEntryId, setReleasingEntryId] = useState<string | null>(null)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const handlePayoutSuccess = () => {
    window.location.reload()
  }

  const handleReleaseFunds = async (entryId: string) => {
    setReleaseError(null)
    setReleasingEntryId(entryId)

    try {
      const response = await callLedgerFunction('release-funds', {
        ledgerId: ledger.id,
        body: {
          action: 'release',
          entry_id: entryId,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to release held funds')
      }

      window.location.reload()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to release held funds'
      setReleaseError(message)
    } finally {
      setReleasingEntryId(null)
    }
  }

  // Create creator object for the modal
  const metadataEmail =
    creatorAccount.metadata && typeof creatorAccount.metadata.email === 'string'
      ? creatorAccount.metadata.email
      : undefined

  const creatorForModal: Creator = {
    id: creatorAccount.id,
    entity_id: creatorAccount.entity_id,
    name: creatorAccount.name,
    balance: Math.round(stats.availableBalance * 100), // Convert to cents
    metadata: metadataEmail ? { email: metadataEmail } : undefined,
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/creators"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Creators
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">
                {creatorAccount.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{creatorAccount.name}</h1>
              <p className="text-muted-foreground">
                <code className="text-sm bg-muted px-2 py-0.5 rounded">{creatorAccount.entity_id}</code>
                <span className="mx-2">•</span>
                Since {formatDate(creatorAccount.created_at)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsPayoutModalOpen(true)}
              disabled={stats.availableBalance <= 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wallet className="w-4 h-4" />
              Process Payout
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Total Earnings</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalEarnings)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-muted-foreground">Total Paid Out</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalPayouts)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            <span className="text-sm text-muted-foreground">Held Amount</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalWithheld)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-muted-foreground">Available</span>
          </div>
          <p className={`text-2xl font-bold ${stats.availableBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(stats.availableBalance)}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-muted-foreground">Tax Info</span>
          </div>
          <p className={`text-lg font-medium ${hasTaxInfo ? 'text-green-600' : 'text-yellow-600'}`}>
            {hasTaxInfo ? 'On File' : 'Missing'}
          </p>
        </div>
      </div>

      {/* Held Funds */}
      {heldFunds.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            Held Funds
          </h2>
          {releaseError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
              {releaseError}
            </div>
          )}
          <div className="space-y-3">
            {heldFunds.map((hold) => (
              <div key={hold.entry_id} className="flex justify-between items-center bg-background/50 rounded p-3 gap-3">
                <div>
                  <p className="font-medium text-foreground">
                    {hold.hold_reason || 'Escrow hold'}
                    {hold.release_status === 'pending_release' && (
                      <span className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-600">
                        Pending release
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hold.release_eligible_at
                      ? `Eligible for release: ${formatDate(hold.release_eligible_at)}`
                      : 'Manual release required'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-mono font-semibold text-foreground">{formatCurrency(hold.held_amount)}</p>
                  <button
                    onClick={() => handleReleaseFunds(hold.entry_id)}
                    disabled={
                      hold.release_status === 'pending_release' ||
                      releasingEntryId === hold.entry_id
                    }
                    className="px-3 py-1.5 rounded-md border border-border text-sm bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {hold.release_status === 'pending_release'
                      ? 'Queued'
                      : releasingEntryId === hold.entry_id
                      ? 'Releasing...'
                      : 'Release now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Transaction History</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No transactions yet
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.slice(0, 50).map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      tx.transaction_type === 'sale'
                        ? 'bg-green-500/10 text-green-600'
                        : tx.transaction_type === 'payout'
                        ? 'bg-blue-500/10 text-blue-600'
                        : tx.transaction_type === 'refund'
                        ? 'bg-red-500/10 text-red-600'
                        : 'bg-gray-500/10 text-gray-600'
                    }`}>
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs bg-muted px-2 py-1 rounded">{tx.reference_id}</code>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground truncate max-w-[200px]">
                    {tx.description || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                      tx.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                      tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                      tx.status === 'voided' || tx.status === 'reversed' ? 'bg-red-500/10 text-red-600' :
                      'bg-gray-500/10 text-gray-600'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={`font-mono ${
                      tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(tx.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {transactions.length > 50 && (
          <div className="px-6 py-4 border-t border-border text-center text-sm text-muted-foreground">
            Showing 50 of {transactions.length} transactions
          </div>
        )}
      </div>

      {/* Metadata */}
      {creatorAccount.metadata && Object.keys(creatorAccount.metadata).length > 0 && (
        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Additional Information</h2>
          <dl className="grid grid-cols-2 gap-4">
            {Object.entries(creatorAccount.metadata).map(([key, value]) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd className="text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Process Payout Modal */}
      <ProcessPayoutModal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        ledgerId={ledger.id}
        preselectedCreator={creatorForModal}
        onSuccess={handlePayoutSuccess}
      />
    </div>
  )
}
