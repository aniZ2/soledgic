import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LinkedParticipantPortfolioItem,
  summarizeIdentityPortfolio,
} from '@/lib/identity'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export async function getActiveMembershipForLedger(
  supabase: SupabaseClient,
  userId: string,
  ledgerId: string,
) {
  const { data: ledger } = await supabase
    .from('ledgers')
    .select('id, organization_id')
    .eq('id', ledgerId)
    .maybeSingle()

  if (!ledger?.organization_id) {
    return null
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('id, role, organization_id')
    .eq('organization_id', ledger.organization_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  return membership || null
}

export async function getIdentityPortfolioForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  participants: LinkedParticipantPortfolioItem[]
  summary: ReturnType<typeof summarizeIdentityPortfolio>
}> {
  const { data: links, error: linksError } = await supabase
    .from('participant_identity_links')
    .select(`
      id,
      ledger_id,
      participant_id,
      user_id,
      link_source,
      linked_at,
      ledgers!inner(
        id,
        business_name,
        organization_id,
        ledger_group_id,
        livemode,
        default_currency
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('linked_at', { ascending: false })

  if (linksError || !links || links.length === 0) {
    return {
      participants: [],
      summary: summarizeIdentityPortfolio([]),
    }
  }

  const ledgerIds = Array.from(new Set(links.map((link) => String(link.ledger_id))))
  const participantIds = Array.from(new Set(links.map((link) => String(link.participant_id))))

  const [accountsResult, holdsResult, organizationsResult] = await Promise.all([
    supabase
      .from('accounts')
      .select('ledger_id, entity_id, name, balance, currency, metadata')
      .in('ledger_id', ledgerIds)
      .eq('account_type', 'creator_balance')
      .in('entity_id', participantIds),
    supabase
      .from('held_funds')
      .select('ledger_id, creator_id, held_amount, released_amount, status')
      .in('ledger_id', ledgerIds)
      .in('creator_id', participantIds)
      .in('status', ['held', 'partial']),
    supabase
      .from('organizations')
      .select('id, name')
      .in('id', Array.from(new Set(
        links
          .map((link) => (link.ledgers as { organization_id?: string | null } | null)?.organization_id)
          .filter(Boolean) as string[],
      ))),
  ])

  const accounts = accountsResult.data || []
  const holds = holdsResult.data || []
  const organizations = new Map(
    (organizationsResult.data || []).map((org) => [String(org.id), String(org.name)]),
  )

  const accountMap = new Map<string, {
    name: string | null
    balance: number
    currency: string
    email: string | null
  }>()
  for (const account of accounts) {
    const metadata = asRecord(account.metadata)
    accountMap.set(
      `${String(account.ledger_id)}:${String(account.entity_id)}`,
      {
        name: asString(account.name),
        balance: asNumber(account.balance),
        currency: asString(account.currency) || 'USD',
        email: asString(metadata?.email),
      },
    )
  }

  const holdMap = new Map<string, number>()
  for (const hold of holds) {
    const key = `${String(hold.ledger_id)}:${String(hold.creator_id)}`
    const amount = Math.max(
      0,
      asNumber(hold.held_amount) - asNumber(hold.released_amount),
    )
    holdMap.set(key, (holdMap.get(key) || 0) + amount)
  }

  const participants: LinkedParticipantPortfolioItem[] = links.map((link) => {
    const ledger = (link.ledgers || {}) as {
      id?: string | null
      business_name?: string | null
      organization_id?: string | null
      ledger_group_id?: string | null
      livemode?: boolean | null
      default_currency?: string | null
    }
    const key = `${String(link.ledger_id)}:${String(link.participant_id)}`
    const account = accountMap.get(key)
    const heldAmount = Math.round((holdMap.get(key) || 0) * 100) / 100
    const ledgerBalance = Math.round((account?.balance || 0) * 100) / 100

    return {
      linkId: String(link.id),
      participantId: String(link.participant_id),
      linkedUserId: String(link.user_id),
      linkedAt: asString(link.linked_at),
      ledgerId: String(link.ledger_id),
      ledgerName: asString(ledger.business_name),
      organizationId: asString(ledger.organization_id),
      organizationName: ledger.organization_id ? (organizations.get(String(ledger.organization_id)) || null) : null,
      ledgerGroupId: asString(ledger.ledger_group_id),
      livemode: Boolean(ledger.livemode),
      name: account?.name || null,
      email: account?.email || null,
      ledgerBalance,
      heldAmount,
      availableBalance: Math.round((ledgerBalance - heldAmount) * 100) / 100,
      currency: account?.currency || asString(ledger.default_currency) || 'USD',
      linkSource: asString(link.link_source),
    }
  })

  return {
    participants,
    summary: summarizeIdentityPortfolio(participants),
  }
}
