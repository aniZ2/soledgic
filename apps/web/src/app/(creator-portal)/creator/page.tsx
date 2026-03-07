import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, DollarSign, Wallet, CheckCircle2 } from 'lucide-react'

interface ConnectedAccountRow {
  ledger_id: string
  entity_id: string
  display_name: string | null
  ledger: {
    business_name: string
  } | null
}

interface EntryTransaction {
  id: string
  transaction_type: string
  description: string | null
  reference_id: string | null
}

interface EntryRow {
  id: string
  amount: number
  entry_type: 'credit' | 'debit' | string
  created_at: string
  transaction: EntryTransaction | null
}

interface ActivityItem extends EntryRow {
  ledger_name: string
}

export default async function CreatorDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/creator/login')

  const creatorEmail = user.email

  // Find all connected accounts for this creator
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select(`
      id,
      ledger_id,
      entity_id,
      display_name,
      ledger:ledgers(business_name)
    `)
    .eq('email', creatorEmail)
    .eq('is_active', true)

  const connectedAccountRows = (connectedAccounts as ConnectedAccountRow[] | null) ?? []

  let totalCredits = 0
  let totalDebits = 0
  const recentActivity: ActivityItem[] = []

  for (const account of connectedAccountRows) {
    const { data: creatorAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', account.ledger_id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', account.entity_id)
      .single()

    if (!creatorAccount) continue

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
          reference_id
        )
      `)
      .eq('account_id', creatorAccount.id)
      .order('created_at', { ascending: false })
      .limit(100)

    const entryRows = (entries as EntryRow[] | null) ?? []
    for (const entry of entryRows) {
      const amount = Number(entry.amount)
      if (entry.entry_type === 'credit') totalCredits += amount
      else totalDebits += amount

      recentActivity.push({
        ...entry,
        ledger_name: account.ledger?.business_name || 'Unknown',
      })
    }
  }

  // Sort and take 5 most recent
  recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const recent5 = recentActivity.slice(0, 5)

  // Count completed payouts
  const { count: payoutsCompleted } = await supabase
    .from('payout_requests')
    .select('id', { count: 'exact', head: true })
    .eq('creator_email', creatorEmail)
    .eq('status', 'completed')

  const availableBalance = totalCredits - totalDebits

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  const displayName =
    connectedAccountRows[0]?.display_name || user.user_metadata?.full_name || 'Creator'

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your earnings and activity.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground">Total Earned</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCredits)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-sm text-muted-foreground">Available Balance</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(availableBalance)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-purple-500" />
            </div>
            <p className="text-sm text-muted-foreground">Payouts Completed</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{payoutsCompleted ?? 0}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link
          href="/creator/payouts/request"
          className="block p-4 bg-primary text-primary-foreground rounded-lg text-center font-medium hover:bg-primary/90 transition-colors"
        >
          Request Payout
        </Link>
        <Link
          href="/creator/statements"
          className="block p-4 bg-card border border-border rounded-lg text-center font-medium text-foreground hover:border-primary/50 transition-colors"
        >
          View Statements
        </Link>
        <Link
          href="/creator/earnings"
          className="block p-4 bg-card border border-border rounded-lg text-center font-medium text-foreground hover:border-primary/50 transition-colors"
        >
          View Earnings
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
          <Link href="/creator/earnings" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>

        {recent5.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No activity yet. Once you receive earnings, they&apos;ll appear here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent5.map((entry) => (
              <div
                key={entry.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      entry.entry_type === 'credit' ? 'bg-green-500/10' : 'bg-blue-500/10'
                    }`}
                  >
                    {entry.entry_type === 'credit' ? (
                      <ArrowDownRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {entry.transaction?.description ||
                        entry.transaction?.transaction_type ||
                        'Transaction'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.ledger_name} &bull; {formatDate(entry.created_at)}
                    </p>
                  </div>
                </div>
                <p
                  className={`font-medium ${
                    entry.entry_type === 'credit' ? 'text-green-600' : 'text-foreground'
                  }`}
                >
                  {entry.entry_type === 'credit' ? '+' : '-'}
                  {formatCurrency(entry.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
