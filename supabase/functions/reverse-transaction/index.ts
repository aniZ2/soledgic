// SERVICE_ID: SVC_REVERSAL_ENGINE
// Soledgic Edge Function: Reverse Transaction
// POST /reverse-transaction
// Handles transaction deletion/reversal based on state:
// - Draft (unreconciled): Soft delete (mark as voided)
// - Reconciled: Create reversing entries
// - Locked period: 403 error
// SECURITY HARDENED VERSION

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateId,
  validateAmount,
  validateString,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ReversalRequest {
  transaction_id: string
  reason: string
  partial_amount?: number
  idempotency_key?: string
  metadata?: Record<string, any>
}

function centsFromMajor(amount: unknown): number {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}

async function syncSaleRefundStateAfterRefundReversal(
  supabase: SupabaseClient,
  ledgerId: string,
  refundTransaction: { reverses?: string | null },
): Promise<void> {
  const originalSaleId =
    typeof refundTransaction.reverses === 'string' && refundTransaction.reverses.length > 0
      ? refundTransaction.reverses
      : null

  if (!originalSaleId) {
    return
  }

  const { data: originalSale, error: saleError } = await supabase
    .from('transactions')
    .select('id, amount, status, reversed_by')
    .eq('ledger_id', ledgerId)
    .eq('id', originalSaleId)
    .eq('transaction_type', 'sale')
    .maybeSingle()

  if (saleError || !originalSale || originalSale.status !== 'reversed') {
    return
  }

  const reversedById = typeof originalSale.reversed_by === 'string' ? originalSale.reversed_by : null
  if (!reversedById) {
    return
  }

  const { data: reversedByTx, error: reversedByError } = await supabase
    .from('transactions')
    .select('transaction_type')
    .eq('ledger_id', ledgerId)
    .eq('id', reversedById)
    .maybeSingle()

  if (reversedByError || reversedByTx?.transaction_type !== 'refund') {
    return
  }

  const { data: netRefundedData, error: netRefundedError } = await supabase.rpc('get_net_refunded_cents', {
    p_ledger_id: ledgerId,
    p_original_tx_id: originalSaleId,
  })

  if (netRefundedError) {
    console.error('Failed to recompute refund state after refund reversal:', netRefundedError)
    return
  }

  const originalAmountCents = centsFromMajor(originalSale.amount)
  const netRefundedCents = Number(netRefundedData ?? 0)
  if (!Number.isFinite(netRefundedCents) || netRefundedCents >= originalAmountCents) {
    return
  }

  const { error: reopenError } = await supabase
    .from('transactions')
    .update({
      status: 'completed',
      reversed_by: null,
    })
    .eq('id', originalSaleId)

  if (reopenError) {
    console.error('Failed to reopen sale after refund reversal:', reopenError)
  }
}

const handler = createHandler(
  { endpoint: 'reverse-transaction', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ReversalRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Validate required fields
    const transactionId = validateId(body.transaction_id, 100)
    const reason = validateString(body.reason, 500)

    if (!transactionId) {
      return errorResponse('Invalid transaction_id', 400, req)
    }
    if (!reason) {
      return errorResponse('Invalid or missing reason', 400, req)
    }

    // Validate optional partial_amount
    let partialAmountCents: number | null = null
    if (body.partial_amount !== undefined) {
      partialAmountCents = validateAmount(body.partial_amount)
      if (partialAmountCents === null || partialAmountCents <= 0) {
        return errorResponse('Invalid partial_amount: must be a positive integer (cents)', 400, req)
      }
    }

    // Validate optional idempotency_key
    const idempotencyKey = body.idempotency_key ? validateId(body.idempotency_key, 120) : null
    if (body.idempotency_key && !idempotencyKey) {
      return errorResponse('Invalid idempotency_key', 400, req)
    }

    // Get original transaction with entries
    const { data: originalTx, error: txError } = await supabase
      .from('transactions')
      .select('*, entries(*)')
      .eq('id', transactionId)
      .eq('ledger_id', ledger.id)
      .single()

    if (txError || !originalTx) {
      return errorResponse('Transaction not found', 404, req)
    }

    // Check if already voided/reversed
    if (originalTx.status === 'reversed' || originalTx.status === 'voided') {
      return jsonResponse({
        success: false,
        error: `Transaction already ${originalTx.status}`,
        reversal_id: originalTx.reversed_by
      }, 409, req)
    }

    // Check if transaction is in a locked/closed period
    const txDate = originalTx.created_at?.split('T')[0]
    if (txDate) {
      const { data: lockedPeriod } = await supabase
        .from('accounting_periods')
        .select('id, period_start, period_end, status')
        .eq('ledger_id', ledger.id)
        .in('status', ['closed', 'locked'])
        .lte('period_start', txDate)
        .gte('period_end', txDate)
        .single()

      if (lockedPeriod) {
        return jsonResponse({
          success: false,
          error: `Cannot modify transaction in a ${lockedPeriod.status} period`,
          period: {
            start: lockedPeriod.period_start,
            end: lockedPeriod.period_end,
            status: lockedPeriod.status
          }
        }, 403, req)
      }
    }

    // Determine transaction state
    const isReconciled = originalTx.metadata?.reconciled === true ||
                         originalTx.metadata?.bank_match_id != null ||
                         originalTx.status === 'reconciled'

    const now = new Date().toISOString()

    // ============================================
    // DRAFT STATE: Soft delete (mark as voided)
    // ============================================
    if (!isReconciled && !partialAmountCents) {
      const { data: voidTxId, error: voidError } = await supabase.rpc('void_transaction_atomic', {
        p_ledger_id: ledger.id,
        p_transaction_id: transactionId,
        p_reason: reason,
      })

      if (voidError) {
        const voidMessage = String(voidError.message || '')
        if (voidMessage.includes('already voided') || voidMessage.includes('already reversed')) {
          return jsonResponse({
            success: false,
            error: voidMessage,
          }, 409, req)
        }
        if (voidMessage.includes('reconciled')) {
          return errorResponse('Transaction was reconciled concurrently — use reversing entry instead', 409, req)
        }
        console.error('Failed to void transaction:', voidError)
        return errorResponse('Failed to void transaction', 500, req)
      }

      // Sync sale state if we just voided a refund
      if (originalTx.transaction_type === 'refund') {
        await syncSaleRefundStateAfterRefundReversal(supabase, ledger.id, originalTx)
      }

      // Audit log with IP
      await supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'void_transaction',
        entity_type: 'transaction',
        entity_id: transactionId,
        actor_type: 'api',
        ip_address: getClientIp(req),
        request_body: { reason: reason, void_type: 'soft_delete' }
      })

      return jsonResponse({
        success: true,
        void_type: 'soft_delete',
        message: 'Transaction voided successfully',
        transaction_id: transactionId,
        reversal_id: voidTxId || null,
        voided_at: now
      }, 200, req)
    }

    // ============================================
    // RECONCILED STATE: Create reversing entries
    // ============================================
    const originalAmount = Number(originalTx.amount)
    const originalAmountCents = centsFromMajor(originalTx.amount)
    let reversalAmount = originalAmount

    if (partialAmountCents) {
      reversalAmount = partialAmountCents / 100
      if (reversalAmount > originalAmount) {
        return errorResponse('Partial amount cannot exceed original', 400, req)
      }
    }

    // Compute cumulative already-reversed amount to prevent over-reversal
    const { data: existingReversals, error: existingReversalsError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('ledger_id', ledger.id)
      .eq('transaction_type', 'reversal')
      .eq('reverses', transactionId)
      .not('status', 'in', '("voided","reversed","draft")')

    if (existingReversalsError) {
      console.error('Failed to evaluate existing reversals:', existingReversalsError)
      return errorResponse('Failed to evaluate reversal capacity', 500, req)
    }

    const alreadyReversedCents = (existingReversals || []).reduce(
      (sum: number, row: { amount?: unknown }) => sum + centsFromMajor(row.amount),
      0,
    )
    const remainingReversibleCents = Math.max(0, originalAmountCents - alreadyReversedCents)

    if (remainingReversibleCents <= 0) {
      return jsonResponse({
        success: false,
        error: 'Transaction already fully reversed',
      }, 409, req)
    }

    const reversalAmountCents = partialAmountCents ?? remainingReversibleCents
    if (reversalAmountCents > remainingReversibleCents) {
      return errorResponse(
        `Reversal amount (${(reversalAmountCents / 100).toFixed(2)}) exceeds remaining reversible amount (${(remainingReversibleCents / 100).toFixed(2)})`,
        409,
        req,
      )
    }

    reversalAmount = reversalAmountCents / 100
    const reversalRatio = reversalAmount / originalAmount

    // Build deterministic reference_id for idempotency
    const reversalRefId = idempotencyKey
      ? `reversal_${idempotencyKey}`
      : `reversal_${transactionId}_${reversalAmountCents}`

    // Create reversal transaction
    const { data: reversalTx, error: reversalError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'reversal',
        reference_id: reversalRefId,
        reference_type: 'reversal',
        description: `Reversal: ${reason}`,
        amount: reversalAmount,
        currency: originalTx.currency,
        status: 'completed',
        reverses: transactionId,
        metadata: {
          original_transaction_id: transactionId,
          reason: reason,
          is_partial: reversalRatio < 1,
          reversal_ratio: reversalRatio,
          void_type: 'reversing_entry',
        }
      })
      .select('id')
      .single()

    if (reversalError) {
      // Handle duplicate reference_id (idempotent retry)
      const errMsg = String(reversalError.message || '').toLowerCase()
      if (reversalError.code === '23505' || errMsg.includes('unique') || errMsg.includes('duplicate')) {
        const { data: existingReversal } = await supabase
          .from('transactions')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('reference_id', reversalRefId)
          .maybeSingle()

        return jsonResponse({
          success: false,
          error: 'Duplicate reversal reference',
          error_code: 'duplicate_reversal_reference',
          reversal_id: existingReversal?.id || null,
          idempotent: true,
        }, 409, req)
      }
      console.error('Failed to create reversal:', reversalError)
      return errorResponse('Failed to create reversal', 500, req)
    }

    // Create reversed entries (flip debits to credits)
    const reversalEntries = originalTx.entries.map((entry: any) => ({
      transaction_id: reversalTx.id,
      account_id: entry.account_id,
      entry_type: entry.entry_type === 'debit' ? 'credit' : 'debit',
      amount: Math.round(Number(entry.amount) * reversalRatio * 100) / 100
    }))

    await supabase.from('entries').insert(reversalEntries)

    // Update original transaction status if fully reversed
    const totalReversedCents = alreadyReversedCents + reversalAmountCents
    if (totalReversedCents >= originalAmountCents) {
      await supabase
        .from('transactions')
        .update({
          status: 'reversed',
          reversed_by: reversalTx.id,
          metadata: {
            ...originalTx.metadata,
            reversed_at: now,
            reverse_reason: reason
          }
        })
        .eq('id', transactionId)
    }

    if (originalTx.transaction_type === 'refund') {
      await syncSaleRefundStateAfterRefundReversal(supabase, ledger.id, originalTx)
    }

    // Audit log with IP
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'reverse_transaction',
      entity_type: 'transaction',
      entity_id: reversalTx.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: {
        reason: reason,
        void_type: 'reversing_entry',
        is_partial: reversalRatio < 1,
        was_reconciled: isReconciled
      }
    })

    return jsonResponse({
      success: true,
      void_type: 'reversing_entry',
      message: 'Transaction reversed with reversing entries',
      reversal_id: reversalTx.id,
      original_transaction_id: transactionId,
      reversed_amount: reversalAmount,
      is_partial: reversalRatio < 1,
      reversed_at: now,
      warning: isReconciled ? 'This transaction was reconciled - bank matching may need review' : undefined
    }, 200, req)
  }
)

Deno.serve(handler)
