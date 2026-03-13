import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  errorResponse,
  jsonResponse,
  LedgerContext,
  sanitizeForAudit,
  validateId,
  validateString,
} from './utils.ts'

export interface CreateParticipantRequest {
  creator_id: string
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
): Promise<Response> {
  const creatorId = validateId(body.creator_id, 100)
  if (!creatorId) {
    return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const displayName = body.display_name ? validateString(body.display_name, 255) : null
  const email = body.email ? validateString(body.email, 255) : null

  if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return errorResponse('Invalid email format', 400, req, requestId)
  }

  let splitPercent = 80
  if (body.default_split_percent !== undefined) {
    if (
      typeof body.default_split_percent !== 'number' ||
      body.default_split_percent < 0 ||
      body.default_split_percent > 100
    ) {
      return errorResponse('default_split_percent must be 0-100', 400, req, requestId)
    }
    splitPercent = body.default_split_percent
  }

  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  if (existingAccount) {
    return errorResponse('Creator already exists', 409, req, requestId)
  }

  const payoutPreferences = (body.payout_preferences || { schedule: 'manual' }) as any

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .insert({
      ledger_id: ledger.id,
      account_type: 'creator_balance',
      entity_type: 'creator',
      entity_id: creatorId,
      name: displayName || `Creator ${creatorId}`,
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
    console.error('Failed to create creator account:', accountError)
    return errorResponse('Failed to create creator', 500, req, requestId)
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'creator.created',
    entity_type: 'account',
    entity_id: account.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      creator_id: creatorId,
      display_name: displayName,
      email: email ? `${email.substring(0, 3)}***` : null,
      split_percent: splitPercent,
      has_tax_info: !!body.tax_info,
    }),
    response_status: 201,
    risk_score: 15,
  })

  return jsonResponse({
    success: true,
    creator: {
      id: creatorId,
      account_id: account.id,
      display_name: displayName,
      email,
      default_split_percent: splitPercent,
      payout_preferences: body.payout_preferences || { schedule: 'manual' },
      created_at: account.created_at,
    },
  }, 201, req, requestId)
}

export async function listParticipantBalancesResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  requestId: string,
): Promise<Response> {
  const { data: creators } = await supabase
    .from('accounts')
    .select('id, name, entity_id, metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('is_active', true)

  const balances = []
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

    balances.push({
      creator_id: creator.entity_id,
      name: creator.name,
      tier: creator.metadata?.tier_name || 'starter',
      ledger_balance: ledgerBalance,
      held_amount: Math.round(totalHeld * 100) / 100,
      available_balance: Math.round((ledgerBalance - totalHeld) * 100) / 100,
    })
  }

  return jsonResponse({ success: true, data: balances }, 200, req, requestId)
}

export async function getParticipantBalanceResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  creatorIdInput: string,
  requestId: string,
): Promise<Response> {
  const creatorId = validateId(creatorIdInput, 100)
  if (!creatorId) {
    return errorResponse('Invalid or missing creator_id', 400, req, requestId)
  }

  const { data: creator } = await supabase
    .from('accounts')
    .select('id, name, entity_id, metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  if (!creator) {
    return errorResponse('Creator not found', 404, req, requestId)
  }

  const entries = await getActiveEntries(supabase, creator.id)
  const ledgerBalance = calculateBalance(entries)

  const { data: heldFunds } = await supabase
    .from('held_funds')
    .select('held_amount, released_amount, hold_reason, release_eligible_at, status')
    .eq('ledger_id', ledger.id)
    .eq('creator_id', creatorId)

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

  return jsonResponse({
    success: true,
    data: {
      creator_id: creatorId,
      name: creator.name,
      tier: creator.metadata?.tier_name || 'starter',
      custom_split: creator.metadata?.custom_split_percent,
      ledger_balance: ledgerBalance,
      held_amount: Math.round(totalHeld * 100) / 100,
      available_balance: Math.round((ledgerBalance - totalHeld) * 100) / 100,
      holds,
    },
  }, 200, req, requestId)
}

export async function getParticipantPayoutEligibilityResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  creatorIdInput: string,
  requestId: string,
): Promise<Response> {
  const creatorId = validateId(creatorIdInput, 100)
  if (!creatorId) {
    return errorResponse('Invalid or missing creator_id', 400, req, requestId)
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, balance, currency')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  if (accountError || !account) {
    return errorResponse('Creator not found', 404, req, requestId)
  }

  const settings = ledger.settings as any
  const minPayoutAmount = settings?.min_payout_amount || 10

  const rawBalance = Number(account.balance)
  if (!Number.isFinite(rawBalance)) {
    return errorResponse('Invalid account balance state', 500, req, requestId)
  }

  if (rawBalance < 0) {
    return jsonResponse({
      success: true,
      creator_id: creatorId,
      eligible: false,
      available_balance: 0,
      issues: ['Account has negative balance - contact support'],
      requirements: {
        balance_error: true,
        note: 'Account balance is in deficit state',
      },
    }, 200, req, requestId)
  }

  const availableBalance = rawBalance
  const issues: string[] = []

  const currentYear = new Date().getFullYear()
  const { data: ytdSummary } = await supabase
    .from('tax_year_summaries')
    .select('net_earnings')
    .eq('ledger_id', ledger.id)
    .eq('entity_id', creatorId)
    .eq('tax_year', currentYear)
    .single()

  const ytdEarnings = ytdSummary?.net_earnings || 0
  const reachesThreshold = ytdEarnings >= 600 || availableBalance >= 600

  const { data: activeHolds } = await supabase
    .from('payout_holds')
    .select('hold_type, reason')
    .eq('account_id', account.id)
    .eq('status', 'active')

  const holdReasons = activeHolds?.map((hold) => hold.reason) || []
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

  return jsonResponse({
    success: true,
    creator_id: creatorId,
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
  }, 200, req, requestId)
}
