import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateId,
  validateInteger,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

export interface WalletMutationRequest {
  participant_id?: string
  from_participant_id?: string
  to_participant_id?: string
  amount?: number
  reference_id?: string
  description?: string
  metadata?: Record<string, unknown>
  limit?: number
  offset?: number
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

  const { data: account } = await supabase
    .from('accounts')
    .select('id, balance, entity_id, name, is_active, created_at')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .eq('entity_id', participantId)
    .maybeSingle()

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

  const { data: result, error: rpcError } = await supabase.rpc('wallet_deposit_atomic', {
    p_ledger_id: ledger.id,
    p_user_id: participantId,
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

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_deposit',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      participant_id: participantId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 20,
  }, requestId)

  return resourceOk({
    success: true,
    deposit: {
      participant_id: participantId,
      transaction_id: transactionId,
      balance,
    },
  })
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
    p_user_id: participantId,
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

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_withdraw',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      participant_id: participantId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 30,
  }, requestId)

  return resourceOk({
    success: true,
    withdrawal: {
      participant_id: participantId,
      transaction_id: transactionId,
      balance,
    },
  })
}

export async function transferWalletFundsResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<ResourceResult> {
  const fromParticipantId = validateId(body.from_participant_id, 100)
  if (!fromParticipantId) {
    return resourceError('Invalid from_participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_from_participant_id')
  }

  const toParticipantId = validateId(body.to_participant_id, 100)
  if (!toParticipantId) {
    return resourceError('Invalid to_participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_to_participant_id')
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

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'wallet_transfer',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      from_participant_id: fromParticipantId,
      to_participant_id: toParticipantId,
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
  _requestId: string,
): Promise<ResourceResult> {
  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  const limit = validateInteger(body.limit, 1, 100) ?? 25
  const offset = validateInteger(body.offset, 0, 100000) ?? 0

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .eq('entity_id', participantId)
    .maybeSingle()

  if (!account) {
    return resourceOk({ success: true, entries: [], total: 0, limit, offset })
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
    .eq('account_id', account.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entriesError) {
    console.error('Failed to fetch wallet history:', entriesError)
    return resourceError('Failed to fetch wallet history', 500, {}, 'wallet_history_fetch_failed')
  }

  const { count } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.id)

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
    entries: transactions,
    total: count ?? 0,
    limit,
    offset,
  })
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

  if (lower.includes('wallet not found')) {
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
