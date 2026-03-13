import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LedgerContext } from './utils.ts'

export interface SharedTaxProfileInput {
  legal_name?: string | null
  tax_id_type?: string | null
  tax_id_last4?: string | null
  business_type?: string | null
  address?: {
    line1?: string | null
    line2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
  } | null
  certified_at?: string | null
  certified_by?: string | null
  metadata?: Record<string, unknown>
}

export interface SharedPayoutProfileInput {
  method?: string | null
  schedule?: string | null
  minimum_amount?: number | null
  currency?: string | null
  country?: string | null
  payouts_enabled?: boolean | null
  metadata?: Record<string, unknown>
}

function hasTaxProfileData(input: SharedTaxProfileInput): boolean {
  return Boolean(
    input.legal_name ||
    input.tax_id_type ||
    input.tax_id_last4 ||
    input.business_type ||
    input.address?.line1 ||
    input.address?.city,
  )
}

function hasPayoutProfileData(input: SharedPayoutProfileInput): boolean {
  return Boolean(
    input.method ||
    input.schedule ||
    input.minimum_amount !== undefined ||
    input.currency ||
    input.country ||
    input.payouts_enabled !== undefined,
  )
}

export async function linkParticipantToUser(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  participantId: string,
  userId: string,
  linkSource = 'provisioned',
  metadata: Record<string, unknown> = {},
): Promise<{ error: string | null }> {
  let membershipId: string | null = null

  if (ledger.organization_id) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', ledger.organization_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    membershipId = membership?.id ? String(membership.id) : null
  }

  const { error } = await supabase
    .from('participant_identity_links')
    .upsert({
      ledger_id: ledger.id,
      participant_id: participantId,
      user_id: userId,
      membership_id: membershipId,
      link_source: linkSource,
      status: 'active',
      is_primary: true,
      metadata,
      linked_at: new Date().toISOString(),
      unlinked_at: null,
    }, {
      onConflict: 'ledger_id,participant_id',
    })

  return { error: error?.message || null }
}

export async function getLinkedUserIdForParticipant(
  supabase: SupabaseClient,
  ledgerId: string,
  participantId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('participant_identity_links')
    .select('user_id')
    .eq('ledger_id', ledgerId)
    .eq('participant_id', participantId)
    .eq('status', 'active')
    .maybeSingle()

  return data?.user_id ? String(data.user_id) : null
}

export async function getLinkedUserIdsForParticipants(
  supabase: SupabaseClient,
  ledgerId: string,
  participantIds: string[],
): Promise<Map<string, string>> {
  if (participantIds.length === 0) {
    return new Map()
  }

  const { data } = await supabase
    .from('participant_identity_links')
    .select('participant_id, user_id')
    .eq('ledger_id', ledgerId)
    .eq('status', 'active')
    .in('participant_id', participantIds)

  return new Map(
    (data || [])
      .filter((row) => row?.participant_id && row?.user_id)
      .map((row) => [String(row.participant_id), String(row.user_id)]),
  )
}

export async function upsertSharedTaxProfile(
  supabase: SupabaseClient,
  userId: string,
  input: SharedTaxProfileInput,
): Promise<void> {
  if (!hasTaxProfileData(input)) {
    return
  }

  await supabase
    .from('shared_tax_profiles')
    .upsert({
      user_id: userId,
      status: 'active',
      legal_name: input.legal_name || null,
      tax_id_type: input.tax_id_type || null,
      tax_id_last4: input.tax_id_last4 || null,
      business_type: input.business_type || null,
      address_line1: input.address?.line1 || null,
      address_line2: input.address?.line2 || null,
      address_city: input.address?.city || null,
      address_state: input.address?.state || null,
      address_postal_code: input.address?.postal_code || null,
      address_country: input.address?.country || 'US',
      certified_at: input.certified_at || null,
      certified_by: input.certified_by || null,
      metadata: input.metadata || {},
    }, {
      onConflict: 'user_id',
    })
}

export async function upsertSharedPayoutProfile(
  supabase: SupabaseClient,
  userId: string,
  input: SharedPayoutProfileInput,
): Promise<void> {
  if (!hasPayoutProfileData(input)) {
    return
  }

  const minimumAmount = typeof input.minimum_amount === 'number' && Number.isFinite(input.minimum_amount)
    ? Math.max(0, Math.round(input.minimum_amount))
    : 0

  await supabase
    .from('shared_payout_profiles')
    .upsert({
      user_id: userId,
      status: 'active',
      default_method: input.method || 'manual',
      schedule: input.schedule || 'manual',
      minimum_amount: minimumAmount,
      currency: input.currency || 'USD',
      country: input.country || 'US',
      payouts_enabled: input.payouts_enabled === true,
      metadata: input.metadata || {},
    }, {
      onConflict: 'user_id',
    })
}
