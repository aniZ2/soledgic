import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { CreatorDetailClient } from './creator-detail-client'

export default async function CreatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: creatorId } = await params
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

  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, api_key, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
  if (!ledger) notFound()

  // Get creator account
  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  if (!creatorAccount) notFound()

  // Get all entries for this creator
  const { data: entries } = await supabase
    .from('entries')
    .select(`
      id, entry_type, amount, created_at,
      transactions!inner(
        id, transaction_type, reference_id, description, status, created_at
      )
    `)
    .eq('account_id', creatorAccount.id)
    .order('created_at', { ascending: false })

  // Calculate statistics
  let totalEarnings = 0
  let totalPayouts = 0
  let currentBalance = 0

  const transactions: any[] = []
  const seenTxIds = new Set()

  for (const e of entries || []) {
    const tx = e.transactions as any

    // Calculate balance
    if (tx.status !== 'voided' && tx.status !== 'reversed') {
      if (e.entry_type === 'credit') {
        currentBalance += Number(e.amount)
        if (tx.transaction_type === 'sale') {
          totalEarnings += Number(e.amount)
        }
      } else {
        currentBalance -= Number(e.amount)
        if (tx.transaction_type === 'payout') {
          totalPayouts += Number(e.amount)
        }
      }
    }

    // Collect unique transactions
    if (!seenTxIds.has(tx.id)) {
      seenTxIds.add(tx.id)
      transactions.push({
        ...tx,
        amount: e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount),
        entry_type: e.entry_type,
      })
    }
  }

  // Get held funds
  const { data: heldFunds } = await supabase
    .from('held_funds')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('creator_id', creatorId)
    .is('released_at', null)

  let totalWithheld = 0
  for (const hold of heldFunds || []) {
    totalWithheld += Number(hold.held_amount)
  }

  const availableBalance = currentBalance - totalWithheld

  // Get tax info status
  const { data: taxInfo } = await supabase
    .from('tax_info_submissions')
    .select('id, certified_at')
    .eq('ledger_id', ledger.id)
    .eq('entity_id', creatorId)
    .eq('status', 'active')
    .single()

  return (
    <CreatorDetailClient
      ledger={{
        id: ledger.id,
        api_key: ledger.api_key,
      }}
      creatorAccount={{
        id: creatorAccount.id,
        entity_id: creatorAccount.entity_id,
        name: creatorAccount.name,
        created_at: creatorAccount.created_at,
        metadata: creatorAccount.metadata as Record<string, any> | null,
      }}
      stats={{
        totalEarnings,
        totalPayouts,
        totalWithheld,
        currentBalance,
        availableBalance,
      }}
      transactions={transactions}
      heldFunds={(heldFunds || []).map(h => ({
        id: h.id,
        hold_reason: h.hold_reason,
        held_amount: Number(h.held_amount),
        release_eligible_at: h.release_eligible_at,
      }))}
      hasTaxInfo={!!taxInfo}
    />
  )
}
