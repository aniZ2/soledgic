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
  createAuditLogAsync,
  sanitizeForAudit,
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
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: PayoutRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // Validate required fields
    const creatorId = validateId(body.creator_id, 100)
    const referenceId = validateId(body.reference_id, 255)
    const amount = validateAmount(body.amount)

    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
    }
    if (!referenceId) {
      return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req, requestId)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
    }

    // Validate optional fields
    const fees = body.fees !== undefined ? validateAmount(body.fees) : 0
    if (fees === null) {
      return errorResponse('Invalid fees: must be a non-negative integer', 400, req, requestId)
    }

    const description = body.description ? validateString(body.description, 500) : null
    const payoutMethod = body.payout_method ? validateId(body.payout_method, 50) : null
    
    // Validate fees_paid_by
    if (body.fees_paid_by && !['platform', 'creator'].includes(body.fees_paid_by)) {
      return errorResponse('Invalid fees_paid_by: must be platform or creator', 400, req, requestId)
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
      return errorResponse('Failed to process payout', 500, req, requestId)
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
      return errorResponse(mapped.msg, mapped.code, req, requestId)
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
      }, 400, req, requestId)
    }

    if (result.status === 'duplicate') {
      // Track: the RPC deflected a concurrent/duplicate payout attempt
      supabase.from('race_condition_events').insert({
        ledger_id: ledger.id,
        event_type: 'payout_duplicate',
        endpoint: 'process-payout',
        details: { reference_id: referenceId, creator_id: creatorId, amount, transaction_id: result.transaction_id },
      }).catch((err) => {
        console.error(`[${requestId}] Failed to log payout duplicate race event:`, err)
      })

      return jsonResponse({
        success: false,
        error: 'Duplicate reference_id',
        transaction_id: result.transaction_id,
      }, 409, req, requestId)
    }

    // Success — audit log and webhook
    const transactionId = result.transaction_id!
    const payoutAmount = result.gross_payout!
    const feesAmount = result.fees!
    const netToCreator = result.net_to_creator!
    const previousBalance = result.previous_balance!
    const newBalance = result.new_balance!

    // Audit log with IP
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'process_payout',
      entity_type: 'transaction',
      entity_id: transactionId,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        creator_id: creatorId,
        amount: payoutAmount,
        previous_balance: previousBalance,
        new_balance: newBalance,
      }),
      response_status: 200,
      risk_score: 20,
    }, requestId)

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
    }).then(({ error }) => {
      if (error) {
        console.error(`[${requestId}] Failed to queue payout.created webhook:`, error)
      }
    }).catch((err) => {
      console.error(`[${requestId}] Failed to queue payout.created webhook:`, err)
    })

    // Send payout notification email to creator (non-blocking)
    // Fetch creator's email from creator_accounts
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (RESEND_API_KEY) {
      supabase
        .from('creator_accounts')
        .select('email, display_name')
        .eq('ledger_id', ledger.id)
        .eq('creator_id', creatorId)
        .single()
        .then(async ({ data: creator }) => {
          if (creator?.email) {
            const formattedAmount = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(netToCreator / 100)

            const formattedFees = feesAmount > 0
              ? new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(feesAmount / 100)
              : null

            const emailHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10b981;">Payout Processed</h2>
                <p>Hi ${creator.display_name || 'there'},</p>
                <p>Great news! A payout has been processed for your account.</p>
                <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
                  ${formattedFees ? `<p style="margin: 0 0 10px 0;"><strong>Fees:</strong> ${formattedFees}</p>` : ''}
                  <p style="margin: 0;"><strong>Transaction ID:</strong> ${transactionId}</p>
                </div>
                <p>The funds should arrive in your account according to your payout method's processing time.</p>
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                  — The ${ledger.platform_name} Team via Soledgic
                </p>
              </div>
            `

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Soledgic <noreply@soledgic.com>',
                to: [creator.email],
                subject: `Payout of ${formattedAmount} processed`,
                html: emailHtml,
              }),
            }).catch(console.error)
          }
        })
        .catch(() => {})
    }

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
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
