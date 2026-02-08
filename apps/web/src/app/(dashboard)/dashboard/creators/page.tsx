import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Mail, DollarSign, Plus } from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'

export default async function CreatorsPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { session } } = await supabase.auth.getSession(); const user = session?.user
  // Auth handled by layout

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user?.id ?? '')
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

  // Get creator accounts with their balances
  const { data: creators } = await supabase
    .from('accounts')
    .select(`
      id,
      entity_id,
      name,
      metadata,
      created_at
    `)
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('is_active', true)
    .order('name')

  // Get balances for each creator
  const creatorsWithBalances = await Promise.all(
    (creators || []).map(async (creator) => {
      const { data: entries } = await supabase
        .from('entries')
        .select('entry_type, amount, transactions!inner(status)')
        .eq('account_id', creator.id)
        .not('transactions.status', 'in', '("voided","reversed")')

      let balance = 0
      for (const e of entries || []) {
        balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
      }

      // Get transaction count
      const { count: txCount } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', creator.id)

      return {
        ...creator,
        balance: Math.round(balance * 100) / 100,
        transactionCount: txCount || 0,
      }
    })
  )

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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Creators</h1>
          <p className="text-muted-foreground mt-1">
            {creatorsWithBalances.length} creators in {ledger.business_name}
          </p>
        </div>
        <Link
          href="/dashboard/creators/new"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Creator
        </Link>
      </div>

      {creatorsWithBalances.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">No creators yet</h2>
          <p className="text-muted-foreground mb-6">
            Add your first creator to start tracking their sales and payouts.
          </p>
          <Link
            href="/dashboard/creators/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Creator
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {creatorsWithBalances.map((creator) => (
            <div
              key={creator.id}
              className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">
                      {creator.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{creator.name}</h3>
                    <code className="text-xs text-muted-foreground">
                      {creator.entity_id}
                    </code>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-t border-border">
                  <span className="text-sm text-muted-foreground">Balance</span>
                  <span className={`font-semibold ${creator.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(creator.balance)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-border">
                  <span className="text-sm text-muted-foreground">Transactions</span>
                  <span className="text-foreground">{creator.transactionCount}</span>
                </div>

                {creator.metadata?.email && (
                  <div className="flex items-center gap-2 py-2 border-t border-border">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground truncate">
                      {creator.metadata.email}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 border-t border-border">
                  <span className="text-sm text-muted-foreground">Since</span>
                  <span className="text-sm text-foreground">{formatDate(creator.created_at)}</span>
                </div>
              </div>

              <Link
                href={`/dashboard/creators/${creator.entity_id}`}
                className="mt-4 block w-full text-center py-2 border border-border rounded-md text-sm text-foreground hover:bg-accent transition-colors"
              >
                View Details
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
