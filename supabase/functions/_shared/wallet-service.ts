import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  errorResponse,
  jsonResponse,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateId,
  validateInteger,
} from './utils.ts'

export interface WalletMutationRequest {
  user_id?: string
  from_user_id?: string
  to_user_id?: string
  amount?: number
  reference_id?: string
  description?: string
  metadata?: Record<string, unknown>
  limit?: number
  offset?: number
}

export async function getWalletBalanceResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<Response> {
  const userId = validateId(body.user_id, 100)
  if (!userId) {
    return errorResponse('Invalid user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('id, balance, entity_id, name, is_active, created_at')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .eq('entity_id', userId)
    .maybeSingle()

  return jsonResponse({
    success: true,
    balance: account ? Number(account.balance) : 0,
    wallet_exists: !!account,
    account: account
      ? {
          id: account.id,
          entity_id: account.entity_id,
          name: account.name,
          is_active: account.is_active,
          created_at: account.created_at,
        }
      : null,
  }, 200, req, requestId)
}

export async function depositToWalletResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<Response> {
  const userId = validateId(body.user_id, 100)
  if (!userId) {
    return errorResponse('Invalid user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req, requestId)
  }

  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return jsonResponse(
      { success: false, idempotent: true, error: 'Duplicate reference_id', transaction_id: duplicate.id },
      409,
      req,
      requestId,
    )
  }

  const { data: result, error: rpcError } = await supabase.rpc('wallet_deposit_atomic', {
    p_ledger_id: ledger.id,
    p_user_id: userId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_description: body.description || null,
    p_metadata: body.metadata || {},
  })

  if (rpcError) {
    return mapWalletRpcError(rpcError, req, requestId, ledger.id, referenceId, supabase)
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
      user_id: userId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 20,
  }, requestId)

  return jsonResponse({
    success: true,
    transaction_id: transactionId,
    balance,
  }, 200, req, requestId)
}

export async function withdrawFromWalletResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<Response> {
  const userId = validateId(body.user_id, 100)
  if (!userId) {
    return errorResponse('Invalid user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req, requestId)
  }

  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return jsonResponse(
      { success: false, idempotent: true, error: 'Duplicate reference_id', transaction_id: duplicate.id },
      409,
      req,
      requestId,
    )
  }

  const { data: result, error: rpcError } = await supabase.rpc('wallet_withdraw_atomic', {
    p_ledger_id: ledger.id,
    p_user_id: userId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_description: body.description || null,
    p_metadata: body.metadata || {},
  })

  if (rpcError) {
    return mapWalletRpcError(rpcError, req, requestId, ledger.id, referenceId, supabase)
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
      user_id: userId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 30,
  }, requestId)

  return jsonResponse({
    success: true,
    transaction_id: transactionId,
    balance,
  }, 200, req, requestId)
}

export async function transferWalletFundsResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<Response> {
  const fromUserId = validateId(body.from_user_id, 100)
  if (!fromUserId) {
    return errorResponse('Invalid from_user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const toUserId = validateId(body.to_user_id, 100)
  if (!toUserId) {
    return errorResponse('Invalid to_user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
  }

  const referenceId = validateId(body.reference_id, 255)
  if (!referenceId) {
    return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req, requestId)
  }

  const duplicate = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (duplicate) {
    return jsonResponse(
      { success: false, idempotent: true, error: 'Duplicate reference_id', transaction_id: duplicate.id },
      409,
      req,
      requestId,
    )
  }

  const { data: result, error: rpcError } = await supabase.rpc('wallet_transfer_atomic', {
    p_ledger_id: ledger.id,
    p_from_user_id: fromUserId,
    p_to_user_id: toUserId,
    p_amount: amount,
    p_reference_id: referenceId,
    p_description: body.description || null,
    p_metadata: body.metadata || {},
  })

  if (rpcError) {
    return mapWalletRpcError(rpcError, req, requestId, ledger.id, referenceId, supabase)
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
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount_cents: amount,
      reference_id: referenceId,
    }),
    response_status: 200,
    risk_score: 30,
  }, requestId)

  return jsonResponse({
    success: true,
    transaction_id: transactionId,
    from_balance: fromBalance,
    to_balance: toBalance,
  }, 200, req, requestId)
}

export async function listWalletEntriesResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletMutationRequest,
  requestId: string,
): Promise<Response> {
  const userId = validateId(body.user_id, 100)
  if (!userId) {
    return errorResponse('Invalid user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const limit = validateInteger(body.limit, 1, 100) ?? 25
  const offset = validateInteger(body.offset, 0, 100000) ?? 0

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .eq('entity_id', userId)
    .maybeSingle()

  if (!account) {
    return jsonResponse({ success: true, transactions: [], total: 0 }, 200, req, requestId)
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
    return errorResponse('Failed to fetch wallet history', 500, req, requestId)
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

  return jsonResponse({
    success: true,
    transactions,
    total: count ?? 0,
    limit,
    offset,
  }, 200, req, requestId)
}

async function mapWalletRpcError(
  rpcError: any,
  req: Request,
  requestId: string,
  ledgerId: string,
  referenceId: string,
  supabase: SupabaseClient,
): Promise<Response> {
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

    return jsonResponse({
      success: false,
      idempotent: true,
      error: 'Duplicate reference_id',
      transaction_id: existingTx?.id,
    }, 409, req, requestId)
  }

  if (lower.includes('insufficient wallet balance')) {
    return jsonResponse({ success: false, error: 'Insufficient balance' }, 422, req, requestId)
  }

  if (lower.includes('wallet not found')) {
    return jsonResponse({ success: false, error: 'Wallet not found' }, 404, req, requestId)
  }

  if (lower.includes('must be positive')) {
    return errorResponse('Amount must be a positive integer (cents)', 400, req, requestId)
  }

  if (lower.includes('cannot transfer to self')) {
    return errorResponse('Cannot transfer to self', 400, req, requestId)
  }

  if (lower.includes('wallet balance cannot be negative')) {
    return jsonResponse({ success: false, error: 'Insufficient balance' }, 422, req, requestId)
  }

  console.error('Wallet RPC error:', rpcError)
  return errorResponse('Wallet operation failed', 500, req, requestId)
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
