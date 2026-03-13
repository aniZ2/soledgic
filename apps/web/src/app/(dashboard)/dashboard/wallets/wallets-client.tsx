'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { WalletCards, ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

interface WalletAccount {
  id: string
  entity_id: string | null
  name: string | null
  balance: number
  is_active: boolean
  created_at: string
}

interface WalletsClientProps {
  ledger: {
    id: string
    business_name: string
  }
  wallets: WalletAccount[]
  stats: {
    totalWallets: number
    totalBalance: number
    activeWallets: number
  }
}

type ModalType = 'deposit' | 'withdraw' | null

export function WalletsClient({ ledger, wallets, stats }: WalletsClientProps) {
  const router = useRouter()
  const [modalType, setModalType] = useState<ModalType>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletAccount | null>(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  const formatCurrency = (dollars: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(dollars)
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

  const openModal = (type: ModalType, wallet: WalletAccount) => {
    setSelectedWallet(wallet)
    setModalType(type)
    setAmount('')
    setDescription('')
    setError(null)
  }

  const closeModal = () => {
    setModalType(null)
    setSelectedWallet(null)
    setAmount('')
    setDescription('')
    setError(null)
  }

  const submitWalletOperation = async () => {
    if (!selectedWallet || !modalType) return
    if (!selectedWallet.entity_id) {
      setError('Wallet is missing a participant ID')
      return
    }

    const dollars = parseFloat(amount)
    if (isNaN(dollars) || dollars <= 0) {
      setError('Enter a valid amount greater than $0')
      return
    }

    const cents = Math.round(dollars * 100)

    if (modalType === 'withdraw' && dollars > selectedWallet.balance) {
      setError(`Amount exceeds wallet balance of ${formatCurrency(selectedWallet.balance)}`)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const referenceId = `${modalType}-${crypto.randomUUID()}`
      const operationPath =
        modalType === 'deposit'
          ? `wallets/${selectedWallet.entity_id}/deposits`
          : `wallets/${selectedWallet.entity_id}/withdrawals`

      const res = await callLedgerFunction(operationPath, {
        ledgerId: ledger.id,
        method: 'POST',
        body: {
          amount: cents,
          reference_id: referenceId,
          description: description || undefined,
        },
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        if (handleProtectedResponse(res, data, submitWalletOperation)) {
          return
        }
        setError(data.error || 'Operation failed')
        return
      }

      closeModal()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    await submitWalletOperation()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Wallets</h1>
        <p className="text-muted-foreground mt-1">
          Manage user wallets for {ledger.business_name}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Wallets</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.totalWallets}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Balance</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(stats.totalBalance)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Active Wallets</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.activeWallets}</p>
        </div>
      </div>

      {/* Wallets Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">User Wallets</h2>
        </div>

        {wallets.length === 0 ? (
          <div className="p-12 text-center">
            <WalletCards className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No wallets yet</h3>
            <p className="text-muted-foreground">
              Wallets are created automatically when a deposit is made via the API.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {wallets.map((wallet) => (
                <tr key={wallet.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {wallet.entity_id || '\u2014'}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {wallet.name || '\u2014'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        wallet.is_active
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {wallet.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-foreground">
                    {formatCurrency(wallet.balance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(wallet.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openModal('deposit', wallet)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground hover:bg-accent transition-colors"
                        title="Deposit"
                      >
                        <ArrowDownToLine className="w-3 h-3" />
                        Deposit
                      </button>
                      <button
                        onClick={() => openModal('withdraw', wallet)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground hover:bg-accent transition-colors"
                        title="Withdraw"
                      >
                        <ArrowUpFromLine className="w-3 h-3" />
                        Withdraw
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Deposit / Withdraw Modal */}
      {modalType && selectedWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground capitalize">
                {modalType} — {selectedWallet.entity_id}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 text-sm text-muted-foreground">
              Current balance: <span className="font-medium text-foreground">{formatCurrency(selectedWallet.balance)}</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`${modalType === 'deposit' ? 'Deposit' : 'Withdrawal'} reason`}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-border rounded-md text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Processing...' : `Confirm ${modalType}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
