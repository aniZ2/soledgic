// SERVICE_ID: SVC_CREDITS
// Soledgic Edge Function: Virtual Credit System
// POST /credits — Issue, redeem, convert, and check credit balances
//
// STANDARD RATE: 1000 credits = $1 USD (enforced globally, not per-platform)
//
// Accounting model:
//   Issue:   DR platform_marketing_expense → CR credits_liability (liability at issuance)
//   Convert: DR credits_liability → CR user_spendable_balance (min $5 / 5000 credits)
//   Redeem:  DR user_spendable_balance → CR creator_balance + CR platform_revenue (via split)
//   Payout:  Existing payout flow (creator_balance → cash)
//
// Users can spend credits in-app. Users CANNOT withdraw credits as cash.
// Only creators receive real payouts — from revenue (real or credit-funded).
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

// ============================================================================
// SOLEDGIC STANDARD: Fixed conversion rate. No per-platform overrides.
// ============================================================================
const CREDITS_PER_DOLLAR = 1000
const MIN_CONVERSION_CREDITS = 5000 // $5 minimum to convert to spendable balance

function creditsToUsd(credits: number): number {
  return Math.round((credits / CREDITS_PER_DOLLAR) * 100) / 100
}

function creditsToUsdCents(credits: number): number {
  return Math.round((credits / CREDITS_PER_DOLLAR) * 100)
}

const handler = createHandler(
  { endpoint: 'credits', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger, body, { requestId }) => {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const action = body?.action
    if (!action || !['issue', 'convert', 'redeem', 'balance'].includes(action)) {
      return errorResponse('action must be issue, convert, redeem, or balance', 400, req, requestId)
    }

    // ── Balance check ──────────────────────────────────────────────
    if (action === 'balance') {
      const userId = validateId(body.user_id, 100)
      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)

      // Credit balance = sum of liability entries tagged with this user (issued - converted)
      // Spendable balance = sum of user_spendable_balance entries
      const result: Record<string, unknown> = {
        success: true,
        user_id: userId,
        credits: 0,
        credits_usd_value: 0,
        spendable_usd: 0,
        conversion_rate: `${CREDITS_PER_DOLLAR} credits = $1`,
      }

      // Get liability account for credit balance
      const { data: liabilityAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', ledger!.id)
        .eq('account_type', 'credits_liability')
        .maybeSingle()

      if (liabilityAccount) {
        // Sum liability entries for this user (credits from issue, debits from convert)
        const { data: liabilityEntries } = await supabase
          .from('entries')
          .select('entry_type, amount, transactions!inner(status, metadata)')
          .eq('account_id', liabilityAccount.id)
          .eq('transactions.status', 'completed')

        let creditBal = 0
        for (const e of liabilityEntries || []) {
          const txnMeta = (e as any).transactions?.metadata
          if (txnMeta?.user_id !== userId) continue
          creditBal += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
        }
        creditBal = Math.round(creditBal * 100) / 100
        result.credits = Math.round(creditBal * CREDITS_PER_DOLLAR)
        result.credits_usd_value = creditBal
      }

      // Get spendable balance account
      const { data: spendableAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', ledger!.id)
        .eq('account_type', 'user_spendable_balance')
        .eq('entity_id', userId)
        .maybeSingle()

      if (spendableAccount) {
        const { data: spendableEntries } = await supabase
          .from('entries')
          .select('entry_type, amount, transactions!inner(status)')
          .eq('account_id', spendableAccount.id)
          .eq('transactions.status', 'completed')

        let spendBal = 0
        for (const e of spendableEntries || []) {
          spendBal += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
        }
        result.spendable_usd = Math.round(spendBal * 100) / 100
      }

      return jsonResponse(result, 200, req, requestId)
    }

    // ── Issue credits (liability at issuance) ──────────────────────
    if (action === 'issue') {
      const userId = validateId(body.user_id, 100)
      const credits = typeof body.credits === 'number' ? Math.round(body.credits) : null
      const reason = body.reason ? validateString(body.reason, 200) : 'engagement_reward'
      const referenceId = body.reference_id ? validateId(body.reference_id, 255) : null

      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)
      if (!credits || credits <= 0) return errorResponse('credits must be a positive integer', 400, req, requestId)

      // Convert credits to cents for the RPC (ledger stores USD)
      const amountCents = creditsToUsdCents(credits)
      if (amountCents <= 0) return errorResponse('Credit amount too small', 400, req, requestId)

      const { data: rpcResult, error: rpcError } = await supabase.rpc('issue_credits', {
        p_ledger_id: ledger!.id,
        p_user_id: userId,
        p_amount_cents: amountCents,
        p_reason: reason,
        p_reference_id: referenceId,
      })

      if (rpcError) return errorResponse(rpcError.message, 500, req, requestId)

      if (!rpcResult?.success) {
        return jsonResponse({
          success: false,
          error: rpcResult?.error || 'Failed to issue credits',
          ...(rpcResult?.budget_cents !== undefined ? {
            budget_remaining_usd: (rpcResult.budget_cents - rpcResult.issued_cents) / 100,
          } : {}),
        }, 400, req, requestId)
      }

      createAuditLogAsync(supabase, req, {
        ledger_id: ledger!.id,
        action: 'credits_issued',
        entity_type: 'user',
        entity_id: userId,
        actor_type: 'api',
        request_body: sanitizeForAudit({ user_id: userId, credits, usd_value: creditsToUsd(credits), reason }),
        response_status: 200,
        risk_score: 20,
      }, requestId)

      return jsonResponse({
        success: true,
        user_id: userId,
        credits_issued: credits,
        usd_value: creditsToUsd(credits),
        transaction_id: rpcResult.transaction_id,
        budget_remaining_cents: rpcResult.budget_remaining_cents,
      }, 200, req, requestId)
    }

    // ── Convert credits to spendable balance ($5 minimum) ──────────
    if (action === 'convert') {
      const userId = validateId(body.user_id, 100)
      const credits = typeof body.credits === 'number' ? Math.round(body.credits) : null

      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)
      if (!credits || credits < MIN_CONVERSION_CREDITS) {
        return errorResponse(
          `Minimum conversion is ${MIN_CONVERSION_CREDITS} credits ($${MIN_CONVERSION_CREDITS / CREDITS_PER_DOLLAR})`,
          400, req, requestId,
        )
      }

      const amountCents = creditsToUsdCents(credits)

      // Atomic RPC: balanced double-entry (DR wallet, CR spendable)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('convert_credits', {
        p_ledger_id: ledger!.id,
        p_user_id: userId,
        p_amount_cents: amountCents,
        p_min_conversion_cents: creditsToUsdCents(MIN_CONVERSION_CREDITS),
      })

      if (rpcError) return errorResponse(rpcError.message, 500, req, requestId)

      if (!rpcResult?.success) {
        return jsonResponse({
          success: false,
          error: rpcResult?.error || 'Failed to convert credits',
          ...(rpcResult?.balance_cents !== undefined ? {
            credits_available: rpcResult.balance_cents,
          } : {}),
        }, 400, req, requestId)
      }

      createAuditLogAsync(supabase, req, {
        ledger_id: ledger!.id,
        action: 'credits_converted',
        entity_type: 'user',
        entity_id: userId,
        actor_type: 'api',
        request_body: sanitizeForAudit({ user_id: userId, credits, usd_amount: rpcResult.spendable_usd }),
        response_status: 200,
        risk_score: 25,
      }, requestId)

      return jsonResponse({
        success: true,
        user_id: userId,
        credits_converted: credits,
        spendable_usd: rpcResult.spendable_usd,
        transaction_id: rpcResult.transaction_id,
      }, 200, req, requestId)
    }

    // ── Redeem (spend spendable balance on creator content) ────────
    if (action === 'redeem') {
      const userId = validateId(body.user_id, 100)
      const creatorId = validateId(body.creator_id || body.participant_id, 100)
      const amount = validateAmount(body.amount) // cents
      const referenceId = body.reference_id ? validateId(body.reference_id, 255) : null
      const description = body.description ? validateString(body.description, 500) : 'Credit redemption'

      if (!userId) return errorResponse('Invalid user_id', 400, req, requestId)
      if (!creatorId) return errorResponse('Invalid creator_id', 400, req, requestId)
      if (amount === null || amount <= 0) return errorResponse('amount must be a positive integer (cents)', 400, req, requestId)
      if (!referenceId) return errorResponse('reference_id is required', 400, req, requestId)

      const { data: rpcResult, error: rpcError } = await supabase.rpc('redeem_credits', {
        p_ledger_id: ledger!.id,
        p_user_id: userId,
        p_creator_id: creatorId,
        p_amount_cents: amount,
        p_reference_id: referenceId,
        p_description: description,
        p_split_percent: typeof body.split_percent === 'number' ? body.split_percent : null,
      })

      if (rpcError) return errorResponse(rpcError.message, 500, req, requestId)

      if (!rpcResult?.success) {
        return jsonResponse({
          success: false,
          error: rpcResult?.error || 'Failed to redeem',
          ...(rpcResult?.balance !== undefined ? { spendable_balance: rpcResult.balance } : {}),
        }, 400, req, requestId)
      }

      createAuditLogAsync(supabase, req, {
        ledger_id: ledger!.id,
        action: 'credits_redeemed',
        entity_type: 'user',
        entity_id: userId,
        actor_type: 'api',
        request_body: sanitizeForAudit({ user_id: userId, creator_id: creatorId, amount, reference_id: referenceId }),
        response_status: 200,
        risk_score: 30,
      }, requestId)

      return jsonResponse(rpcResult, 200, req, requestId)
    }

    return errorResponse('Invalid action', 400, req, requestId)
  },
)

Deno.serve(handler)
