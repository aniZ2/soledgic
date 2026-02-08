import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  DollarSign,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Wallet,
} from 'lucide-react'

export default async function CreatorDashboardPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession(); const user = session?.user
  if (!user) redirect('/creator/login')

  const creatorEmail = user.email

  // Find all connected accounts for this creator email
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select(`
      id,
      ledger_id,
      entity_id,
      display_name,
      stripe_status,
      payouts_enabled,
      ledger:ledgers(business_name)
    `)
    .eq('email', creatorEmail)
    .eq('is_active', true)

  // Get all creator balances
  let totalBalance = 0
  let totalEarnings = 0
  let pendingPayouts = 0
  const recentTransactions: any[] = []

  if (connectedAccounts && connectedAccounts.length > 0) {
    for (const account of connectedAccounts) {
      // Get creator account balance
      const { data: creatorAccount } = await supabase
        .from('accounts')
        .select('id, balance, metadata')
        .eq('ledger_id', account.ledger_id)
        .eq('account_type', 'creator_balance')
        .eq('entity_id', account.entity_id)
        .single()

      if (creatorAccount) {
        totalBalance += Number(creatorAccount.balance || 0)

        // Get transactions for this creator
        const { data: entries } = await supabase
          .from('entries')
          .select(`
            id,
            amount,
            entry_type,
            created_at,
            transaction:transactions(
              id,
              transaction_type,
              description,
              reference_id,
              metadata
            )
          `)
          .eq('account_id', creatorAccount.id)
          .order('created_at', { ascending: false })
          .limit(5)

        if (entries) {
          for (const entry of entries) {
            if (entry.entry_type === 'credit') {
              totalEarnings += Number(entry.amount)
            }
            recentTransactions.push({
              ...entry,
              ledger_name: (account.ledger as any)?.business_name || 'Unknown'
            })
          }
        }
      }

      // Get pending payout requests
      const { data: payoutRequests } = await supabase
        .from('payout_requests')
        .select('requested_amount')
        .eq('connected_account_id', account.id)
        .in('status', ['pending', 'approved', 'processing'])

      if (payoutRequests) {
        for (const pr of payoutRequests) {
          pendingPayouts += Number(pr.requested_amount || 0)
        }
      }
    }
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here&apos;s an overview of your earnings.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatCurrency(totalBalance)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Earnings</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatCurrency(totalEarnings)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending Payouts</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatCurrency(pendingPayouts)}
              </p>
            </div>
            <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Connected Platforms</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {connectedAccounts?.length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-purple-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Link
          href="/creator/payouts/request"
          className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                Request Payout
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Withdraw your available balance to your bank account
              </p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>

        <Link
          href="/creator/settings"
          className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                Tax Information
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Submit your W-9 for tax reporting
              </p>
            </div>
            <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </Link>
      </div>

      {/* Recent Transactions */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Recent Earnings</h2>
          <Link
            href="/creator/earnings"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No earnings yet. Once you receive payouts, they&apos;ll appear here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentTransactions.slice(0, 5).map((entry) => (
              <div key={entry.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {entry.transaction?.description || 'Sale'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {entry.ledger_name} &bull; {formatDate(entry.created_at)}
                  </p>
                </div>
                <p className={`font-medium ${
                  entry.entry_type === 'credit' ? 'text-green-600' : 'text-foreground'
                }`}>
                  {entry.entry_type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
