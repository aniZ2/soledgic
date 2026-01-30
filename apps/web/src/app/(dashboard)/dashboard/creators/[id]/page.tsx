import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, DollarSign, TrendingUp, FileText, Wallet, Clock } from 'lucide-react'

export default async function CreatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: creatorId } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .limit(1)

  const ledger = ledgers?.[0]
  if (!ledger) notFound()

  // Get creator account
  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  if (!creatorAccount) notFound()

  // Get all entries for this creator
  const { data: entries } = await supabase
    .from('entries')
    .select(`
      id, entry_type, amount, created_at,
      transactions!inner(
        id, transaction_type, reference_id, description, status, created_at
      )
    `)
    .eq('account_id', creatorAccount.id)
    .order('created_at', { ascending: false })

  // Calculate statistics
  let totalEarnings = 0
  let totalPayouts = 0
  let totalWithheld = 0
  let currentBalance = 0

  const transactions: any[] = []
  const seenTxIds = new Set()

  for (const e of entries || []) {
    const tx = e.transactions as any
    
    // Calculate balance
    if (tx.status !== 'voided' && tx.status !== 'reversed') {
      if (e.entry_type === 'credit') {
        currentBalance += Number(e.amount)
        if (tx.transaction_type === 'sale') {
          totalEarnings += Number(e.amount)
        }
      } else {
        currentBalance -= Number(e.amount)
        if (tx.transaction_type === 'payout') {
          totalPayouts += Number(e.amount)
        }
      }
    }

    // Collect unique transactions
    if (!seenTxIds.has(tx.id)) {
      seenTxIds.add(tx.id)
      transactions.push({
        ...tx,
        amount: e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount),
        entry_type: e.entry_type,
      })
    }
  }

  // Get held funds
  const { data: heldFunds } = await supabase
    .from('held_funds')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('creator_id', creatorId)
    .is('released_at', null)

  for (const hold of heldFunds || []) {
    totalWithheld += Number(hold.held_amount)
  }

  const availableBalance = currentBalance - totalWithheld

  // Get tax info status
  const { data: taxInfo } = await supabase
    .from('tax_info_submissions')
    .select('id, certified_at')
    .eq('ledger_id', ledger.id)
    .eq('entity_id', creatorId)
    .eq('status', 'active')
    .single()

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
                <code className="text-sm bg-muted px-2 py-0.5 rounded">{creatorId}</code>
                <span className="mx-2">•</span>
                Since {formatDate(creatorAccount.created_at)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/dashboard/payouts/new?creator=${creatorId}`}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              <Wallet className="w-4 h-4" />
              Process Payout
            </Link>
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
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalEarnings)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-muted-foreground">Total Paid Out</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalPayouts)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            <span className="text-sm text-muted-foreground">Held Amount</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalWithheld)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-muted-foreground">Available</span>
          </div>
          <p className={`text-2xl font-bold ${availableBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(availableBalance)}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-muted-foreground">Tax Info</span>
          </div>
          <p className={`text-lg font-medium ${taxInfo ? 'text-green-600' : 'text-yellow-600'}`}>
            {taxInfo ? 'On File' : 'Missing'}
          </p>
        </div>
      </div>

      {/* Held Funds */}
      {(heldFunds?.length || 0) > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            Held Funds
          </h2>
          <div className="space-y-3">
            {heldFunds?.map((hold) => (
              <div key={hold.id} className="flex justify-between items-center bg-background/50 rounded p-3">
                <div>
                  <p className="font-medium text-foreground">{hold.hold_reason}</p>
                  <p className="text-sm text-muted-foreground">
                    {hold.release_eligible_at 
                      ? `Eligible for release: ${formatDate(hold.release_eligible_at)}`
                      : 'Manual release required'}
                  </p>
                </div>
                <p className="font-mono font-semibold text-foreground">{formatCurrency(hold.held_amount)}</p>
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
            {Object.entries(creatorAccount.metadata as Record<string, any>).map(([key, value]) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</dt>
                <dd className="text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
