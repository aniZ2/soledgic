import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'

export default async function DashboardPage() {
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

  // Get ledgers for this organization
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, ledger_mode, status, created_at, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)

  // Get summary stats if we have a ledger
  let stats = {
    totalRevenue: 0,
    totalPayouts: 0,
    creatorCount: 0,
    pendingPayouts: 0,
  }

  let recentTransactions: any[] = []

  if (ledger) {
    // Get transaction counts
    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, transaction_type, amount, description, created_at, status')
      .eq('ledger_id', ledger.id)
      .not('status', 'in', '("voided","reversed")')
      .order('created_at', { ascending: false })
      .limit(10)

    recentTransactions = transactions || []

    // Calculate totals
    const { data: totals } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('ledger_id', ledger.id)
      .not('status', 'in', '("voided","reversed")')

    if (totals) {
      stats.totalRevenue = totals
        .filter(t => t.transaction_type === 'sale')
        .reduce((sum, t) => sum + Number(t.amount), 0)
      
      stats.totalPayouts = totals
        .filter(t => t.transaction_type === 'payout')
        .reduce((sum, t) => sum + Number(t.amount), 0)
    }

    // Get creator count
    const { count: creatorCount } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')

    stats.creatorCount = creatorCount || 0
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
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {ledger ? `Overview for ${ledger.business_name}` : 'Get started by creating a ledger'}
        </p>
      </div>

      {!ledger ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">No ledgers yet</h2>
          <p className="text-muted-foreground mb-6">Create your first ledger to start tracking transactions</p>
          <Link
            href="/ledgers/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Create Ledger
          </Link>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {formatCurrency(stats.totalRevenue)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Payouts</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {formatCurrency(stats.totalPayouts)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Creators</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {stats.creatorCount}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-purple-500" />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Net Position</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {formatCurrency(stats.totalRevenue - stats.totalPayouts)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Recent Transactions</h2>
              <Link
                href="/dashboard/transactions"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            
            {recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No transactions yet. Use the API to record your first sale.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        tx.transaction_type === 'sale' 
                          ? 'bg-green-500/10' 
                          : tx.transaction_type === 'payout'
                          ? 'bg-blue-500/10'
                          : 'bg-gray-500/10'
                      }`}>
                        {tx.transaction_type === 'sale' ? (
                          <ArrowDownRight className={`w-5 h-5 text-green-500`} />
                        ) : (
                          <ArrowUpRight className={`w-5 h-5 text-blue-500`} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground capitalize">
                          {tx.transaction_type}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {tx.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${
                        tx.transaction_type === 'sale' ? 'text-green-600' : 'text-foreground'
                      }`}>
                        {tx.transaction_type === 'sale' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(tx.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API Key Section */}
          <div className="mt-8 bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Start</h2>
            <p className="text-muted-foreground mb-4">
              Use the API to record sales, process payouts, and generate reports.
            </p>
            <div className="bg-muted rounded-lg p-4">
              <code className="text-sm text-foreground">
                curl -X POST https://soledgic.supabase.co/functions/v1/record-sale \<br />
                &nbsp;&nbsp;-H &quot;x-api-key: YOUR_API_KEY&quot; \<br />
                &nbsp;&nbsp;-d &apos;&#123;&quot;reference_id&quot;: &quot;sale_1&quot;, &quot;creator_id&quot;: &quot;creator_1&quot;, &quot;amount&quot;: 1000&#125;&apos;
              </code>
            </div>
            <Link
              href="/settings/api-keys"
              className="inline-block mt-4 text-sm text-primary hover:underline"
            >
              View your API keys →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
