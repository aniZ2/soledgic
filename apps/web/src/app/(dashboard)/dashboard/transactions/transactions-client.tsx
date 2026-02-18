'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Plus, ChevronDown,
  DollarSign, RotateCcw, ArrowRightLeft, FileEdit
} from 'lucide-react'
import { RecordIncomeModal } from '@/components/transactions/record-income-modal'
import { RecordRefundModal } from '@/components/transactions/record-refund-modal'
import { RecordTransferModal } from '@/components/transactions/record-transfer-modal'
import { RecordAdjustmentModal } from '@/components/transactions/record-adjustment-modal'

interface Transaction {
  id: string
  transaction_type: string
  reference_id: string
  amount: number
  description: string | null
  status: string
  created_at: string
  metadata: any
}

interface TransactionsClientProps {
  ledger: {
    id: string
    business_name: string
  }
  transactions: Transaction[]
}

export function TransactionsClient({ ledger, transactions }: TransactionsClientProps) {
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [incomeModalOpen, setIncomeModalOpen] = useState(false)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false)

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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-600',
      pending: 'bg-yellow-500/10 text-yellow-600',
      voided: 'bg-red-500/10 text-red-600',
      reversed: 'bg-gray-500/10 text-gray-600',
      draft: 'bg-blue-500/10 text-blue-600',
    }
    return styles[status] || 'bg-gray-500/10 text-gray-600'
  }

  const handleSuccess = () => {
    window.location.reload()
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            All transactions for {ledger.business_name}
          </p>
        </div>

        {/* Action Menu */}
        <div className="relative">
          <button
            onClick={() => setShowActionMenu(!showActionMenu)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Transaction
            <ChevronDown className="w-4 h-4" />
          </button>

          {showActionMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowActionMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-20">
                <div className="py-1">
                  <button
                    onClick={() => { setIncomeModalOpen(true); setShowActionMenu(false) }}
                    className="w-full px-4 py-2 text-left hover:bg-accent flex items-center gap-3"
                  >
                    <DollarSign className="w-4 h-4 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground">Record Income</p>
                      <p className="text-xs text-muted-foreground">Non-sale revenue</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setRefundModalOpen(true); setShowActionMenu(false) }}
                    className="w-full px-4 py-2 text-left hover:bg-accent flex items-center gap-3"
                  >
                    <RotateCcw className="w-4 h-4 text-red-500" />
                    <div>
                      <p className="font-medium text-foreground">Record Refund</p>
                      <p className="text-xs text-muted-foreground">Refund a sale</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setTransferModalOpen(true); setShowActionMenu(false) }}
                    className="w-full px-4 py-2 text-left hover:bg-accent flex items-center gap-3"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="font-medium text-foreground">Record Transfer</p>
                      <p className="text-xs text-muted-foreground">Move between accounts</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setAdjustmentModalOpen(true); setShowActionMenu(false) }}
                    className="w-full px-4 py-2 text-left hover:bg-accent flex items-center gap-3"
                  >
                    <FileEdit className="w-4 h-4 text-purple-500" />
                    <div>
                      <p className="font-medium text-foreground">Record Adjustment</p>
                      <p className="text-xs text-muted-foreground">Journal entry</p>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reference
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <DollarSign className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No transactions yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Record your first transaction to start tracking your finances.
                    </p>
                    <button
                      onClick={() => setIncomeModalOpen(true)}
                      className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
                    >
                      <Plus className="w-4 h-4" />
                      Record Your First Transaction
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link href={`/dashboard/transactions/${tx.id}`} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded flex items-center justify-center ${
                      tx.transaction_type === 'sale' || tx.transaction_type === 'income'
                        ? 'bg-green-500/10'
                        : tx.transaction_type === 'payout'
                        ? 'bg-blue-500/10'
                        : tx.transaction_type === 'refund'
                        ? 'bg-red-500/10'
                        : tx.transaction_type === 'transfer'
                        ? 'bg-blue-500/10'
                        : 'bg-gray-500/10'
                    }`}>
                      {tx.transaction_type === 'sale' || tx.transaction_type === 'income' ? (
                        <ArrowDownRight className="w-4 h-4 text-green-500" />
                      ) : tx.transaction_type === 'transfer' ? (
                        <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <span className="capitalize text-foreground font-medium hover:underline">
                      {tx.transaction_type}
                    </span>
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                    {tx.reference_id}
                  </code>
                </td>
                <td className="px-6 py-4">
                  <span className="text-muted-foreground text-sm">
                    {tx.description || '—'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(tx.status)}`}>
                    {tx.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className={`font-medium ${
                    tx.transaction_type === 'sale' || tx.transaction_type === 'income' ? 'text-green-600' :
                    tx.transaction_type === 'refund' ? 'text-red-600' :
                    'text-foreground'
                  }`}>
                    {tx.transaction_type === 'sale' || tx.transaction_type === 'income' ? '+' :
                     tx.transaction_type === 'payout' || tx.transaction_type === 'refund' ? '-' : ''}
                    {formatCurrency(tx.amount)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(tx.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <RecordIncomeModal
        isOpen={incomeModalOpen}
        onClose={() => setIncomeModalOpen(false)}
        ledgerId={ledger.id}
        onSuccess={handleSuccess}
      />
      <RecordRefundModal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        ledgerId={ledger.id}
        onSuccess={handleSuccess}
      />
      <RecordTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        ledgerId={ledger.id}
        onSuccess={handleSuccess}
      />
      <RecordAdjustmentModal
        isOpen={adjustmentModalOpen}
        onClose={() => setAdjustmentModalOpen(false)}
        ledgerId={ledger.id}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
