// Soledgic Edge Function: Record Refund
// POST /record-refund
// Records a refund and adjusts creator/platform balances accordingly
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
import { getStripeSecretKey, getPaymentProvider } from '../_shared/payment-provider.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RefundRequest {
  original_sale_reference: string
  amount?: number
  reason: string
  refund_from?: 'both' | 'platform_only' | 'creator_only'
  external_refund_id?: string
  trigger_stripe_refund?: boolean
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'record-refund', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: RefundRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Validate required fields
    const originalRef = validateId(body.original_sale_reference, 255)
    const reason = validateString(body.reason, 500)

    if (!originalRef) {
      return errorResponse('Invalid original_sale_reference', 400, req)
    }
    if (!reason) {
      return errorResponse('Invalid or missing reason', 400, req)
    }

    // Validate optional amount
    let refundAmountCents: number | null = null
    if (body.amount !== undefined) {
      refundAmountCents = validateAmount(body.amount)
      if (refundAmountCents === null || refundAmountCents <= 0) {
        return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req)
      }
    }

    // Validate refund_from
    const validRefundFrom = ['both', 'platform_only', 'creator_only']
    const refundFrom = body.refund_from || 'both'
    if (!validRefundFrom.includes(refundFrom)) {
      return errorResponse('Invalid refund_from: must be both, platform_only, or creator_only', 400, req)
    }

    // Validate external_refund_id if provided
    const externalRefundId = body.external_refund_id 
      ? validateId(body.external_refund_id, 255) 
      : null

    // Find original sale transaction
    const { data: originalSale, error: saleError } = await supabase
      .from('transactions')
      .select('*, entries(*)')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', originalRef)
      .eq('transaction_type', 'sale')
      .single()

    if (saleError || !originalSale) {
      return errorResponse('Original sale not found', 404, req)
    }

    // Check if sale is already reversed/refunded
    if (originalSale.status === 'reversed') {
      return jsonResponse({ 
        success: false, 
        error: 'Sale already refunded/reversed',
        original_transaction_id: originalSale.id
      }, 409, req)
    }

    // Calculate refund amount
    const originalAmount = Number(originalSale.amount)
    let refundAmount = originalAmount

    if (refundAmountCents !== null) {
      refundAmount = refundAmountCents / 100
      if (refundAmount > originalAmount) {
        return errorResponse(
          `Refund amount (${refundAmount}) cannot exceed original sale amount (${originalAmount})`, 
          400, 
          req
        )
      }
    }

    // Get original sale breakdown from metadata
    const originalBreakdown = originalSale.metadata?.breakdown || {}
    const originalCreatorAmount = originalBreakdown.creator_amount || (originalAmount * 0.8)
    const originalPlatformAmount = originalBreakdown.platform_amount || (originalAmount * 0.2)

    // Calculate who pays for the refund
    const refundRatio = refundAmount / originalAmount
    
    let fromCreator = 0
    let fromPlatform = 0

    switch (refundFrom) {
      case 'both':
        fromCreator = Math.round(originalCreatorAmount * refundRatio * 100) / 100
        fromPlatform = Math.round(originalPlatformAmount * refundRatio * 100) / 100
        break
      case 'platform_only':
        fromPlatform = refundAmount
        break
      case 'creator_only':
        fromCreator = refundAmount
        break
    }

    // Get account IDs from original entries
    const cashEntry = originalSale.entries.find((e: any) => e.entry_type === 'debit')
    const creatorEntry = originalSale.entries.find((e: any) => 
      e.entry_type === 'credit' && e.account_id !== cashEntry?.account_id
    )
    const platformEntry = originalSale.entries.find((e: any) => 
      e.entry_type === 'credit' && e.account_id !== creatorEntry?.account_id
    )

    if (!cashEntry) {
      return errorResponse('Could not find cash account from original sale', 500, req)
    }

    // Generate refund reference ID
    const refundRefId = externalRefundId || `refund_${originalRef}_${Date.now()}`

    // Check for duplicate refund
    const { data: existingRefund } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', refundRefId)
      .single()

    if (existingRefund) {
      return jsonResponse({
        success: false,
        error: 'Duplicate refund reference',
        existing_transaction_id: existingRefund.id
      }, 409, req)
    }

    // Create refund transaction
    const { data: refundTx, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'refund',
        reference_id: refundRefId,
        reference_type: 'refund',
        description: `Refund: ${reason}`,
        amount: refundAmount,
        currency: originalSale.currency,
        status: 'completed',
        reverses: originalSale.id,
        metadata: {
          original_sale_reference: originalRef,
          original_transaction_id: originalSale.id,
          reason: reason,
          refund_from: refundFrom,
          breakdown: {
            from_creator: fromCreator,
            from_platform: fromPlatform
          },
          // Sanitize metadata - don't blindly accept user input
          external_refund_id: externalRefundId,
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create refund transaction:', txError)
      return errorResponse('Failed to create refund transaction', 500, req)
    }

    // Create refund entries
    const entries: any[] = [
      {
        transaction_id: refundTx.id,
        account_id: cashEntry.account_id,
        entry_type: 'credit',
        amount: refundAmount
      }
    ]

    if (fromCreator > 0 && creatorEntry) {
      entries.push({
        transaction_id: refundTx.id,
        account_id: creatorEntry.account_id,
        entry_type: 'debit',
        amount: fromCreator
      })
    }

    if (fromPlatform > 0 && platformEntry) {
      entries.push({
        transaction_id: refundTx.id,
        account_id: platformEntry.account_id,
        entry_type: 'debit',
        amount: fromPlatform
      })
    }

    const { error: entriesError } = await supabase
      .from('entries')
      .insert(entries)

    if (entriesError) {
      console.error('Failed to create refund entries:', entriesError)
      // Transaction already created - log but continue
    }

    // Optionally trigger a Stripe refund on the original payment
    let stripeRefundResult: { success: boolean; refund_id?: string; error?: string } | null = null

    if (body.trigger_stripe_refund && originalSale.metadata?.stripe_payment_intent_id) {
      const stripeKey = await getStripeSecretKey(supabase, ledger.id)
      if (stripeKey) {
        const provider = getPaymentProvider('stripe', stripeKey)
        try {
          stripeRefundResult = await provider.refund({
            payment_intent_id: originalSale.metadata.stripe_payment_intent_id,
            amount: refundAmountCents !== null ? refundAmountCents : undefined,
            reason: 'requested_by_customer',
          })

          if (stripeRefundResult.success && stripeRefundResult.refund_id) {
            // Store stripe_refund_id in the refund transaction metadata
            await supabase
              .from('transactions')
              .update({
                metadata: {
                  ...((await supabase.from('transactions').select('metadata').eq('id', refundTx.id).single()).data?.metadata || {}),
                  stripe_refund_id: stripeRefundResult.refund_id,
                }
              })
              .eq('id', refundTx.id)
          }
        } catch (err: any) {
          // Stripe refund failure does NOT roll back ledger entries (can be retried)
          console.error(`Stripe refund failed for ${originalSale.metadata.stripe_payment_intent_id}:`, err.message)
          stripeRefundResult = { success: false, error: err.message }
        }
      } else {
        stripeRefundResult = { success: false, error: 'Legacy provider not configured for this ledger' }
      }
    }

    // Mark original sale as having a refund
    if (refundAmount >= originalAmount) {
      await supabase
        .from('transactions')
        .update({ 
          status: 'reversed',
          reversed_by: refundTx.id 
        })
        .eq('id', originalSale.id)
    }

    // Audit log with IP
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_refund',
      entity_type: 'transaction',
      entity_id: refundTx.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: {
        original_sale_reference: originalRef,
        refund_amount: refundAmount,
        refund_from: refundFrom,
        reason: reason,
      }
    })

    // Queue webhook
    supabase.rpc('queue_webhook', {
      p_ledger_id: ledger.id,
      p_event_type: 'refund.created',
      p_payload: {
        event: 'refund.created',
        data: {
          transaction_id: refundTx.id,
          original_sale_reference: originalRef,
          refunded_amount: refundAmount,
          from_creator: fromCreator,
          from_platform: fromPlatform,
          reason: reason,
          created_at: new Date().toISOString(),
        }
      }
    }).catch(() => {})

    return jsonResponse({
      success: true,
      transaction_id: refundTx.id,
      refunded_amount: refundAmount,
      breakdown: {
        from_creator: fromCreator,
        from_platform: fromPlatform
      },
      ...(stripeRefundResult ? {
        stripe_refund: {
          triggered: true,
          success: stripeRefundResult.success,
          refund_id: stripeRefundResult.refund_id,
          error: stripeRefundResult.error,
        }
      } : {}),
    }, 200, req)
  }
)

Deno.serve(handler)
