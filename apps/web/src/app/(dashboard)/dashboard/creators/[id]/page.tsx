import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { CreatorDetailClient } from './creator-detail-client'

interface CreatorAccountRow {
  id: string
  entity_id: string
  name: string
  created_at: string
  metadata: Record<string, unknown> | null
}

interface EntryTransaction {
  id: string
  transaction_type: string
  reference_id: string
  description: string | null
  status: string
  created_at: string
}

interface EntryRow {
  id: string
  entry_type: 'credit' | 'debit' | string
  amount: number
  created_at: string
  release_status: 'held' | 'pending_release' | 'released' | 'immediate' | 'voided' | string | null
  hold_reason: string | null
  hold_until: string | null
  transactions: EntryTransaction | null
}

interface CreatorTransaction extends EntryTransaction {
  amount: number
  entry_type: 'credit' | 'debit' | string
}

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
    .select('id, business_name, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
  if (!ledger) notFound()

  // Get creator account
  const { data: creatorAccountRaw } = await supabase
    .from('accounts')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  const creatorAccount = creatorAccountRaw as CreatorAccountRow | null
  if (!creatorAccount) notFound()

  // Get all entries for this creator
  const { data: entries } = await supabase
    .from('entries')
    .select(`
      id, entry_type, amount, created_at, release_status, hold_reason, hold_until,
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
  let totalWithheld = 0

  const transactions: CreatorTransaction[] = []
  const heldFunds: Array<{
    entry_id: string
    hold_reason: string | null
    held_amount: number
    release_eligible_at: string | null
    release_status: 'held' | 'pending_release'
  }> = []
  const seenTxIds = new Set()

  for (const e of ((entries as EntryRow[] | null) ?? [])) {
    const tx = e.transactions
    if (!tx) continue

    // Calculate balance
    if (tx.status !== 'voided' && tx.status !== 'reversed') {
      if (e.entry_type === 'credit') {
        const amount = Number(e.amount)
        currentBalance += amount
        if (tx.transaction_type === 'sale') {
          totalEarnings += amount
        }

        const releaseStatus = String(e.release_status || '')
        if (releaseStatus === 'held' || releaseStatus === 'pending_release') {
          totalWithheld += amount

          const releaseAt = e.hold_until
          heldFunds.push({
            entry_id: e.id,
            hold_reason: e.hold_reason,
            held_amount: amount,
            release_eligible_at: releaseAt,
            release_status: releaseStatus,
          })
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
      }}
      creatorAccount={{
        id: creatorAccount.id,
        entity_id: creatorAccount.entity_id,
        name: creatorAccount.name,
        created_at: creatorAccount.created_at,
        metadata: creatorAccount.metadata,
      }}
      stats={{
        totalEarnings,
        totalPayouts,
        totalWithheld,
        currentBalance,
        availableBalance,
      }}
      transactions={transactions}
      heldFunds={heldFunds}
      hasTaxInfo={!!taxInfo}
    />
  )
}
