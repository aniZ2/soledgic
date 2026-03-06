// Soledgic Edge Function: Manage Wallet
// POST /manage-wallet
// Action-based routing for wallet operations:
//   get_balance, deposit, withdraw, transfer, history

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateAmount,
  validateId,
  validateInteger,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface WalletRequest {
  action: string
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

const handler = createHandler(
  { endpoint: 'manage-wallet', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: WalletRequest,
    { requestId },
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const { action } = body
    if (!action || typeof action !== 'string') {
      return errorResponse('Missing or invalid action', 400, req, requestId)
    }

    switch (action) {
      case 'get_balance':
        return handleGetBalance(req, supabase, ledger, body, requestId)
      case 'deposit':
        return handleDeposit(req, supabase, ledger, body, requestId)
      case 'withdraw':
        return handleWithdraw(req, supabase, ledger, body, requestId)
      case 'transfer':
        return handleTransfer(req, supabase, ledger, body, requestId)
      case 'history':
        return handleHistory(req, supabase, ledger, body, requestId)
      default:
        return errorResponse(
          `Unknown action: ${action}. Valid actions: get_balance, deposit, withdraw, transfer, history`,
          400,
          req,
          requestId,
        )
    }
  },
)

Deno.serve(handler)

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleGetBalance(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletRequest,
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

  return jsonResponse(
    {
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
    },
    200,
    req,
    requestId,
  )
}

async function handleDeposit(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletRequest,
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

  // Pre-check: if reference_id already exists, return 409 immediately.
  // The RPCs catch unique_violation internally and return normally, so we
  // can't rely on mapRpcError for idempotency detection.
  const dup = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (dup) {
    return jsonResponse(
      { success: false, idempotent: true, error: 'Duplicate reference_id', transaction_id: dup.id },
      409, req, requestId,
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
    return mapRpcError(rpcError, req, requestId, ledger.id, referenceId, supabase)
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

  return jsonResponse(
    {
      success: true,
      transaction_id: transactionId,
      balance,
    },
    200,
    req,
    requestId,
  )
}

async function handleWithdraw(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletRequest,
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

  const dup = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (dup) {
    return jsonResponse(
      { success: false, idempotent: true, error: 'Duplicate reference_id', transaction_id: dup.id },
      409, req, requestId,
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
    return mapRpcError(rpcError, req, requestId, ledger.id, referenceId, supabase)
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

  return jsonResponse(
    {
      success: true,
      transaction_id: transactionId,
      balance,
    },
    200,
    req,
    requestId,
  )
}

async function handleTransfer(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletRequest,
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

  const dup = await checkDuplicateReference(supabase, ledger.id, referenceId)
  if (dup) {
    return jsonResponse(
      { success: false, idempotent: true, error: 'Duplicate reference_id', transaction_id: dup.id },
      409, req, requestId,
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
    return mapRpcError(rpcError, req, requestId, ledger.id, referenceId, supabase)
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

  return jsonResponse(
    {
      success: true,
      transaction_id: transactionId,
      from_balance: fromBalance,
      to_balance: toBalance,
    },
    200,
    req,
    requestId,
  )
}

async function handleHistory(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: WalletRequest,
  requestId: string,
): Promise<Response> {
  const userId = validateId(body.user_id, 100)
  if (!userId) {
    return errorResponse('Invalid user_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const limit = validateInteger(body.limit, 1, 100) ?? 25
  const offset = validateInteger(body.offset, 0, 100000) ?? 0

  // Get wallet account
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'user_wallet')
    .eq('entity_id', userId)
    .maybeSingle()

  if (!account) {
    return jsonResponse(
      { success: true, transactions: [], total: 0 },
      200,
      req,
      requestId,
    )
  }

  // Get entries for this wallet, joined with transactions
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

  // Get total count for pagination
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

  return jsonResponse(
    {
      success: true,
      transactions,
      total: count ?? 0,
      limit,
      offset,
    },
    200,
    req,
    requestId,
  )
}

// ============================================================================
// ERROR MAPPING
// ============================================================================

async function mapRpcError(
  rpcError: any,
  req: Request,
  requestId: string,
  ledgerId: string,
  referenceId: string,
  supabase: SupabaseClient,
): Promise<Response> {
  const msg = rpcError.message || ''
  const msgLower = msg.toLowerCase()
  const code = rpcError.code || ''

  // Idempotent duplicate — fallback if pre-check race allows through
  if (code === '23505' || msgLower.includes('unique') || msgLower.includes('duplicate')) {
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledgerId)
      .eq('reference_id', referenceId)
      .single()

    return jsonResponse(
      {
        success: false,
        idempotent: true,
        error: 'Duplicate reference_id',
        transaction_id: existingTx?.id,
      },
      409,
      req,
      requestId,
    )
  }

  // Insufficient balance
  if (msgLower.includes('insufficient wallet balance')) {
    return jsonResponse(
      { success: false, error: 'Insufficient balance' },
      422,
      req,
      requestId,
    )
  }

  // Wallet not found — covers both "Wallet not found" (withdraw) and
  // "Sender wallet not found" / "recipient wallet" (transfer)
  if (msgLower.includes('wallet not found')) {
    return jsonResponse(
      { success: false, error: 'Wallet not found' },
      404,
      req,
      requestId,
    )
  }

  // Amount validation
  if (msgLower.includes('must be positive')) {
    return errorResponse('Amount must be a positive integer (cents)', 400, req, requestId)
  }

  // Self-transfer
  if (msgLower.includes('cannot transfer to self')) {
    return errorResponse('Cannot transfer to self', 400, req, requestId)
  }

  // Negative balance guard (trigger)
  if (msgLower.includes('wallet balance cannot be negative')) {
    return jsonResponse(
      { success: false, error: 'Insufficient balance' },
      422,
      req,
      requestId,
    )
  }

  console.error('Wallet RPC error:', rpcError)
  return errorResponse('Wallet operation failed', 500, req, requestId)
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Pre-check for duplicate reference_id before calling the RPC.
 * The wallet RPCs catch unique_violation internally and return the existing
 * transaction as a normal result, so we can't rely on rpcError for 409 detection.
 */
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
