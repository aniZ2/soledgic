// SERVICE_ID: SVC_CREDITS
// Soledgic Edge Function: Virtual Credit System
// POST /credits — Issue credits and redeem credits for purchases
//
// Accounting model:
//   Issue:  DR platform_marketing_expense → CR credits_liability + CR user_wallet
//   Redeem: DR user_wallet + DR credits_liability → CR creator_balance + CR platform_revenue
//
// Budget enforcement: monthly credit_budget_monthly_cents per org.

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  validateAmount,
  validateString,
  createAuditLogAsync,
  sanitizeForAudit,
} from '../_shared/utils.ts'

const handler = createHandler(
  { endpoint: 'credits', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger, body, { requestId }) => {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const action = body?.action
    if (!action || !['issue', 'redeem', 'balance'].includes(action)) {
      return errorResponse('action must be issue, redeem, or balance', 400, req, requestId)
    }

    if (action === 'balance') {
      const userId = validateId(body.user_id, 100)
      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)

      const { data: wallet } = await supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', ledger!.id)
        .eq('account_type', 'user_wallet')
        .eq('entity_id', userId)
        .maybeSingle()

      if (!wallet) {
        return jsonResponse({ success: true, user_id: userId, balance: 0, balance_cents: 0 }, 200, req, requestId)
      }

      const { data: entries } = await supabase
        .from('entries')
        .select('entry_type, amount, transactions!inner(status)')
        .eq('account_id', wallet.id)
        .eq('transactions.status', 'completed')

      let balance = 0
      for (const e of entries || []) {
        balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
      }
      balance = Math.round(balance * 100) / 100

      return jsonResponse({
        success: true,
        user_id: userId,
        balance,
        balance_cents: Math.round(balance * 100),
      }, 200, req, requestId)
    }

    if (action === 'issue') {
      const userId = validateId(body.user_id, 100)
      const amount = validateAmount(body.amount)
      const reason = body.reason ? validateString(body.reason, 200) : 'engagement_reward'
      const referenceId = body.reference_id ? validateId(body.reference_id, 255) : null

      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)
      if (amount === null || amount <= 0) return errorResponse('amount must be a positive integer (cents)', 400, req, requestId)

      const { data: result, error: rpcError } = await supabase.rpc('issue_credits', {
        p_ledger_id: ledger!.id,
        p_user_id: userId,
        p_amount_cents: amount,
        p_reason: reason,
        p_reference_id: referenceId,
      })

      if (rpcError) {
        return errorResponse(rpcError.message, 500, req, requestId)
      }

      if (!result?.success) {
        return jsonResponse({
          success: false,
          error: result?.error || 'Failed to issue credits',
          ...(result?.budget_cents !== undefined ? {
            budget_cents: result.budget_cents,
            issued_cents: result.issued_cents,
          } : {}),
        }, 400, req, requestId)
      }

      createAuditLogAsync(supabase, req, {
        ledger_id: ledger!.id,
        action: 'credits_issued',
        entity_type: 'user',
        entity_id: userId,
        actor_type: 'api',
        request_body: sanitizeForAudit({ user_id: userId, amount, reason }),
        response_status: 200,
        risk_score: 20,
      }, requestId)

      return jsonResponse(result, 200, req, requestId)
    }

    if (action === 'redeem') {
      const userId = validateId(body.user_id, 100)
      const creatorId = validateId(body.creator_id || body.participant_id, 100)
      const amount = validateAmount(body.amount)
      const referenceId = body.reference_id ? validateId(body.reference_id, 255) : null
      const description = body.description ? validateString(body.description, 500) : 'Credit redemption'

      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)
      if (!creatorId) return errorResponse('Invalid creator_id', 400, req, requestId)
      if (amount === null || amount <= 0) return errorResponse('amount must be a positive integer (cents)', 400, req, requestId)
      if (!referenceId) return errorResponse('reference_id is required', 400, req, requestId)

      const { data: result, error: rpcError } = await supabase.rpc('redeem_credits', {
        p_ledger_id: ledger!.id,
        p_user_id: userId,
        p_creator_id: creatorId,
        p_amount_cents: amount,
        p_reference_id: referenceId,
        p_description: description,
        p_split_percent: typeof body.split_percent === 'number' ? body.split_percent : null,
      })

      if (rpcError) {
        return errorResponse(rpcError.message, 500, req, requestId)
      }

      if (!result?.success) {
        return jsonResponse({
          success: false,
          error: result?.error || 'Failed to redeem credits',
          ...(result?.balance !== undefined ? { balance: result.balance } : {}),
        }, 400, req, requestId)
      }

      createAuditLogAsync(supabase, req, {
        ledger_id: ledger!.id,
        action: 'credits_redeemed',
        entity_type: 'user',
        entity_id: userId,
        actor_type: 'api',
        request_body: sanitizeForAudit({
          user_id: userId, creator_id: creatorId, amount, reference_id: referenceId,
        }),
        response_status: 200,
        risk_score: 30,
      }, requestId)

      return jsonResponse(result, 200, req, requestId)
    }

    return errorResponse('Invalid action', 400, req, requestId)
  },
)

Deno.serve(handler)
