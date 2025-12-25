import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Receipt,
  FileText,
  Settings,
  Plus
} from 'lucide-react'

export default async function LedgerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  // Get ledger
  const { data: ledger, error } = await supabase
    .from('ledgers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !ledger) {
    notFound()
  }

  // Get account balances
  const { data: accounts } = await supabase
    .from('accounts')
    .select('account_type, balance')
    .eq('ledger_id', id)

  // Calculate totals
  const cash = accounts?.find(a => a.account_type === 'cash')?.balance || 0
  const revenue = accounts?.find(a => a.account_type === 'platform_revenue')?.balance || 0
  const expenses = accounts?.find(a => a.account_type === 'expense')?.balance || 0
  const creatorLiability = accounts?.filter(a => a.account_type === 'creator_balance')
    .reduce((sum, a) => sum + (a.balance || 0), 0) || 0

  // Get recent transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('ledger_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const stats = [
    { name: 'Cash Balance', value: cash, icon: DollarSign, color: 'text-green-500' },
    { name: 'Platform Revenue', value: revenue, icon: TrendingUp, color: 'text-blue-500' },
    { name: 'Expenses', value: expenses, icon: TrendingDown, color: 'text-red-500' },
    { name: 'Creator Payable', value: creatorLiability, icon: DollarSign, color: 'text-orange-500' },
  ]

  const quickActions = [
    { name: 'Record Sale', href: `/ledgers/${id}/sales/new`, icon: Plus },
    { name: 'Add Expense', href: `/ledgers/${id}/expenses/new`, icon: Receipt },
    { name: 'View Reports', href: `/ledgers/${id}/reports`, icon: FileText },
    { name: 'Settings', href: `/ledgers/${id}/settings`, icon: Settings },
  ]

  return (
    <div>
      <Link
        href="/ledgers"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledgers
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{ledger.platform_name}</h1>
          <p className="mt-1 text-muted-foreground">
            Ledger ID: {ledger.id.slice(0, 8)}...
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            ledger.status === 'active' 
              ? 'bg-green-500/10 text-green-500'
              : 'bg-muted text-muted-foreground'
          }`}>
            {ledger.status}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        {quickActions.map((action) => (
          <Link
            key={action.name}
            href={action.href}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent"
          >
            <action.icon className="h-4 w-4" />
            {action.name}
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{stat.name}</span>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold text-foreground">
              ${Math.abs(stat.value).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Recent Transactions</h2>
          <Link 
            href={`/ledgers/${id}/transactions`} 
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {transactions && transactions.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Description</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        tx.transaction_type === 'sale' ? 'bg-green-500/10 text-green-500' :
                        tx.transaction_type === 'expense' ? 'bg-red-500/10 text-red-500' :
                        tx.transaction_type === 'payout' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-foreground">
                      {tx.description || tx.reference_id}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-sm">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-foreground">
                      ${(tx.amount / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No transactions yet</h3>
            <p className="mt-2 text-muted-foreground">
              Start by recording a sale or expense.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href={`/ledgers/${id}/sales/new`}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
              >
                Record sale
              </Link>
              <Link
                href={`/ledgers/${id}/expenses/new`}
                className="border border-border px-4 py-2 rounded-md hover:bg-accent"
              >
                Add expense
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* API Key */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground">API Access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use this API key to integrate with your application.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <code className="flex-1 px-4 py-3 bg-muted rounded-md text-sm font-mono text-foreground overflow-x-auto">
            {ledger.api_key}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(ledger.api_key)}
            className="px-4 py-3 border border-border rounded-md hover:bg-accent text-sm"
          >
            Copy
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Keep this key secure. It provides full access to this ledger's data.
        </p>
      </div>
    </div>
  )
}
