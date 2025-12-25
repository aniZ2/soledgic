// Soledgic Edge Function: Record Sale
// POST /record-sale
// Records a sale with automatic revenue split and withholding
// SECURITY HARDENED VERSION - Uses atomic database function

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateAmount,
  validateId,
  validateString,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface SaleRequest {
  reference_id: string
  creator_id: string
  amount: number  // In cents
  processing_fee?: number
  processing_fee_paid_by?: 'platform' | 'creator' | 'split'
  product_id?: string
  product_name?: string
  creator_percent?: number
  skip_withholding?: boolean
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'record-sale', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: SaleRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    const referenceId = validateId(body.reference_id, 255)
    const creatorId = validateId(body.creator_id, 100)
    const amount = validateAmount(body.amount)

    if (!referenceId) {
      return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req, requestId)
    }
    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
    }

    const processingFee = body.processing_fee !== undefined 
      ? validateAmount(body.processing_fee) 
      : 0
    if (processingFee === null || processingFee < 0) {
      return errorResponse('Invalid processing_fee: must be a non-negative integer', 400, req, requestId)
    }

    const productId = body.product_id ? validateId(body.product_id, 100) : null
    const productName = body.product_name ? validateString(body.product_name, 500) : null

    // Validate creator_percent if provided
    let creatorPercent: number
    if (body.creator_percent !== undefined) {
      if (typeof body.creator_percent !== 'number' || body.creator_percent < 0 || body.creator_percent > 100) {
        return errorResponse('Invalid creator_percent: must be 0-100', 400, req, requestId)
      }
      creatorPercent = body.creator_percent
    } else {
      // Get default from ledger settings or creator account
      creatorPercent = await getCreatorPercent(supabase, ledger, creatorId)
    }

    // ========================================================================
    // CALCULATE SPLIT (using database function for precision)
    // ========================================================================
    
    const { data: splitResult, error: splitError } = await supabase.rpc('calculate_sale_split', {
      p_gross_cents: amount,
      p_creator_percent: creatorPercent,
      p_processing_fee_cents: processingFee
    })

    if (splitError || !splitResult?.[0]) {
      console.error('Split calculation failed:', splitError)
      return errorResponse('Failed to calculate split', 500, req, requestId)
    }

    const split = splitResult[0]
    const creatorCents = split.creator_cents
    const platformCents = split.platform_cents
    const feeCents = split.fee_cents

    // ========================================================================
    // ATOMIC TRANSACTION (C1/C2 Fix)
    // ========================================================================
    // All inserts happen in single database transaction
    // If anything fails, entire operation rolls back
    
    const { data: result, error: txError } = await supabase.rpc('record_sale_atomic', {
      p_ledger_id: ledger.id,
      p_reference_id: referenceId,
      p_creator_id: creatorId,
      p_gross_amount: amount,
      p_creator_amount: creatorCents,
      p_platform_amount: platformCents,
      p_processing_fee: feeCents,
      p_product_id: productId,
      p_product_name: productName,
      p_metadata: body.metadata || {}
    })

    if (txError) {
      // Handle duplicate reference_id (idempotent response)
      if (txError.code === '23505' || txError.message?.includes('unique') || txError.message?.includes('duplicate')) {
        // Fetch existing transaction
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('reference_id', referenceId)
          .single()

        return jsonResponse({ 
          success: false, 
          error: 'Duplicate reference_id', 
          transaction_id: existingTx?.id,
          idempotent: true
        }, 409, req, requestId)
      }

      console.error('Atomic transaction failed:', txError)
      return errorResponse('Failed to record sale', 500, req, requestId)
    }

    const txResult = result?.[0] || result
    // Column names changed to out_* prefix to avoid ambiguity in PL/pgSQL
    const transactionId = txResult?.out_transaction_id || txResult?.transaction_id
    const creatorBalance = Number(txResult?.out_creator_balance || txResult?.creator_balance || 0)

    // ========================================================================
    // AUDIT LOG
    // ========================================================================
    
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'record_sale',
      entity_type: 'transaction',
      entity_id: transactionId,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        reference_id: referenceId,
        creator_id: creatorId,
        amount_cents: amount,
        creator_percent: creatorPercent,
      }),
      response_status: 200,
      risk_score: 10,
    }, requestId)

    // ========================================================================
    // RESPONSE
    // ========================================================================
    
    return jsonResponse({
      success: true,
      transaction_id: transactionId,
      breakdown: {
        gross_amount: amount / 100,
        processing_fee: feeCents / 100,
        net_amount: (amount - feeCents) / 100,
        creator_amount: creatorCents / 100,
        platform_amount: platformCents / 100,
        creator_percent: creatorPercent,
        platform_percent: 100 - creatorPercent,
        withheld_amount: 0,
        available_amount: creatorCents / 100,
        withholdings: []
      },
      creator_balance: creatorBalance
    }, 200, req, requestId)
  }
)

// Export for Deno
Deno.serve(handler)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getCreatorPercent(
  supabase: SupabaseClient, 
  ledger: LedgerContext, 
  creatorId: string
): Promise<number> {
  // 1. Check creator account for custom split
  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()

  const customSplit = creatorAccount?.metadata?.custom_split_percent
  if (typeof customSplit === 'number' && customSplit >= 0 && customSplit <= 100) {
    return customSplit
  }

  // 2. Fall back to ledger default
  const settings = ledger.settings as any
  const defaultPercent = settings?.default_split_percent || settings?.default_platform_fee_percent
  
  // If platform fee is set (e.g., 20), creator gets 80
  if (typeof defaultPercent === 'number') {
    // Check if it's stored as platform fee or creator percent
    if (defaultPercent <= 50) {
      // Likely platform fee (e.g., 20 means creator gets 80)
      return 100 - defaultPercent
    }
    return defaultPercent
  }

  // 3. Ultimate fallback: 80% to creator
  return 80
}
