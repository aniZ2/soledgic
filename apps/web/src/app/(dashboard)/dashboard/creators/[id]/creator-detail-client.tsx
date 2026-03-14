'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, DollarSign, TrendingUp, FileText, Wallet, Clock, Trash2, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { ProcessPayoutModal } from '@/components/payouts/process-payout-modal'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { TaxInfoForm } from '@/components/creators/tax-info-form'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
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

interface TaxInfo {
  id: string
  legal_name: string
  tax_id_type: string
  tax_id_last4: string
  business_type: string
  certified_at: string | null
  address_line1: string | null
  address_city: string | null
  address_state: string | null
  address_postal_code: string | null
}

interface TaxCalculation {
  participant_id: string
  tax_year: number
  gross_payments: number
  transaction_count: number
  requires_1099: boolean
  monthly_totals: Record<string, number>
  threshold: number
  linked_user_id: string | null
  shared_tax_profile: {
    status: string
    legal_name: string | null
    tax_id_last4: string | null
  } | null
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
  taxInfo: TaxInfo | null
  hasTransactions: boolean
}

export function CreatorDetailClient({
  ledger,
  creatorAccount,
  stats,
  transactions,
  heldFunds,
  hasTaxInfo,
  taxInfo,
  hasTransactions,
}: CreatorDetailClientProps) {
  const router = useRouter()
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [releasingEntryId, setReleasingEntryId] = useState<string | null>(null)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [showTaxForm, setShowTaxForm] = useState(false)
  const [taxCalc, setTaxCalc] = useState<TaxCalculation | null>(null)
  const [taxCalcLoading, setTaxCalcLoading] = useState(true)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  useEffect(() => {
    const currentYear = new Date().getFullYear()
    const url = `/api/ledger-functions/tax/calculations/${creatorAccount.entity_id}?tax_year=${currentYear}`
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.calculation) {
          setTaxCalc(data.calculation)
        }
      })
      .catch(() => {
        // Tax summary is best-effort; don't block the page
      })
      .finally(() => setTaxCalcLoading(false))
  }, [creatorAccount.entity_id])

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

  const handleDeleteCreator = async () => {
    setDeleteError(null)
    setIsDeleting(true)

    try {
      const response = await callLedgerFunction('delete-creator', {
        ledgerId: ledger.id,
        body: { creator_id: creatorAccount.entity_id },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        if (handleProtectedResponse(response, payload, handleDeleteCreator)) {
          return
        }
        throw new Error(payload?.error || 'Failed to delete creator')
      }

      router.push('/dashboard/creators')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete creator'
      setDeleteError(message)
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
    }
  }

  const handleReleaseFunds = async (entryId: string) => {
    setReleaseError(null)
    setReleasingEntryId(entryId)

    try {
      const response = await callLedgerFunction(`holds/${entryId}/release`, {
        ledgerId: ledger.id,
        method: 'POST',
        body: {
          execute_transfer: true,
        },
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        if (handleProtectedResponse(response, payload, () => handleReleaseFunds(entryId))) {
          return
        }
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
            <button
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={hasTransactions || isDeleting}
              title={hasTransactions ? 'Cannot delete creator with transactions' : 'Delete creator'}
              className="flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-red-500/30 dark:hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : 'Delete Creator'}
            </button>
          </div>
        </div>
      </div>

      {deleteError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {deleteError}
        </div>
      )}

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
            <FileText className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Tax Info</span>
          </div>
          <p className={`text-lg font-medium ${hasTaxInfo ? 'text-green-600' : 'text-yellow-600'}`}>
            {hasTaxInfo ? 'On File' : 'Missing'}
          </p>
        </div>
      </div>

      {/* Tax Status */}
      {!taxCalcLoading && taxCalc && (
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5" />
            Tax Status ({taxCalc.tax_year})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Requires 1099</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    taxCalc.requires_1099
                      ? 'bg-red-500/10 text-red-600'
                      : 'bg-green-500/10 text-green-600'
                  }`}
                >
                  {taxCalc.requires_1099 ? 'Yes' : 'No'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">YTD Gross Earnings</dt>
              <dd className="text-foreground font-medium mt-1">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                  taxCalc.gross_payments,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Backup Withholding</dt>
              <dd className="mt-1">
                {!hasTaxInfo ? (
                  <span className="inline-flex items-center gap-1 text-yellow-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Backup withholding (24%) active — no TIN on file
                  </span>
                ) : (
                  <span className="text-green-600 text-sm">Not applicable</span>
                )}
              </dd>
            </div>
          </div>
        </div>
      )}

      {/* Tax Information */}
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Tax Information
          </h2>
          {taxInfo && !showTaxForm && (
            <button
              onClick={() => setShowTaxForm(true)}
              className="text-sm text-primary hover:text-primary/80"
            >
              Update
            </button>
          )}
        </div>

        {showTaxForm || !taxInfo ? (
          <div>
            {!taxInfo && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
                <p className="text-sm text-yellow-700 dark:text-yellow-500">
                  Tax information is required for 1099 reporting. Only the last 4 digits of the TIN are stored.
                </p>
              </div>
            )}
            <TaxInfoForm
              ledgerId={ledger.id}
              creatorId={creatorAccount.entity_id}
              onSuccess={() => window.location.reload()}
            />
            {taxInfo && showTaxForm && (
              <button
                onClick={() => setShowTaxForm(false)}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Legal Name</dt>
              <dd className="text-foreground font-medium">{taxInfo.legal_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Tax ID</dt>
              <dd className="text-foreground font-medium">
                {taxInfo.tax_id_type.toUpperCase()} ending in {taxInfo.tax_id_last4}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Business Type</dt>
              <dd className="text-foreground font-medium capitalize">
                {taxInfo.business_type.replace(/_/g, ' ')}
              </dd>
            </div>
            {taxInfo.address_line1 && (
              <div>
                <dt className="text-sm text-muted-foreground">Address</dt>
                <dd className="text-foreground">
                  {taxInfo.address_line1}
                  {taxInfo.address_city && `, ${taxInfo.address_city}`}
                  {taxInfo.address_state && `, ${taxInfo.address_state}`}
                  {taxInfo.address_postal_code && ` ${taxInfo.address_postal_code}`}
                </dd>
              </div>
            )}
            {taxInfo.certified_at && (
              <div>
                <dt className="text-sm text-muted-foreground">Certified</dt>
                <dd className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  {formatDate(taxInfo.certified_at)}
                </dd>
              </div>
            )}
          </dl>
        )}
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
                        : 'bg-muted text-muted-foreground'
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
                      'bg-muted text-muted-foreground'
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
                <dd className="text-foreground">
                  {value == null
                    ? '—'
                    : typeof value === 'object'
                    ? <pre className="text-sm bg-muted rounded px-2 py-1 mt-1 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                    : String(value)}
                </dd>
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

      {/* Delete Creator Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteCreator}
        title="Delete Creator"
        message={`Are you sure you want to delete "${creatorAccount.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
