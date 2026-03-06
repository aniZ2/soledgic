import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { WalletsClient } from './wallets-client'

export default async function WalletsPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
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

  // Get user_wallet accounts for this ledger
  const { data: wallets } = await supabase
    .from('accounts')
    .select('id, entity_id, name, balance, is_active, created_at')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .order('created_at', { ascending: false })

  // Calculate stats
  const walletList = wallets || []
  const stats = {
    totalWallets: walletList.length,
    totalBalance: walletList.reduce((sum, w) => sum + Number(w.balance), 0),
    activeWallets: walletList.filter(w => w.is_active).length,
  }

  return (
    <WalletsClient
      ledger={{ id: ledger.id, business_name: ledger.business_name }}
      wallets={walletList}
      stats={stats}
    />
  )
}
