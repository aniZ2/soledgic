import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { PayoutsClient } from './payouts-client'

export default async function PayoutsPage() {
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
    .select('id, business_name, payout_rails, ledger_group_id')
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

  // Get payout transactions
  const { data: payouts } = await supabase
    .from('transactions')
    .select(`
      id,
      reference_id,
      amount,
      description,
      status,
      created_at,
      metadata
    `)
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'payout')
    .order('created_at', { ascending: false })
    .limit(50)

  // Calculate stats
  const stats = {
    total: payouts?.length || 0,
    completed: payouts?.filter(p => p.status === 'completed').length || 0,
    pending: payouts?.filter(p => p.status === 'pending').length || 0,
    totalAmount: payouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0,
  }

  return (
    <PayoutsClient
      ledger={{
        id: ledger.id,
        business_name: ledger.business_name,
        payout_rails: ledger.payout_rails as any[] | null,
      }}
      payouts={payouts || []}
      stats={stats}
    />
  )
}
