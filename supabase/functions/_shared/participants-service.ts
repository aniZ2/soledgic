import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  LedgerContext,
  sanitizeForAudit,
  validateId,
  validateString,
  validateUUID,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'
import {
  getLinkedUserIdForParticipant,
  getLinkedUserIdsForParticipants,
  linkParticipantToUser,
  upsertSharedPayoutProfile,
  upsertSharedTaxProfile,
} from './identity-service.ts'

export interface CreateParticipantRequest {
  participant_id: string
  user_id?: string
  display_name?: string
  email?: string
  default_split_percent?: number
  tax_info?: {
    tax_id_type?: 'ssn' | 'ein' | 'itin'
    tax_id_last4?: string
    legal_name?: string
    business_type?: 'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postal_code?: string
      country?: string
    }
  }
  payout_preferences?: {
    schedule?: 'manual' | 'weekly' | 'biweekly' | 'monthly'
    minimum_amount?: number
    method?: 'card' | 'manual'
  }
  metadata?: Record<string, any>
}

async function getActiveEntries(supabase: SupabaseClient, accountId: string) {
  const { data: entries } = await supabase
    .from('entries')
    .select('entry_type, amount, transaction_id, transactions!inner(status)')
    .eq('account_id', accountId)
    .not('transactions.status', 'in', '("voided","reversed")')

  return entries || []
}

function calculateBalance(entries: any[]): number {
  let balance = 0
  for (const entry of entries) {
    balance += entry.entry_type === 'credit' ? Number(entry.amount) : -Number(entry.amount)
  }
  return Math.round(balance * 100) / 100
}

export async function createParticipantResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: CreateParticipantRequest,
  requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  const displayName = body.display_name ? validateString(body.display_name, 255) : null
  const email = body.email ? validateString(body.email, 255) : null
  const linkedUserId = body.user_id !== undefined ? validateUUID(body.user_id) : null

  if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return resourceError('Invalid email format', 400, {}, 'invalid_email')
  }
  if (body.user_id !== undefined && !linkedUserId) {
    return resourceError('Invalid user_id: must be a UUID', 400, {}, 'invalid_user_id')
  }

  let splitPercent = 80
  if (body.default_split_percent !== undefined) {
    if (
      typeof body.default_split_percent !== 'number' ||
      body.default_split_percent < 0 ||
      body.default_split_percent > 100
    ) {
      return resourceError('default_split_percent must be 0-100', 400, {}, 'invalid_default_split_percent')
    }
    splitPercent = body.default_split_percent
  }

  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', participantId)
    .single()

  if (existingAccount) {
    return resourceError('Participant already exists', 409, {}, 'participant_already_exists')
  }

  const payoutPreferences = (body.payout_preferences || { schedule: 'manual' }) as any

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .insert({
      ledger_id: ledger.id,
      account_type: 'creator_balance',
      entity_type: 'creator',
      entity_id: participantId,
      name: displayName || `Participant ${participantId}`,
      metadata: {
        email,
        display_name: displayName,
        default_split_percent: splitPercent,
        tax_info: body.tax_info || null,
        payout_preferences: payoutPreferences,
        ...(body.metadata || {}),
      },
    })
    .select()
    .single()

  if (accountError) {
    console.error('Failed to create participant account:', accountError)
    return resourceError('Failed to create participant', 500, {}, 'participant_create_failed')
  }

  if (linkedUserId) {
    const linkResult = await linkParticipantToUser(
      supabase,
      ledger,
      participantId,
      linkedUserId,
      'provisioned',
      { created_via: 'participants.create' },
    )

    if (linkResult.error) {
      await supabase
        .from('accounts')
        .delete()
        .eq('id', account.id)

      return resourceError('Failed to link participant identity', 500, {}, 'participant_identity_link_failed')
    }

    await upsertSharedTaxProfile(supabase, linkedUserId, {
      legal_name: body.tax_info?.legal_name || null,
      tax_id_type: body.tax_info?.tax_id_type || null,
      tax_id_last4: body.tax_info?.tax_id_last4 || null,
      business_type: body.tax_info?.business_type || null,
      address: body.tax_info?.address || null,
      metadata: { source: 'participants.create' },
    })

    await upsertSharedPayoutProfile(supabase, linkedUserId, {
      method: body.payout_preferences?.method || null,
      schedule: body.payout_preferences?.schedule || null,
      minimum_amount: body.payout_preferences?.minimum_amount ?? null,
      metadata: { source: 'participants.create' },
    })
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'creator.created',
    entity_type: 'account',
    entity_id: account.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      participant_id: participantId,
      display_name: displayName,
      email: email ? `${email.substring(0, 3)}***` : null,
      split_percent: splitPercent,
      has_tax_info: !!body.tax_info,
    }),
    response_status: 201,
    risk_score: 15,
  }, requestId)

  return resourceOk({
    success: true,
    participant: {
      id: participantId,
      account_id: account.id,
      linked_user_id: linkedUserId,
      display_name: displayName,
      email,
      default_split_percent: splitPercent,
      payout_preferences: body.payout_preferences || { schedule: 'manual' },
      created_at: account.created_at,
    },
  }, 201)
}

export async function listParticipantBalancesResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  _requestId: string,
): Promise<ResourceResult> {
  const { data: creators } = await supabase
    .from('accounts')
    .select('id, name, entity_id, metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('is_active', true)

  const linkedUserIds = await getLinkedUserIdsForParticipants(
    supabase,
    ledger.id,
    (creators || []).map((creator) => String(creator.entity_id)).filter(Boolean),
  )

  const participants = []
  for (const creator of creators || []) {
    const entries = await getActiveEntries(supabase, creator.id)
    const ledgerBalance = calculateBalance(entries)

    const { data: heldFunds } = await supabase
      .from('held_funds')
      .select('held_amount, released_amount')
      .eq('ledger_id', ledger.id)
      .eq('creator_id', creator.entity_id)
      .in('status', ['held', 'partial'])

    let totalHeld = 0
    for (const heldFund of heldFunds || []) {
      totalHeld += Number(heldFund.held_amount) - Number(heldFund.released_amount)
    }

    participants.push({
      id: creator.entity_id,
      linked_user_id: linkedUserIds.get(String(creator.entity_id)) || null,
      name: creator.name,
      tier: creator.metadata?.tier_name || 'starter',
      ledger_balance: ledgerBalance,
      held_amount: Math.round(totalHeld * 100) / 100,
      available_balance: Math.round((ledgerBalance - totalHeld) * 100) / 100,
    })
  }

  return resourceOk({
    success: true,
    participants,
  })
}

export async function getParticipantBalanceResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  participantIdInput: string,
  _requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(participantIdInput, 100)
  if (!participantId) {
    return resourceError('Invalid or missing participant_id', 400, {}, 'invalid_participant_id')
  }

  const { data: creator } = await supabase
    .from('accounts')
    .select('id, name, entity_id, metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', participantId)
    .single()

  if (!creator) {
    return resourceError('Participant not found', 404, {}, 'participant_not_found')
  }

  const entries = await getActiveEntries(supabase, creator.id)
  const ledgerBalance = calculateBalance(entries)

  const { data: heldFunds } = await supabase
    .from('held_funds')
    .select('held_amount, released_amount, hold_reason, release_eligible_at, status')
    .eq('ledger_id', ledger.id)
    .eq('creator_id', participantId)

  let totalHeld = 0
  const holds = []
  for (const heldFund of heldFunds || []) {
    if (heldFund.status === 'held' || heldFund.status === 'partial') {
      const held = Number(heldFund.held_amount) - Number(heldFund.released_amount)
      totalHeld += held
      holds.push({
        amount: held,
        reason: heldFund.hold_reason,
        release_date: heldFund.release_eligible_at,
        status: heldFund.status,
      })
    }
  }

  const linkedUserId = await getLinkedUserIdForParticipant(supabase, ledger.id, participantId)

  return resourceOk({
    success: true,
    participant: {
      id: participantId,
      linked_user_id: linkedUserId,
      name: creator.name,
      tier: creator.metadata?.tier_name || 'starter',
      custom_split_percent: creator.metadata?.custom_split_percent,
      ledger_balance: ledgerBalance,
      held_amount: Math.round(totalHeld * 100) / 100,
      available_balance: Math.round((ledgerBalance - totalHeld) * 100) / 100,
      holds,
    },
  })
}

export async function getParticipantPayoutEligibilityResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  participantIdInput: string,
  _requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(participantIdInput, 100)
  if (!participantId) {
    return resourceError('Invalid or missing participant_id', 400, {}, 'invalid_participant_id')
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, balance, currency')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', participantId)
    .single()

  if (accountError || !account) {
    return resourceError('Participant not found', 404, {}, 'participant_not_found')
  }

  const settings = ledger.settings as any
  const minPayoutAmount = settings?.min_payout_amount || 10

  const rawBalance = Number(account.balance)
  if (!Number.isFinite(rawBalance)) {
    return resourceError('Invalid account balance state', 500, {}, 'invalid_account_balance_state')
  }

  if (rawBalance < 0) {
    return resourceOk({
      success: true,
      eligibility: {
        participant_id: participantId,
        eligible: false,
        available_balance: 0,
        issues: ['Account has negative balance - contact support'],
        requirements: {
          balance_error: true,
          note: 'Account balance is in deficit state',
        },
      },
    })
  }

  const availableBalance = rawBalance
  const issues: string[] = []

  const currentYear = new Date().getFullYear()
  const { data: ytdSummary } = await supabase
    .from('tax_year_summaries')
    .select('net_earnings')
    .eq('ledger_id', ledger.id)
    .eq('entity_id', participantId)
    .eq('tax_year', currentYear)
    .single()

  const ytdEarnings = ytdSummary?.net_earnings || 0
  const reachesThreshold = ytdEarnings >= 600 || availableBalance >= 600

  const { data: activeHolds } = await supabase
    .from('held_funds')
    .select('hold_reason, status')
    .eq('ledger_id', ledger.id)
    .eq('creator_id', participantId)
    .eq('status', 'held')

  const holdReasons = activeHolds?.map((hold) => hold.hold_reason) || []
  if (activeHolds && activeHolds.length > 0) {
    issues.push(...holdReasons)
  }

  const meetsMinimum = availableBalance >= minPayoutAmount
  if (!meetsMinimum) {
    issues.push(`Balance ($${availableBalance.toFixed(2)}) below minimum payout amount ($${minPayoutAmount.toFixed(2)})`)
  }

  const { data: pendingPayouts } = await supabase
    .from('transactions')
    .select('amount, entries!inner(account_id)')
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'payout')
    .in('status', ['pending', 'processing'])
    .eq('entries.account_id', account.id)

  const pendingAmount = pendingPayouts?.reduce((sum, payout) => sum + Number(payout.amount), 0) || 0
  if (pendingAmount > 0) {
    issues.push(`Payout of $${pendingAmount.toFixed(2)} already in progress`)
  }

  return resourceOk({
    success: true,
    eligibility: {
      participant_id: participantId,
      eligible: issues.length === 0,
      available_balance: availableBalance - pendingAmount,
      issues: issues.length > 0 ? issues : undefined,
      requirements: {
        ytd_earnings: ytdEarnings,
        reaches_1099_threshold: reachesThreshold,
        has_active_holds: (activeHolds?.length || 0) > 0,
        hold_reasons: holdReasons,
        meets_minimum: meetsMinimum,
        minimum_amount: minPayoutAmount,
        note: reachesThreshold ? 'Platform should verify tax info before payout' : undefined,
      },
    },
  })
}
