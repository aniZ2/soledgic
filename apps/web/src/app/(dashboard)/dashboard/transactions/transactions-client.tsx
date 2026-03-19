'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Plus, ChevronDown,
  DollarSign, RotateCcw, ArrowRightLeft, FileEdit,
  Search, Filter, Download, X
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
  metadata: Record<string, unknown> | null
  entry_method?: string | null
}

interface TransactionsClientProps {
  ledger: {
    id: string
    business_name: string
  }
  transactions: Transaction[]
}

const TRANSACTION_TYPES = ['sale', 'income', 'payout', 'platform_payout', 'refund', 'transfer', 'adjustment', 'deposit', 'withdrawal']
const STATUSES = ['completed', 'pending', 'voided', 'reversed', 'draft']

export function TransactionsClient({ ledger, transactions }: TransactionsClientProps) {
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [incomeModalOpen, setIncomeModalOpen] = useState(false)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilters = search || typeFilter || statusFilter || dateFrom || dateTo

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      // Hide voided/reversed by default — show only when explicitly filtered
      if (!statusFilter && (tx.status === 'voided' || tx.status === 'reversed')) return false

      if (search) {
        const q = search.toLowerCase()
        const matches =
          tx.reference_id.toLowerCase().includes(q) ||
          tx.transaction_type.toLowerCase().includes(q) ||
          (tx.description || '').toLowerCase().includes(q) ||
          String(tx.amount).includes(q)
        if (!matches) return false
      }
      if (typeFilter && tx.transaction_type !== typeFilter) return false
      if (statusFilter && tx.status !== statusFilter) return false
      if (dateFrom && tx.created_at < dateFrom) return false
      if (dateTo) {
        // Include the entire "to" day
        const toEnd = dateTo + 'T23:59:59.999Z'
        if (tx.created_at > toEnd) return false
      }
      return true
    })
  }, [transactions, search, typeFilter, statusFilter, dateFrom, dateTo])

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('')
    setStatusFilter('')
    setDateFrom('')
    setDateTo('')
  }

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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-600',
      pending: 'bg-yellow-500/10 text-yellow-600',
      voided: 'bg-red-500/10 text-red-600',
      reversed: 'bg-muted text-muted-foreground',
      draft: 'bg-blue-500/10 text-blue-600',
    }
    return styles[status] || 'bg-muted text-muted-foreground'
  }

  const handleSuccess = () => {
    window.location.reload()
  }

  const handleExportCsv = () => {
    const rows = filtered.map((tx) => ({
      date: new Date(tx.created_at).toISOString(),
      type: tx.transaction_type,
      reference: tx.reference_id,
      description: tx.description || '',
      status: tx.status,
      amount: tx.amount.toFixed(2),
    }))
    const header = 'Date,Type,Reference,Description,Status,Amount'
    const csv = [header, ...rows.map((r) =>
      `${r.date},${r.type},${r.reference},"${r.description.replace(/"/g, '""')}",${r.status},${r.amount}`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${ledger.business_name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

        {/* Platform transactions are API-driven — manual entry is in Books/Ledgers */}
      </div>

      {/* Search & Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by reference, description, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
              hasActiveFilters
                ? 'border-primary text-primary bg-primary/5'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 border border-border rounded-lg">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              >
                <option value="">All types</option>
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-foreground text-sm"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        )}

        {hasActiveFilters && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {transactions.length} transactions
          </p>
        )}
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
            {filtered.length === 0 && transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <DollarSign className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No transactions yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Transactions from your API integration will appear here automatically. You can also record income, refunds, and adjustments manually.
                    </p>
                    <div className="flex items-center gap-3">
                      <a
                        href="/connect"
                        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
                      >
                        Set Up Integration
                      </a>
                      <button
                        onClick={() => setShowActionMenu(true)}
                        className="inline-flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-md hover:bg-accent"
                      >
                        <Plus className="w-4 h-4" />
                        Record Manually
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {filtered.length === 0 && transactions.length > 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <p className="text-muted-foreground">No transactions match your filters.</p>
                  <button onClick={clearFilters} className="mt-2 text-primary hover:underline text-sm">
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
            {filtered.map((tx) => (
              <tr key={tx.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link href={`/dashboard/transactions/${tx.id}`} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded flex items-center justify-center ${
                      tx.transaction_type === 'sale' || tx.transaction_type === 'income' || tx.transaction_type === 'deposit'
                        ? 'bg-green-500/10'
                        : tx.transaction_type === 'payout' || tx.transaction_type === 'platform_payout' || tx.transaction_type === 'withdrawal'
                        ? 'bg-blue-500/10'
                        : tx.transaction_type === 'refund'
                        ? 'bg-red-500/10'
                        : tx.transaction_type === 'transfer'
                        ? 'bg-blue-500/10'
                        : 'bg-muted'
                    }`}>
                      {tx.transaction_type === 'sale' || tx.transaction_type === 'income' || tx.transaction_type === 'deposit' ? (
                        <ArrowDownRight className="w-4 h-4 text-green-500" />
                      ) : tx.transaction_type === 'transfer' ? (
                        <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="capitalize text-foreground font-medium hover:underline">
                        {tx.transaction_type}
                      </span>
                      {tx.entry_method === 'manual' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 font-medium uppercase">
                          Manual
                        </span>
                      )}
                      {tx.entry_method === 'system' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium uppercase">
                          Auto
                        </span>
                      )}
                    </div>
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
                    tx.transaction_type === 'sale' || tx.transaction_type === 'income' || tx.transaction_type === 'deposit' ? 'text-green-600' :
                    tx.transaction_type === 'refund' || tx.transaction_type === 'withdrawal' ? 'text-red-600' :
                    'text-foreground'
                  }`}>
                    {tx.transaction_type === 'sale' || tx.transaction_type === 'income' || tx.transaction_type === 'deposit' ? '+' :
                     tx.transaction_type === 'payout' || tx.transaction_type === 'platform_payout' || tx.transaction_type === 'refund' || tx.transaction_type === 'withdrawal' ? '-' : ''}
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
