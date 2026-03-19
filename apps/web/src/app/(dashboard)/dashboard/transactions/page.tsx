import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { getActiveOrganizationId } from '@/lib/active-org'
import { TransactionsClient } from './transactions-client'

export default async function TransactionsPage() {
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

  // Get transactions (exclude expenses — they have their own page)
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      transaction_type,
      reference_id,
      amount,
      description,
      status,
      created_at,
      metadata,
      entry_method
    `)
    .eq('ledger_id', ledger.id)
    .neq('transaction_type', 'expense')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <TransactionsClient
      ledger={{
        id: ledger.id,
        business_name: ledger.business_name,
      }}
      transactions={transactions || []}
    />
  )
}
