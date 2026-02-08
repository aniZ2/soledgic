import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowDownRight, ArrowUpRight, Filter } from 'lucide-react'

export default async function CreatorEarningsPage() {
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
      ledger:ledgers(business_name)
    `)
    .eq('email', creatorEmail)
    .eq('is_active', true)

  const allTransactions: any[] = []

  if (connectedAccounts && connectedAccounts.length > 0) {
    for (const account of connectedAccounts) {
      // Get creator account
      const { data: creatorAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', account.ledger_id)
        .eq('account_type', 'creator_balance')
        .eq('entity_id', account.entity_id)
        .single()

      if (creatorAccount) {
        // Get all entries for this creator
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
          .limit(100)

        if (entries) {
          for (const entry of entries) {
            allTransactions.push({
              ...entry,
              ledger_name: (account.ledger as any)?.business_name || 'Unknown',
              platform: account.display_name
            })
          }
        }
      }
    }
  }

  // Sort by date
  allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Calculate totals
  const totalCredits = allTransactions
    .filter(t => t.entry_type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalDebits = allTransactions
    .filter(t => t.entry_type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Earnings</h1>
          <p className="text-muted-foreground mt-1">
            Your complete transaction history
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Earned</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            +{formatCurrency(totalCredits)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Withdrawn</p>
          <p className="text-2xl font-bold text-foreground mt-1">
            -{formatCurrency(totalDebits)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Net Earnings</p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {formatCurrency(totalCredits - totalDebits)}
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            All Transactions ({allTransactions.length})
          </h2>
        </div>

        {allTransactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No transactions yet. Once you receive earnings, they&apos;ll appear here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allTransactions.map((entry) => (
              <div key={entry.id} className="px-6 py-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    entry.entry_type === 'credit'
                      ? 'bg-green-500/10'
                      : 'bg-blue-500/10'
                  }`}>
                    {entry.entry_type === 'credit' ? (
                      <ArrowDownRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {entry.transaction?.description || entry.transaction?.transaction_type || 'Transaction'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.ledger_name} &bull; {formatDate(entry.created_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${
                    entry.entry_type === 'credit' ? 'text-green-600' : 'text-foreground'
                  }`}>
                    {entry.entry_type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.transaction?.reference_id || '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
