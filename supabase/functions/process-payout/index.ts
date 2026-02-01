// Soledgic Edge Function: Process Payout
// POST /process-payout
// Records a payout to a creator/contractor
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

interface PayoutRequest {
  creator_id: string
  amount: number
  reference_id: string
  reference_type?: string
  description?: string
  payout_method?: string
  fees?: number
  fees_paid_by?: 'platform' | 'creator'
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'process-payout', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: PayoutRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Validate required fields
    const creatorId = validateId(body.creator_id, 100)
    const referenceId = validateId(body.reference_id, 255)
    const amount = validateAmount(body.amount)

    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req)
    }
    if (!referenceId) {
      return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req)
    }

    // Validate optional fields
    const fees = body.fees !== undefined ? validateAmount(body.fees) : 0
    if (fees === null) {
      return errorResponse('Invalid fees: must be a non-negative integer', 400, req)
    }

    const description = body.description ? validateString(body.description, 500) : null
    const payoutMethod = body.payout_method ? validateId(body.payout_method, 50) : null
    
    // Validate fees_paid_by
    if (body.fees_paid_by && !['platform', 'creator'].includes(body.fees_paid_by)) {
      return errorResponse('Invalid fees_paid_by: must be platform or creator', 400, req)
    }

    // Build sanitized metadata for the RPC
    const sanitizedMetadata: Record<string, any> = {}
    if (body.metadata?.external_id) {
      sanitizedMetadata.external_id = body.metadata.external_id
    }
    if (body.metadata?.notes) {
      sanitizedMetadata.notes = validateString(body.metadata.notes, 500)
    }

    // Atomic payout processing via RPC: locks the creator account row
    // (FOR UPDATE), calculates available balance, checks sufficiency,
    // and inserts transaction + entries in a single DB transaction.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'process_payout_atomic',
      {
        p_ledger_id: ledger.id,
        p_reference_id: referenceId,
        p_creator_id: creatorId,
        p_amount: amount,
        p_fees: fees,
        p_fees_paid_by: body.fees_paid_by || 'platform',
        p_payout_method: payoutMethod,
        p_description: description,
        p_reference_type: body.reference_type || 'manual',
        p_metadata: sanitizedMetadata,
      }
    )

    if (rpcError) {
      console.error('Payout RPC error:', rpcError)
      return errorResponse('Failed to process payout', 500, req)
    }

    const result = rpcResult as {
      status: string
      transaction_id?: string
      error?: string
      gross_payout?: number
      fees?: number
      net_to_creator?: number
      previous_balance?: number
      new_balance?: number
      ledger_balance?: number
      held_amount?: number
      available?: number
      requested?: number
    }

    if (result.status === 'error') {
      const errorMap: Record<string, { msg: string; code: number }> = {
        creator_not_found: { msg: 'Creator account not found', code: 404 },
        cash_account_not_found: { msg: 'Cash account not found - ledger not initialized', code: 500 },
        amount_must_be_positive: { msg: 'Amount must be positive', code: 400 },
      }
      const mapped = errorMap[result.error || ''] || { msg: result.error || 'Unknown error', code: 500 }
      return errorResponse(mapped.msg, mapped.code, req)
    }

    if (result.status === 'insufficient_balance') {
      return jsonResponse({
        success: false,
        error: `Insufficient balance. Available: $${Number(result.available).toFixed(2)}, Requested: $${Number(result.requested).toFixed(2)}`,
        details: {
          ledger_balance: result.ledger_balance,
          held_amount: result.held_amount,
          available: result.available,
        }
      }, 400, req)
    }

    if (result.status === 'duplicate') {
      return jsonResponse({
        success: false,
        error: 'Duplicate reference_id',
        transaction_id: result.transaction_id,
      }, 409, req)
    }

    // Success — audit log and webhook
    const transactionId = result.transaction_id!
    const payoutAmount = result.gross_payout!
    const feesAmount = result.fees!
    const netToCreator = result.net_to_creator!
    const previousBalance = result.previous_balance!
    const newBalance = result.new_balance!

    // Audit log with IP
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'process_payout',
      entity_type: 'transaction',
      entity_id: transactionId,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: {
        creator_id: creatorId,
        amount: payoutAmount,
        previous_balance: previousBalance,
        new_balance: newBalance,
      }
    })

    // Queue webhook
    supabase.rpc('queue_webhook', {
      p_ledger_id: ledger.id,
      p_event_type: 'payout.created',
      p_payload: {
        event: 'payout.created',
        data: {
          transaction_id: transactionId,
          creator_id: creatorId,
          gross_payout: payoutAmount,
          fees: feesAmount,
          net_to_creator: netToCreator,
          previous_balance: previousBalance,
          new_balance: newBalance,
          created_at: new Date().toISOString(),
        }
      }
    }).catch(() => {})

    return jsonResponse({
      success: true,
      transaction_id: transactionId,
      breakdown: {
        gross_payout: payoutAmount,
        fees: feesAmount,
        net_to_creator: netToCreator,
      },
      previous_balance: previousBalance,
      new_balance: newBalance,
    }, 200, req)
  }
)

Deno.serve(handler)
