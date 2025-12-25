import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Filter } from 'lucide-react'

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const { id } = await params
  const { type, page } = await searchParams
  const currentPage = parseInt(page || '1')
  const limit = 25
  const offset = (currentPage - 1) * limit

  const supabase = await createClient()
  
  // Get ledger
  const { data: ledger, error } = await supabase
    .from('ledgers')
    .select('id, platform_name')
    .eq('id', id)
    .single()

  if (error || !ledger) {
    notFound()
  }

  // Build query
  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('ledger_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type) {
    query = query.eq('transaction_type', type)
  }

  const { data: transactions, count } = await query

  const totalPages = Math.ceil((count || 0) / limit)

  const typeFilters = [
    { value: '', label: 'All' },
    { value: 'sale', label: 'Sales' },
    { value: 'expense', label: 'Expenses' },
    { value: 'payout', label: 'Payouts' },
    { value: 'refund', label: 'Refunds' },
    { value: 'adjustment', label: 'Adjustments' },
    { value: 'transfer', label: 'Transfers' },
  ]

  return (
    <div>
      <Link
        href={`/ledgers/${id}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            {ledger.platform_name} • {count || 0} total transactions
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex gap-2">
          {typeFilters.map((filter) => (
            <Link
              key={filter.value}
              href={`/ledgers/${id}/transactions${filter.value ? `?type=${filter.value}` : ''}`}
              className={`px-3 py-1 rounded-full text-sm ${
                (type || '') === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="mt-6">
        {transactions && transactions.length > 0 ? (
          <>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Reference</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Description</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString()}
                        <br />
                        <span className="text-xs">
                          {new Date(tx.created_at).toLocaleTimeString()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          tx.transaction_type === 'sale' ? 'bg-green-500/10 text-green-500' :
                          tx.transaction_type === 'expense' ? 'bg-red-500/10 text-red-500' :
                          tx.transaction_type === 'payout' ? 'bg-blue-500/10 text-blue-500' :
                          tx.transaction_type === 'refund' ? 'bg-orange-500/10 text-orange-500' :
                          tx.transaction_type === 'reversal' ? 'bg-purple-500/10 text-purple-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-muted-foreground">
                        {tx.reference_id?.slice(0, 20)}...
                      </td>
                      <td className="py-3 px-4 text-foreground max-w-xs truncate">
                        {tx.description || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          tx.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                          tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                          tx.status === 'reversed' ? 'bg-red-500/10 text-red-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-foreground">
                        ${(tx.amount / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  {currentPage > 1 && (
                    <Link
                      href={`/ledgers/${id}/transactions?page=${currentPage - 1}${type ? `&type=${type}` : ''}`}
                      className="px-3 py-1 border border-border rounded-md hover:bg-accent text-sm"
                    >
                      Previous
                    </Link>
                  )}
                  {currentPage < totalPages && (
                    <Link
                      href={`/ledgers/${id}/transactions?page=${currentPage + 1}${type ? `&type=${type}` : ''}`}
                      className="px-3 py-1 border border-border rounded-md hover:bg-accent text-sm"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <p className="text-muted-foreground">No transactions found</p>
          </div>
        )}
      </div>
    </div>
  )
}
