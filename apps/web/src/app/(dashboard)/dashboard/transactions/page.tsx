import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  // Get ledgers, prefer active group
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)

  if (!ledger) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No ledger found. Create one first.</p>
        <Link href="/ledgers/new" className="text-primary hover:underline mt-2 inline-block">
          Create Ledger
        </Link>
      </div>
    )
  }

  // Get transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      transaction_type,
      reference_id,
      amount,
      description,
      status,
      created_at,
      metadata
    `)
    .eq('ledger_id', ledger.id)
    .order('created_at', { ascending: false })
    .limit(100)

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

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            All transactions for {ledger.business_name}
          </p>
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
            {transactions?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  No transactions yet. Use the API to record your first sale.
                </td>
              </tr>
            )}
            {transactions?.map((tx) => (
              <tr key={tx.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded flex items-center justify-center ${
                      tx.transaction_type === 'sale' 
                        ? 'bg-green-500/10' 
                        : tx.transaction_type === 'payout'
                        ? 'bg-blue-500/10'
                        : tx.transaction_type === 'refund'
                        ? 'bg-red-500/10'
                        : 'bg-gray-500/10'
                    }`}>
                      {tx.transaction_type === 'sale' ? (
                        <ArrowDownRight className="w-4 h-4 text-green-500" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <span className="capitalize text-foreground font-medium">
                      {tx.transaction_type}
                    </span>
                  </div>
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
                    tx.transaction_type === 'sale' ? 'text-green-600' : 
                    tx.transaction_type === 'refund' ? 'text-red-600' : 
                    'text-foreground'
                  }`}>
                    {tx.transaction_type === 'sale' ? '+' : tx.transaction_type === 'payout' ? '-' : ''}
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
    </div>
  )
}
