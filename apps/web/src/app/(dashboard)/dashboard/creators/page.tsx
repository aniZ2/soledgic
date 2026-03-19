import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Mail } from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { getActiveOrganizationId } from '@/lib/active-org'
import { DeleteCreatorButton } from '@/components/creators/delete-creator-button'

export default async function CreatorsPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const orgId = await getActiveOrganizationId(user.id)
  const membership = orgId ? { organization_id: orgId } : null

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

  // Get risk data from connected_accounts (risk_score, payout_delay_days, kyc_status)
  const { data: connectedAccountsRaw } = await supabase
    .from('connected_accounts')
    .select('entity_id, risk_score, risk_flags, payout_delay_days, kyc_status')
    .eq('ledger_id', ledger.id)
    .eq('is_active', true)

  const riskByEntityId = new Map<string, { risk_score: number; risk_flags: string[]; payout_delay_days: number; kyc_status: string | null }>()
  for (const ca of connectedAccountsRaw || []) {
    riskByEntityId.set(ca.entity_id, {
      risk_score: ca.risk_score ?? 0,
      risk_flags: ca.risk_flags ?? [],
      payout_delay_days: ca.payout_delay_days ?? 7,
      kyc_status: ca.kyc_status,
    })
  }

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

      const risk = riskByEntityId.get(creator.entity_id)
      return {
        ...creator,
        balance: Math.round(balance * 100) / 100,
        transactionCount: txCount || 0,
        riskScore: risk?.risk_score ?? 0,
        riskFlags: risk?.risk_flags ?? [],
        payoutDelayDays: risk?.payout_delay_days ?? 7,
        kycStatus: risk?.kyc_status ?? 'pending',
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
        {/* Creators are registered via platform API (POST /v1/participants) */}
      </div>

      {creatorsWithBalances.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">No creators yet</h2>
          <p className="text-muted-foreground">
            Creators will appear here once registered.
          </p>
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
                {!livemode && (
                  <DeleteCreatorButton
                    ledgerId={ledger.id}
                    creatorId={creator.entity_id}
                    creatorName={creator.name}
                  />
                )}
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

                <div className="py-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Risk</span>
                    <span className={`text-sm font-medium ${
                      creator.riskScore >= 60 ? 'text-red-600' :
                      creator.riskScore >= 30 ? 'text-orange-600' :
                      creator.riskScore >= 10 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {creator.riskScore >= 60 ? 'High' : creator.riskScore >= 30 ? 'Elevated' : creator.riskScore >= 10 ? 'Low' : 'Clean'}
                    </span>
                  </div>
                  {creator.riskFlags.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {creator.riskFlags.includes('high_refund_rate') || creator.riskFlags.includes('elevated_refund_rate')
                        ? 'Elevated refund activity'
                        : creator.riskFlags.includes('high_dispute_rate') || creator.riskFlags.includes('has_disputes')
                        ? 'Dispute history detected'
                        : creator.riskFlags.includes('new_creator')
                        ? 'New creator — monitoring period'
                        : creator.riskFlags.map((f) => f.replace(/_/g, ' ')).join(', ')}
                      {creator.payoutDelayDays > 7 && ` · ${creator.payoutDelayDays}d payout delay`}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between py-2 border-t border-border">
                  <span className="text-sm text-muted-foreground">KYC</span>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                    creator.kycStatus === 'approved' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                    creator.kycStatus === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {creator.kycStatus}
                  </span>
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
