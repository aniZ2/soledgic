import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service'

type JsonRecord = Record<string, unknown>

interface ParticipantIdentityLinkRow {
  ledger_id: string
  participant_id: string
  linked_at: string | null
}

interface CreatorBalanceAccountRow {
  ledger_id: string
  entity_id: string
  name: string | null
  metadata: JsonRecord | null
}

export interface CreatorConnectedAccountRow {
  id: string
  ledger_id: string
  entity_id: string
  entity_type: string | null
  display_name: string | null
  email: string | null
  created_by: string | null
  payouts_enabled: boolean
  default_bank_account_id: string | null
  default_bank_last4: string | null
  default_bank_name: string | null
  processor_identity_id: string | null
  setup_state: string | null
  setup_state_expires_at: string | null
  kyc_status: string | null
  payout_delay_days: number | null
  created_at: string | null
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toKey(ledgerId: string, participantId: string): string {
  return `${ledgerId}:${participantId}`
}

function normalizeConnectedAccountRow(row: unknown): CreatorConnectedAccountRow | null {
  const record = asRecord(row)
  const id = asString(record?.id)
  const ledgerId = asString(record?.ledger_id)
  const entityId = asString(record?.entity_id)

  if (!id || !ledgerId || !entityId) {
    return null
  }

  return {
    id,
    ledger_id: ledgerId,
    entity_id: entityId,
    entity_type: asString(record?.entity_type),
    display_name: asString(record?.display_name),
    email: asString(record?.email),
    created_by: asString(record?.created_by),
    payouts_enabled: asBoolean(record?.payouts_enabled),
    default_bank_account_id: asString(record?.default_bank_account_id),
    default_bank_last4: asString(record?.default_bank_last4),
    default_bank_name: asString(record?.default_bank_name),
    processor_identity_id: asString(record?.processor_identity_id),
    setup_state: asString(record?.setup_state),
    setup_state_expires_at: asString(record?.setup_state_expires_at),
    kyc_status: asString(record?.kyc_status),
    payout_delay_days: asNumber(record?.payout_delay_days),
    created_at: asString(record?.created_at),
  }
}

async function getIdentityLinksForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<ParticipantIdentityLinkRow[]> {
  const { data } = await supabase
    .from('participant_identity_links')
    .select('ledger_id, participant_id, linked_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('linked_at', { ascending: true })

  return (data || [])
    .map((row) => {
      const record = asRecord(row)
      const ledgerId = asString(record?.ledger_id)
      const participantId = asString(record?.participant_id)
      if (!ledgerId || !participantId) return null

      return {
        ledger_id: ledgerId,
        participant_id: participantId,
        linked_at: asString(record?.linked_at),
      }
    })
    .filter((row): row is ParticipantIdentityLinkRow => row !== null)
}

async function syncConnectedAccountsFromIdentityLinks(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
  links: ParticipantIdentityLinkRow[],
): Promise<void> {
  if (links.length === 0) return

  const ledgerIds = Array.from(new Set(links.map((link) => link.ledger_id)))
  const participantIds = Array.from(new Set(links.map((link) => link.participant_id)))

  const { data: accounts } = await supabase
    .from('accounts')
    .select('ledger_id, entity_id, name, metadata')
    .in('ledger_id', ledgerIds)
    .eq('account_type', 'creator_balance')
    .in('entity_id', participantIds)

  const accountMap = new Map<string, CreatorBalanceAccountRow>()
  for (const row of accounts || []) {
    const record = asRecord(row)
    const ledgerId = asString(record?.ledger_id)
    const entityId = asString(record?.entity_id)
    if (!ledgerId || !entityId) continue

    accountMap.set(toKey(ledgerId, entityId), {
      ledger_id: ledgerId,
      entity_id: entityId,
      name: asString(record?.name),
      metadata: asRecord(record?.metadata),
    })
  }

  const upserts: JsonRecord[] = []
  for (const link of links) {
    const account = accountMap.get(toKey(link.ledger_id, link.participant_id))
    if (!account) continue

    const metadata = asRecord(account.metadata)
    const email = userEmail ?? asString(metadata?.email)
    const displayName = account.name ?? asString(metadata?.display_name)

    upserts.push({
      ledger_id: link.ledger_id,
      entity_type: 'creator',
      entity_id: link.participant_id,
      display_name: displayName,
      email,
      created_by: userId,
      is_active: true,
    })
  }

  if (upserts.length === 0) return

  await supabase
    .from('connected_accounts')
    .upsert(upserts, {
      onConflict: 'ledger_id,entity_type,entity_id',
    })
}

export async function listCreatorConnectedAccountsForIdentity(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<CreatorConnectedAccountRow[]> {
  const normalizedEmail = asString(userEmail)
  const links = await getIdentityLinksForUser(supabase, userId)

  if (links.length > 0) {
    await syncConnectedAccountsFromIdentityLinks(supabase, userId, normalizedEmail, links)

    const ledgerIds = Array.from(new Set(links.map((link) => link.ledger_id)))
    const participantKeys = new Set(links.map((link) => toKey(link.ledger_id, link.participant_id)))

    const { data } = await supabase
      .from('connected_accounts')
      .select(`
        id,
        ledger_id,
        entity_id,
        entity_type,
        display_name,
        email,
        created_by,
        payouts_enabled,
        default_bank_account_id,
        default_bank_last4,
        default_bank_name,
        processor_identity_id,
        setup_state,
        setup_state_expires_at,
        kyc_status,
        payout_delay_days,
        created_at
      `)
      .in('ledger_id', ledgerIds)
      .eq('entity_type', 'creator')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    return (data || [])
      .map(normalizeConnectedAccountRow)
      .filter((row): row is CreatorConnectedAccountRow => {
        return row !== null && participantKeys.has(toKey(row.ledger_id, row.entity_id))
      })
  }

  if (!normalizedEmail) {
    return []
  }

  const { data } = await supabase
    .from('connected_accounts')
    .select(`
      id,
      ledger_id,
      entity_id,
      entity_type,
      display_name,
      email,
      created_by,
      payouts_enabled,
      default_bank_account_id,
      default_bank_last4,
      default_bank_name,
      processor_identity_id,
      setup_state,
      setup_state_expires_at,
      kyc_status,
      payout_delay_days,
      created_at
    `)
    .eq('entity_type', 'creator')
    .eq('email', normalizedEmail)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  return (data || [])
    .map(normalizeConnectedAccountRow)
    .filter((row): row is CreatorConnectedAccountRow => row !== null)
}

export async function listCreatorConnectedAccountsForUser(
  userId: string,
  userEmail?: string | null,
): Promise<CreatorConnectedAccountRow[]> {
  const supabase = createServiceRoleClient()
  return listCreatorConnectedAccountsForIdentity(supabase as unknown as SupabaseClient, userId, userEmail)
}
