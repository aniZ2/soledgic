import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, DollarSign, Clock, CheckCircle2 } from 'lucide-react'

export default async function PayoutsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Get payouts
  const { data: payouts } = await supabase
    .from('payouts')
    .select(`
      *,
      account:accounts(entity_id)
    `)
    .eq('ledger_id', id)
    .order('created_at', { ascending: false })

  // Get pending balances (creator accounts with positive balance)
  const { data: pendingBalances } = await supabase
    .from('accounts')
    .select('id, entity_id, balance')
    .eq('ledger_id', id)
    .eq('account_type', 'creator_balance')
    .gt('balance', 0)

  const totalPending = pendingBalances?.reduce((sum, a) => sum + (a.balance || 0), 0) || 0
  const totalPaidOut = payouts?.filter((p: any) => p.status === 'completed')
    .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0

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
          <h1 className="text-3xl font-bold text-foreground">Payouts</h1>
          <p className="mt-1 text-muted-foreground">
            {ledger.platform_name} • Creator payments
          </p>
        </div>
        <Link
          href={`/ledgers/${id}/payouts/new`}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New payout
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Pending Payouts</span>
            <Clock className="h-5 w-5 text-orange-500" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            ${(totalPending / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pendingBalances?.length || 0} creators with balance
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Total Paid Out</span>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            ${(totalPaidOut / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            All time
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Total Payouts</span>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {payouts?.length || 0}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Transactions
          </p>
        </div>
      </div>

      {/* Pending Balances */}
      {pendingBalances && pendingBalances.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pending Balances</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Creator ID</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Balance</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingBalances.map((balance: any) => (
                  <tr key={balance.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 font-mono text-sm text-foreground">
                      {balance.entity_id}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-foreground">
                      ${(balance.balance / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/ledgers/${id}/payouts/new?creator=${balance.entity_id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Pay out
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payout History */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Payout History</h2>
        
        {payouts && payouts.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Creator</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Method</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout: any) => (
                  <tr key={payout.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4 text-muted-foreground text-sm">
                      {new Date(payout.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-foreground">
                      {payout.account?.entity_id || payout.creator_account_id?.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-sm capitalize">
                      {payout.payout_method?.replace('_', ' ') || 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        payout.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                        payout.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                        payout.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {payout.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-foreground">
                      ${(payout.amount / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <DollarSign className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No payouts yet</h3>
            <p className="mt-2 text-muted-foreground">
              Payouts will appear here once you start paying creators.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
