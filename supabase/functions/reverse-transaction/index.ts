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
  metadata?: Record<string, any>
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
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'voided',
          metadata: {
            ...originalTx.metadata,
            voided_at: now,
            void_reason: reason,
            void_type: 'soft_delete'
          }
        })
        .eq('id', transactionId)

      if (updateError) {
        console.error('Failed to void transaction:', updateError)
        return errorResponse('Failed to void transaction', 500, req)
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
        voided_at: now
      }, 200, req)
    }

    // ============================================
    // RECONCILED STATE: Create reversing entries
    // ============================================
    const originalAmount = Number(originalTx.amount)
    let reversalAmount = originalAmount
    
    if (partialAmountCents) {
      reversalAmount = partialAmountCents / 100
      if (reversalAmount > originalAmount) {
        return errorResponse('Partial amount cannot exceed original', 400, req)
      }
    }

    const reversalRatio = reversalAmount / originalAmount

    // Create reversal transaction
    const { data: reversalTx, error: reversalError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'reversal',
        reference_id: `reversal_${transactionId}_${Date.now()}`,
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

    // Update original transaction status
    if (reversalRatio === 1) {
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
