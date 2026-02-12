import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { GettingStartedClient } from './getting-started-client'

export default async function GettingStartedPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  // Use verified user lookup to avoid false unauth states from stale session payloads.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) redirect('/onboarding')

  // Get ledgers
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, api_key, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)

  if (!ledger) redirect('/ledgers/new')

  // Check onboarding progress
  const [{ count: creatorCount }, { count: transactionCount }, { count: payoutCount }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance'),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('transaction_type', 'payout'),
  ])

  // Check user preference from metadata
  const userMode = user?.user_metadata?.onboarding_mode as 'dashboard' | 'developer' | undefined

  return (
    <GettingStartedClient
      ledger={{
        id: ledger.id,
        business_name: ledger.business_name,
        api_key: ledger.api_key,
      }}
      progress={{
        hasCreator: (creatorCount || 0) > 0,
        hasTransaction: (transactionCount || 0) > 0,
        hasPayout: (payoutCount || 0) > 0,
      }}
      initialMode={userMode}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL || ''}
    />
  )
}
