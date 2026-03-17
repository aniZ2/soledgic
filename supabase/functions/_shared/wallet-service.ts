// SERVICE_ID: SVC_WALLET_ENGINE
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLog,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateId,
  validateInteger,
  validateString,
  validateUUID,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'
import { checkRapidTopupWithdraw, checkLargeTransaction } from './risk-engine.ts'

export type WalletType = 'consumer_credit' | 'creator_earnings'
export type WalletScopeType = 'customer' | 'participant'

type WalletAccountRow = {
  id: string
  account_type: 'user_wallet' | 'creator_balance' | string
  entity_id: string | null
  entity_type: string | null
  name: string
  balance: number | string | null
  currency: string | null
  metadata: Record<string, unknown> | null
  is_active: boolean | null
  created_at: string | null
}

export interface WalletMutationRequest {
  wallet_id?: string
  from_wallet_id?: string
  to_wallet_id?: string
  participant_id?: string
  from_participant_id?: string
  to_participant_id?: string
  owner_id?: string
  owner_type?: string
  wallet_type?: WalletType | string
  name?: string
  amount?: number
  reference_id?: string
  description?: string
  metadata?: Record<string, unknown>
  limit?: number
  offset?: number
}

const SUPPORTED_WALLET_ACCOUNT_TYPES = ['user_wallet', 'creator_balance']

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function normalizeWalletType(account: WalletAccountRow): WalletType {
  if (account.account_type === 'creator_balance') {
    return 'creator_earnings'
  }

  const metadata = asObject(account.metadata)
  return metadata.wallet_type === 'creator_earnings' ? 'creator_earnings' : 'consumer_credit'
}

function normalizeOwnerType(account: WalletAccountRow, walletType: WalletType): string {
  const metadata = asObject(account.metadata)
  const ownerType = typeof metadata.owner_type === 'string'
    ? metadata.owner_type
    : typeof account.entity_type === 'string' && account.entity_type.length > 0
      ? account.entity_type
      : walletType === 'creator_earnings'
        ? 'participant'
        : 'customer'

  return ownerType
}

function normalizeScopeType(account: WalletAccountRow, walletType: WalletType): WalletScopeType {
  const metadata = asObject(account.metadata)
  const scopeType = typeof metadata.scope_type === 'string' ? metadata.scope_type : null

  if (scopeType === 'participant' || scopeType === 'customer') {
    return scopeType
  }

  return walletType === 'creator_earnings' ? 'participant' : 'customer'
}

function normalizeWalletFlags(
  account: WalletAccountRow,
  walletType: WalletType,
): { redeemable: boolean; transferable: boolean; topupSupported: boolean; payoutSupported: boolean } {
  const metadata = asObject(account.metadata)

  if (walletType === 'creator_earnings') {
    return {
      redeemable: true,
      transferable: false,
      topupSupported: false,
      payoutSupported: true,
    }
  }

  return {
    redeemable: metadata.redeemable === true,
    transferable: metadata.transferable === true,
    topupSupported: metadata.topup_supported !== false,
    payoutSupported: metadata.payout_supported === true,
  }
}

function buildWalletResource(
  account: WalletAccountRow,
  heldAmount = 0,
): Record<string, unknown> {
  const walletType = normalizeWalletType(account)
  const ownerType = normalizeOwnerType(account, walletType)
  const scopeType = normalizeScopeType(account, walletType)
  const flags = normalizeWalletFlags(account, walletType)
  const balance = Number(account.balance ?? 0)
  const normalizedHeldAmount = walletType === 'creator_earnings' ? heldAmount : 0
  const availableBalance = balance - normalizedHeldAmount
  const metadata = asObject(account.metadata)

  return {
    id: account.id,
    object: 'wallet',
    wallet_type: walletType,
    scope_type: scopeType,
    owner_id: account.entity_id,
    owner_type: ownerType,
    participant_id: ownerType === 'participant' ? account.entity_id : null,
    account_type: account.account_type,
    name: account.name,
    currency: account.currency || 'USD',
    status: account.is_active === false ? 'inactive' : 'active',
    balance,
    held_amount: normalizedHeldAmount,
    available_balance: availableBalance,
    redeemable: flags.redeemable,
    transferable: flags.transferable,
    topup_supported: flags.topupSupported,
    payout_supported: flags.payoutSupported,
    created_at: account.created_at,
    metadata,
  }
}

async function getHeldAmountsByParticipantId(
  supabase: SupabaseClient,
  ledgerId: string,
  participantIds: string[],
): Promise<Map<string, number>> {
  if (participantIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('held_funds')
    .select('creator_id, held_amount, released_amount, status')
    .eq('ledger_id', ledgerId)
    .in('creator_id', participantIds)
    .in('status', ['held', 'partial'])

  if (error) {
    console.error('Failed to fetch held funds for wallet resources:', error)
    return new Map()
  }

  const totals = new Map<string, number>()
  for (const row of data || []) {
    const creatorId = String((row as any).creator_id || '')
    if (!creatorId) continue
    const currentlyHeld = Number((row as any).held_amount ?? 0) - Number((row as any).released_amount ?? 0)
    totals.set(creatorId, (totals.get(creatorId) || 0) + currentlyHeld)
  }

  return totals
}

async function getWalletAccountById(
  supabase: SupabaseClient,
  ledgerId: string,
  walletId: string,
): Promise<WalletAccountRow | null> {
  const { data } = await supabase
    .from('accounts')
    .select('id, account_type, entity_id, entity_type, name, balance, currency, metadata, is_active, created_at')
    .eq('ledger_id', ledgerId)
    .eq('id', walletId)
    .in('account_type', SUPPORTED_WALLET_ACCOUNT_TYPES)
    .maybeSingle()

  return (data as WalletAccountRow | null) || null
}

async function getLegacyWalletAccountByOwnerId(
  supabase: SupabaseClient,
  ledgerId: string,
  ownerId: string,
): Promise<WalletAccountRow | null> {
  const { data } = await supabase
    .from('accounts')
    .select('id, account_type, entity_id, entity_type, name, balance, currency, metadata, is_active, created_at')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'user_wallet')
    .eq('entity_id', ownerId)
    .maybeSingle()

  return (data as WalletAccountRow | null) || null
}

async function getWalletResourceById(
  supabase: SupabaseClient,
  ledgerId: string,
  walletId: string,
): Promise<Record<string, unknown> | null> {
  const account = await getWalletAccountById(supabase, ledgerId, walletId)
  if (!account) {
    return null
  }

  let heldAmount = 0
  if (account.account_type === 'creator_balance' && account.entity_id) {
    const heldMap = await getHeldAmountsByParticipantId(supabase, ledgerId, [account.entity_id])
    heldAmount = heldMap.get(account.entity_id) || 0
  }

  return buildWalletResource(account, heldAmount)
}

function validateWalletType(value: unknown): WalletType | null {
  if (value === 'consumer_credit' || value === 'creator_earnings') {
    return value
  }

  return null
}

function getOwnerId(body: WalletMutationRequest): string | null {
  const ownerId = body.owner_id || body.participant_id
  return validateId(ownerId, 100)
}

export async function listWalletsResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  _requestId: string,
): Promise<ResourceResult> {
  const ownerId = body.owner_id || body.participant_id
  if (ownerId && !validateId(ownerId, 100)) {
    return resourceError('Invalid owner_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_owner_id')
  }

  const ownerType = body.owner_type ? validateId(body.owner_type, 50) : null
  if (body.owner_type && !ownerType) {
    return resourceError('Invalid owner_type', 400, {}, 'invalid_owner_type')
  }

  const walletType = body.wallet_type ? validateWalletType(body.wallet_type) : null
  if (body.wallet_type && !walletType) {
    return resourceError('Invalid wallet_type', 400, {}, 'invalid_wallet_type')
  }

  const limit = validateInteger(body.limit, 1, 100) ?? 25
  const offset = validateInteger(body.offset, 0, 100000) ?? 0

  let query = supabase
    .from('accounts')
    .select('id, account_type, entity_id, entity_type, name, balance, currency, metadata, is_active, created_at', {
      count: 'exact',
    })
    .eq('ledger_id', ledger.id)
    .in('account_type', SUPPORTED_WALLET_ACCOUNT_TYPES)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (ownerId) {
    query = query.eq('entity_id', ownerId)
  }

  if (ownerType) {
    query = query.eq('entity_type', ownerType)
  }

  if (walletType === 'consumer_credit') {
    query = query.eq('account_type', 'user_wallet')
  } else if (walletType === 'creator_earnings') {
    query = query.eq('account_type', 'creator_balance')
  }

  const { data, error, count } = await query
  if (error) {
    console.error('Failed to list wallets:', error)
    return resourceError('Failed to list wallets', 500, {}, 'wallet_list_failed')
  }

  const rows = (data || []) as WalletAccountRow[]
  const creatorIds = rows
    .filter((row) => row.account_type === 'creator_balance' && row.entity_id)
    .map((row) => String(row.entity_id))
  const heldMap = await getHeldAmountsByParticipantId(supabase, ledger.id, creatorIds)

  const wallets = rows.map((row) => buildWalletResource(row, heldMap.get(String(row.entity_id || '')) || 0))

  return resourceOk({
    success: true,
    wallets,
    total: count ?? wallets.length,
    limit,
    offset,
  })
}

export async function createWalletResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const walletType = validateWalletType(body.wallet_type)
  if (!walletType) {
    return resourceError('wallet_type must be consumer_credit or creator_earnings', 400, {}, 'invalid_wallet_type')
  }

  const ownerId = getOwnerId(body)
  if (!ownerId) {
    return resourceError('owner_id is required and must be 1-100 alphanumeric characters', 400, {}, 'invalid_owner_id')
  }

  const ownerType = body.owner_type
    ? validateId(body.owner_type, 50)
    : walletType === 'creator_earnings'
      ? 'participant'
      : 'customer'

  if (!ownerType) {
    return resourceError('Invalid owner_type', 400, {}, 'invalid_owner_type')
  }

  if (walletType === 'creator_earnings') {
    const { data: existingParticipantWallet } = await supabase
      .from('accounts')
      .select('id, account_type, entity_id, entity_type, name, balance, currency, metadata, is_active, created_at')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', ownerId)
      .maybeSingle()

    if (!existingParticipantWallet) {
      return resourceError(
        'creator_earnings wallets are provisioned through participants. Create the participant first.',
        409,
        {},
        'creator_earnings_requires_participant',
      )
    }

    const heldMap = await getHeldAmountsByParticipantId(supabase, ledger.id, [ownerId])
    return resourceOk({
      success: true,
      created: false,
      wallet: buildWalletResource(existingParticipantWallet as WalletAccountRow, heldMap.get(ownerId) || 0),
    })
  }

  const existingWallet = await getLegacyWalletAccountByOwnerId(supabase, ledger.id, ownerId)
  if (existingWallet) {
    return resourceOk({
      success: true,
      created: false,
      wallet: buildWalletResource(existingWallet),
    })
  }

  const name = validateString(body.name, 120) || `Wallet ${ownerId}`
  const metadata = {
    wallet_type: 'consumer_credit',
    scope_type: ownerType === 'participant' ? 'participant' : 'customer',
    owner_type: ownerType,
    redeemable: false,
    transferable: false,
    topup_supported: true,
    payout_supported: false,
    ...(body.metadata || {}),
  }

  const { data: createdWallet, error } = await supabase
    .from('accounts')
    .insert({
      ledger_id: ledger.id,
      account_type: 'user_wallet',
      entity_id: ownerId,
      entity_type: ownerType,
      name,
      currency: 'USD',
      metadata,
    })
    .select('id, account_type, entity_id, entity_type, name, balance, currency, metadata, is_active, created_at')
    .single()

  if (error) {
    console.error('Failed to create wallet:', error)
    return resourceError('Failed to create wallet', 500, {}, 'wallet_create_failed')
  }

  await createAuditLog(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_created',
    entity_type: 'account',
    entity_id: createdWallet.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      owner_id: ownerId,
      owner_type: ownerType,
      wallet_type: 'consumer_credit',
    }),
    response_status: 201,
    risk_score: 10,
  }, requestId)

  return resourceOk({
    success: true,
    created: true,
    wallet: buildWalletResource(createdWallet as WalletAccountRow),
  }, 201)
}

export async function getWalletByIdResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  walletId: string,
  _requestId: string,
): Promise<ResourceResult> {
  const walletUuid = validateUUID(walletId)
  if (!walletUuid) {
    return resourceError('wallet_id must be a UUID', 400, {}, 'invalid_wallet_id')
  }

  const wallet = await getWalletResourceById(supabase, ledger.id, walletUuid)
  if (!wallet) {
    return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
  }

  return resourceOk({ success: true, wallet })
}

export async function listWalletEntriesByIdResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  walletId: string,
  body: WalletMutationRequest,
  _requestId: string,
): Promise<ResourceResult> {
  const walletUuid = validateUUID(walletId)
  if (!walletUuid) {
    return resourceError('wallet_id must be a UUID', 400, {}, 'invalid_wallet_id')
  }

  const limit = validateInteger(body.limit, 1, 100) ?? 25
  const offset = validateInteger(body.offset, 0, 100000) ?? 0
  const account = await getWalletAccountById(supabase, ledger.id, walletUuid)

  if (!account) {
    return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
  }

  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select(`
      id,
      entry_type,
      amount,
      created_at,
      transaction:transactions!inner(
        id,
        reference_id,
        transaction_type,
        description,
        status,
        metadata,
        created_at
      )
    `)
    .eq('account_id', walletUuid)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entriesError) {
    console.error('Failed to fetch wallet history:', entriesError)
    return resourceError('Failed to fetch wallet history', 500, {}, 'wallet_history_fetch_failed')
  }

  const { count } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', walletUuid)

  const wallet = await getWalletResourceById(supabase, ledger.id, walletUuid)
  const transactions = (entries || []).map((entry: any) => {
    const tx = entry.transaction
    return {
      entry_id: entry.id,
      entry_type: entry.entry_type,
      amount: Number(entry.amount),
      transaction_id: tx.id,
      reference_id: tx.reference_id,
      transaction_type: tx.transaction_type,
      description: tx.description,
      status: tx.status,
      metadata: tx.metadata,
      created_at: tx.created_at,
    }
  })

  return resourceOk({
    success: true,
    wallet,
    entries: transactions,
    total: count ?? 0,
    limit,
    offset,
  })
}

async function depositToUserWalletAccountResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  ownerId: string,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  // Enforce $10 minimum top-up
  if (amount < MIN_TOPUP_CENTS) {
    return resourceError(`Minimum top-up is $${(MIN_TOPUP_CENTS / 100).toFixed(2)}`, 400, {}, 'below_minimum_topup')
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return resourceError('Invalid reference_id: must be 1-255 alphanumeric characters', 400, {}, 'invalid_reference_id')
  }

  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return resourceOk(
      {
        success: false,
        idempotent: true,
        error: 'Duplicate reference_id',
        error_code: 'duplicate_reference_id',
        transaction_id: duplicate.id,
      },
      409,
    )
  }

  const { data: result, error: rpcError } = await supabase.rpc('wallet_deposit_atomic', {
    p_ledger_id: ledger.id,
    p_user_id: ownerId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_description: body.description || null,
    p_metadata: body.metadata || {},
  })

  if (rpcError) {
    return mapWalletRpcError(rpcError, ledger.id, referenceId, supabase)
  }

  const row = Array.isArray(result) ? result[0] : result
  const transactionId = row?.out_transaction_id
  const balance = Number(row?.out_wallet_balance ?? 0)
  const walletId = row?.out_wallet_account_id

  // Risk signals: rapid topup-withdraw pattern + large transaction
  if (ledger.organization_id) {
    void checkRapidTopupWithdraw(supabase, ledger.id, ledger.organization_id, ownerId, 'deposit', transactionId, referenceId)
    void checkLargeTransaction(supabase, ledger.id, ledger.organization_id, amount, 'deposit', referenceId, transactionId)
  }

  await createAuditLog(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_deposit',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      owner_id: ownerId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 20,
  }, requestId)

  return resourceOk({
    success: true,
    topup: {
      wallet_id: walletId,
      owner_id: ownerId,
      transaction_id: transactionId,
      balance,
    },
    deposit: {
      participant_id: ownerId,
      transaction_id: transactionId,
      balance,
    },
  })
}

async function withdrawFromUserWalletAccountResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  ownerId: string,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return resourceError('Invalid reference_id: must be 1-255 alphanumeric characters', 400, {}, 'invalid_reference_id')
  }

  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return resourceOk(
      {
        success: false,
        idempotent: true,
        error: 'Duplicate reference_id',
        error_code: 'duplicate_reference_id',
        transaction_id: duplicate.id,
      },
      409,
    )
  }

  const { data: result, error: rpcError } = await supabase.rpc('wallet_withdraw_atomic', {
    p_ledger_id: ledger.id,
    p_user_id: ownerId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_description: body.description || null,
    p_metadata: body.metadata || {},
  })

  if (rpcError) {
    return mapWalletRpcError(rpcError, ledger.id, referenceId, supabase)
  }

  const row = Array.isArray(result) ? result[0] : result
  const transactionId = row?.out_transaction_id
  const balance = Number(row?.out_wallet_balance ?? 0)

  // Risk signals: rapid topup-withdraw pattern + large transaction
  if (ledger.organization_id) {
    void checkRapidTopupWithdraw(supabase, ledger.id, ledger.organization_id, ownerId, 'withdrawal', transactionId, referenceId)
    void checkLargeTransaction(supabase, ledger.id, ledger.organization_id, amount, 'withdrawal', referenceId, transactionId)
  }

  await createAuditLog(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_withdraw',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      owner_id: ownerId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 30,
  }, requestId)

  return resourceOk({
    success: true,
    withdrawal: {
      participant_id: ownerId,
      transaction_id: transactionId,
      balance,
    },
  })
}

export async function topUpWalletByIdResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  walletId: string,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const walletUuid = validateUUID(walletId)
  if (!walletUuid) {
    return resourceError('wallet_id must be a UUID', 400, {}, 'invalid_wallet_id')
  }

  const account = await getWalletAccountById(supabase, ledger.id, walletUuid)
  if (!account) {
    return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
  }

  const wallet = buildWalletResource(account)
  if (wallet.wallet_type !== 'consumer_credit' || wallet.topup_supported !== true || !account.entity_id) {
    return resourceError('Only consumer_credit wallets support topups', 400, {}, 'wallet_not_topupable')
  }

  return depositToUserWalletAccountResponse(req, supabase, ledger, account.entity_id, body, requestId)
}

export async function withdrawFromWalletByIdResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  walletId: string,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const walletUuid = validateUUID(walletId)
  if (!walletUuid) {
    return resourceError('wallet_id must be a UUID', 400, {}, 'invalid_wallet_id')
  }

  const account = await getWalletAccountById(supabase, ledger.id, walletUuid)
  if (!account) {
    return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
  }

  const wallet = buildWalletResource(account)
  if (wallet.redeemable !== true || !account.entity_id) {
    return resourceError('This wallet is not redeemable. Use payouts for creator earnings wallets.', 400, {}, 'wallet_not_redeemable')
  }

  if (wallet.wallet_type !== 'consumer_credit') {
    return resourceError('Wallet withdrawals are not supported for this wallet type', 400, {}, 'wallet_withdrawal_not_supported')
  }

  return withdrawFromUserWalletAccountResponse(req, supabase, ledger, account.entity_id, body, requestId)
}

export async function getWalletBalanceResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  _requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  const account = await getLegacyWalletAccountByOwnerId(supabase, ledger.id, participantId)

  return resourceOk({
    success: true,
    wallet: {
      participant_id: participantId,
      balance: account ? Number(account.balance) : 0,
      wallet_exists: !!account,
      account: account
        ? {
            id: account.id,
            participant_id: account.entity_id,
            name: account.name,
            is_active: account.is_active,
            created_at: account.created_at,
          }
        : null,
    },
  })
}

export async function depositToWalletResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  return depositToUserWalletAccountResponse(req, supabase, ledger, participantId, body, requestId)
}

export async function withdrawFromWalletResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  return withdrawFromUserWalletAccountResponse(req, supabase, ledger, participantId, body, requestId)
}

export async function transferWalletFundsResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  let fromParticipantId: string | null = null
  let toParticipantId: string | null = null

  const fromWalletId = body.from_wallet_id ? validateUUID(body.from_wallet_id) : null
  const toWalletId = body.to_wallet_id ? validateUUID(body.to_wallet_id) : null

  if ((body.from_wallet_id || body.to_wallet_id) && (!fromWalletId || !toWalletId)) {
    return resourceError('from_wallet_id and to_wallet_id must both be valid UUIDs', 400, {}, 'invalid_wallet_id')
  }

  if (fromWalletId && toWalletId) {
    const fromWallet = await getWalletAccountById(supabase, ledger.id, fromWalletId)
    const toWallet = await getWalletAccountById(supabase, ledger.id, toWalletId)

    if (!fromWallet || !toWallet) {
      return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
    }

    const fromWalletResource = buildWalletResource(fromWallet)
    const toWalletResource = buildWalletResource(toWallet)

    if (fromWallet.account_type !== 'user_wallet' || toWallet.account_type !== 'user_wallet') {
      return resourceError('Transfers currently support consumer_credit wallets only', 400, {}, 'wallet_transfer_not_supported')
    }

    if (fromWalletResource.transferable !== true || toWalletResource.transferable !== true) {
      return resourceError('One or both wallets are not transferable', 400, {}, 'wallet_not_transferable')
    }

    fromParticipantId = fromWallet.entity_id
    toParticipantId = toWallet.entity_id
  } else {
    fromParticipantId = validateId(body.from_participant_id, 100)
    if (!fromParticipantId) {
      return resourceError('Invalid from_participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_from_participant_id')
    }

    toParticipantId = validateId(body.to_participant_id, 100)
    if (!toParticipantId) {
      return resourceError('Invalid to_participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_to_participant_id')
    }
  }

  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return resourceError('Invalid reference_id: must be 1-255 alphanumeric characters', 400, {}, 'invalid_reference_id')
  }

  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return resourceOk(
      {
        success: false,
        idempotent: true,
        error: 'Duplicate reference_id',
        error_code: 'duplicate_reference_id',
        transaction_id: duplicate.id,
      },
      409,
    )
  }

  const { data: result, error: rpcError } = await supabase.rpc('wallet_transfer_atomic', {
    p_ledger_id: ledger.id,
    p_from_user_id: fromParticipantId,
    p_to_user_id: toParticipantId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_description: body.description || null,
    p_metadata: body.metadata || {},
  })

  if (rpcError) {
    return mapWalletRpcError(rpcError, ledger.id, referenceId, supabase)
  }

  const row = Array.isArray(result) ? result[0] : result
  const transactionId = row?.out_transaction_id
  const fromBalance = Number(row?.out_from_balance ?? 0)
  const toBalance = Number(row?.out_to_balance ?? 0)

  await createAuditLog(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_transfer',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      from_participant_id: fromParticipantId,
      to_participant_id: toParticipantId,
      from_wallet_id: fromWalletId,
      to_wallet_id: toWalletId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 30,
  }, requestId)

  return resourceOk({
    success: true,
    transfer: {
      transaction_id: transactionId,
      from_participant_id: fromParticipantId,
      to_participant_id: toParticipantId,
      from_wallet_id: fromWalletId,
      to_wallet_id: toWalletId,
      from_balance: fromBalance,
      to_balance: toBalance,
    },
  })
}

export async function listWalletEntriesResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  const account = await getLegacyWalletAccountByOwnerId(supabase, ledger.id, participantId)
  if (!account) {
    return resourceOk({ success: true, entries: [], total: 0, limit: validateInteger(body.limit, 1, 100) ?? 25, offset: validateInteger(body.offset, 0, 100000) ?? 0 })
  }

  return listWalletEntriesByIdResponse(_req, supabase, ledger, account.id, body, requestId)
}

async function mapWalletRpcError(
  rpcError: any,
  ledgerId: string,
  referenceId: string,
  supabase: SupabaseClient,
): Promise<ResourceResult> {
  const message = String(rpcError.message || '')
  const lower = message.toLowerCase()
  const code = rpcError.code || ''

  if (code === '23505' || lower.includes('unique') || lower.includes('duplicate')) {
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledgerId)
      .eq('reference_id', referenceId)
      .single()

    return resourceOk({
      success: false,
      idempotent: true,
      error: 'Duplicate reference_id',
      error_code: 'duplicate_reference_id',
      transaction_id: existingTx?.id,
    }, 409)
  }

  if (lower.includes('insufficient wallet balance')) {
    return resourceOk({ success: false, error: 'Insufficient balance', error_code: 'insufficient_balance' }, 422)
  }

  if (lower.includes('wallet not found') || lower.includes('sender wallet not found')) {
    return resourceOk({ success: false, error: 'Wallet not found', error_code: 'wallet_not_found' }, 404)
  }

  if (lower.includes('must be positive')) {
    return resourceError('Amount must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  if (lower.includes('cannot transfer to self')) {
    return resourceError('Cannot transfer to self', 400, {}, 'transfer_to_self')
  }

  if (lower.includes('wallet balance cannot be negative')) {
    return resourceOk({ success: false, error: 'Insufficient balance', error_code: 'insufficient_balance' }, 422)
  }

  console.error('Wallet RPC error:', rpcError)
  return resourceError('Wallet operation failed', 500, {}, 'wallet_operation_failed')
}

// ============================================================================
// WALLET PURCHASE (atomic: wallet debit + sale recording + creator split)
// ============================================================================

const MIN_TOPUP_CENTS = 1000 // $10.00 minimum wallet top-up

export interface WalletPurchaseRequest {
  amount?: number           // Purchase amount in cents
  reference_id?: string     // Idempotency key
  creator_id?: string       // Creator/author receiving the split
  creator_percent?: number  // Creator's share (0-100)
  product_id?: string       // Product identifier
  product_name?: string     // Product display name
  description?: string
  metadata?: Record<string, unknown>
}

export async function purchaseFromWalletByIdResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  walletId: string,
  body: WalletPurchaseRequest,
  requestId: string,
): Promise<ResourceResult> {
  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return resourceError('Invalid reference_id', 400, {}, 'invalid_reference_id')
  }

  const creatorId = validateId(body.creator_id, 100)
  if (!creatorId) {
    return resourceError('Invalid creator_id', 400, {}, 'invalid_creator_id')
  }

  const creatorPercent = typeof body.creator_percent === 'number' ? body.creator_percent : 80
  if (creatorPercent < 0 || creatorPercent > 100) {
    return resourceError('creator_percent must be 0-100', 400, {}, 'invalid_creator_percent')
  }

  // Idempotency check
  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return resourceOk({
      success: false,
      idempotent: true,
      error: 'Duplicate reference_id',
      error_code: 'duplicate_reference_id',
      transaction_id: duplicate.id,
    }, 409)
  }

  // Fetch wallet and validate
  const { data: wallet } = await supabase
    .from('accounts')
    .select('id, entity_id, metadata, balance')
    .eq('id', walletId)
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .eq('is_active', true)
    .single()

  if (!wallet) {
    return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
  }

  const walletMeta = (wallet.metadata || {}) as Record<string, unknown>
  if (walletMeta.redeemable === false) {
    return resourceError('Wallet is not redeemable. Top up with at least $10 first.', 422, {}, 'wallet_not_redeemable')
  }

  // Check wallet balance
  const { data: balanceEntries } = await supabase
    .from('entries')
    .select('entry_type, amount, transactions!inner(status)')
    .eq('account_id', walletId)
    .not('transactions.status', 'in', '("voided","reversed")')

  let walletBalance = 0
  for (const e of balanceEntries || []) {
    walletBalance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
  }
  const walletBalanceCents = Math.round(walletBalance * 100)

  if (walletBalanceCents < amount) {
    return resourceOk({
      success: false,
      error: `Insufficient balance. Available: $${(walletBalanceCents / 100).toFixed(2)}, Required: $${(amount / 100).toFixed(2)}`,
      error_code: 'insufficient_balance',
      available_cents: walletBalanceCents,
      required_cents: amount,
    }, 422)
  }

  // Step 1: Record the sale (creator split)
  const { data: splitResult, error: splitError } = await supabase.rpc('calculate_sale_split', {
    p_gross_cents: amount,
    p_creator_percent: creatorPercent,
    p_processing_fee_cents: 0,
  })

  if (splitError || !splitResult?.[0]) {
    return resourceError('Failed to calculate split', 500, {}, 'split_calculation_failed')
  }

  const split = splitResult[0]

  const { data: saleResult, error: saleError } = await supabase.rpc('record_sale_atomic', {
    p_ledger_id: ledger.id,
    p_reference_id: referenceId,
    p_creator_id: creatorId,
    p_gross_amount: amount,
    p_creator_amount: split.creator_cents,
    p_platform_amount: split.platform_cents,
    p_processing_fee: 0,
    p_product_id: body.product_id || null,
    p_product_name: body.product_name || null,
    p_metadata: {
      ...(body.metadata || {}),
      payment_source: 'wallet',
      wallet_id: walletId,
      buyer_id: wallet.entity_id,
    },
  })

  if (saleError) {
    const msg = String(saleError.message || '')
    if (saleError.code === '23505' || msg.includes('duplicate')) {
      return resourceOk({
        success: false,
        idempotent: true,
        error: 'Duplicate reference_id',
        error_code: 'duplicate_reference_id',
      }, 409)
    }
    console.error(`[${requestId}] Sale recording failed:`, saleError)
    return resourceError('Failed to record sale', 500, {}, 'sale_recording_failed')
  }

  const saleRow = Array.isArray(saleResult) ? saleResult[0] : saleResult
  const saleTransactionId = saleRow?.out_transaction_id

  // Step 2: Debit the wallet
  const withdrawRef = `${referenceId}_wallet_debit`
  const { data: withdrawResult, error: withdrawError } = await supabase.rpc('wallet_withdraw_atomic', {
    p_ledger_id: ledger.id,
    p_user_id: wallet.entity_id,
    p_amount: amount,
    p_reference_id: withdrawRef,
    p_description: body.description || `Purchase: ${body.product_name || body.product_id || referenceId}`,
    p_metadata: {
      purchase_reference: referenceId,
      sale_transaction_id: saleTransactionId,
      product_id: body.product_id,
    },
  })

  if (withdrawError) {
    // Sale was recorded but wallet debit failed — void the sale
    console.error(`[${requestId}] Wallet debit failed after sale — voiding sale:`, withdrawError)
    try {
      await supabase.rpc('void_transaction_atomic', {
        p_ledger_id: ledger.id,
        p_transaction_id: saleTransactionId,
        p_reason: `Wallet debit failed: ${withdrawError.message}`,
      })
    } catch { /* best-effort void */ }

    return mapWalletRpcError(withdrawError, ledger.id, withdrawRef, supabase)
  }

  const withdrawRow = Array.isArray(withdrawResult) ? withdrawResult[0] : withdrawResult
  const newBalance = Number(withdrawRow?.out_wallet_balance ?? 0)

  // Risk signal: large wallet purchase
  if (ledger.organization_id) {
    void checkLargeTransaction(supabase, ledger.id, ledger.organization_id, amount, 'wallet_purchase', referenceId, saleTransactionId)
  }

  // Recalculate creator risk score after every wallet purchase (mandatory)
  void supabase.rpc('update_creator_risk_score', {
    p_ledger_id: ledger.id,
    p_creator_id: creatorId,
  }).catch(() => {})

  // Step 3: Create transaction graph edge (purchase → sale)
  const { autoLinkTransaction } = await import('./transaction-graph.ts')
  void autoLinkTransaction(supabase, ledger.id, {
    id: saleTransactionId,
    transaction_type: 'sale',
    metadata: { wallet_purchase: true },
  })

  // Audit log
  await createAuditLog(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_purchase',
    entity_type: 'transaction',
    entity_id: saleTransactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      wallet_id: walletId,
      buyer_id: wallet.entity_id,
      creator_id: creatorId,
      amount_cents: amount,
      creator_cents: split.creator_cents,
      platform_cents: split.platform_cents,
      product_id: body.product_id,
    }),
    response_status: 200,
    risk_score: 15,
  }, requestId)

  return resourceOk({
    success: true,
    purchase: {
      transaction_id: saleTransactionId,
      reference_id: referenceId,
      amount_cents: amount,
      creator_id: creatorId,
      creator_amount_cents: split.creator_cents,
      platform_amount_cents: split.platform_cents,
      wallet_id: walletId,
      wallet_balance_cents: Math.round(newBalance * 100),
      product_id: body.product_id || null,
      product_name: body.product_name || null,
    },
  })
}

async function checkDuplicateReference(
  supabase: SupabaseClient,
  ledgerId: string,
  referenceId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('reference_id', referenceId)
    .maybeSingle()

  return data
}
