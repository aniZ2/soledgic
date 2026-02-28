// Soledgic Edge Function: Record Refund
// POST /record-refund
// Records a refund using an atomic SQL RPC to preserve ledger integrity.

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
import { getPaymentProvider } from '../_shared/payment-provider.ts'

interface RefundRequest {
  original_sale_reference: string
  amount?: number
  reason: string
  refund_from?: 'both' | 'platform_only' | 'creator_only'
  external_refund_id?: string
  idempotency_key?: string
  execute_processor_refund?: boolean
  processor_payment_id?: string
  metadata?: Record<string, any>
}

interface AtomicRefundResult {
  out_transaction_id: string
  out_refunded_cents: number
  out_from_creator_cents: number
  out_from_platform_cents: number
  out_is_full_refund: boolean
  out_status: 'created' | 'duplicate'
}

function centsFromMajor(amount: unknown): number {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}

async function buildDeterministicRefundReferenceId(
  originalTransactionId: string,
  refundAmountCents: number,
  refundFrom: string,
  reason: string,
): Promise<string> {
  const source = `${originalTransactionId}|${refundAmountCents}|${refundFrom}|${reason.trim().toLowerCase()}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `refund_${hash.slice(0, 48)}`
}

function parseDuplicateReferenceError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '23505' || message.includes('unique') || message.includes('duplicate')
}

const handler = createHandler(
  { endpoint: 'record-refund', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: RefundRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const originalRef = validateId(body.original_sale_reference, 255)
    const reason = validateString(body.reason, 500)

    if (!originalRef) {
      return errorResponse('Invalid original_sale_reference', 400, req, requestId)
    }
    if (!reason) {
      return errorResponse('Invalid or missing reason', 400, req, requestId)
    }

    let refundAmountCents: number | null = null
    if (body.amount !== undefined) {
      refundAmountCents = validateAmount(body.amount)
      if (refundAmountCents === null || refundAmountCents <= 0) {
        return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
      }
    }

    const validRefundFrom = ['both', 'platform_only', 'creator_only']
    const refundFrom = body.refund_from || 'both'
    if (!validRefundFrom.includes(refundFrom)) {
      return errorResponse('Invalid refund_from: must be both, platform_only, or creator_only', 400, req, requestId)
    }

    let externalRefundId = body.external_refund_id ? validateId(body.external_refund_id, 255) : null
    if (body.external_refund_id && !externalRefundId) {
      return errorResponse('Invalid external_refund_id', 400, req, requestId)
    }

    const idempotencyKey = body.idempotency_key ? validateId(body.idempotency_key, 120) : null
    if (body.idempotency_key && !idempotencyKey) {
      return errorResponse('Invalid idempotency_key', 400, req, requestId)
    }

    const executeProcessorRefund = body.execute_processor_refund === true
    const processorPaymentId = body.processor_payment_id ? validateId(body.processor_payment_id, 255) : null
    if (body.processor_payment_id && !processorPaymentId) {
      return errorResponse('Invalid processor_payment_id', 400, req, requestId)
    }

    const { data: originalSale, error: saleError } = await supabase
      .from('transactions')
      .select('id, amount, currency, status, reference_id, metadata')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', originalRef)
      .eq('transaction_type', 'sale')
      .single()

    if (saleError || !originalSale) {
      return errorResponse('Original sale not found', 404, req, requestId)
    }

    if (originalSale.status === 'reversed') {
      return jsonResponse(
        {
          success: false,
          error: 'Sale already refunded/reversed',
          original_transaction_id: originalSale.id,
        },
        409,
        req,
        requestId,
      )
    }

    const originalAmountCents = centsFromMajor(originalSale.amount)
    if (originalAmountCents <= 0) {
      return errorResponse('Original sale amount is invalid', 500, req, requestId)
    }

    const { data: existingRefunds, error: refundsError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('ledger_id', ledger.id)
      .eq('transaction_type', 'refund')
      .eq('reverses', originalSale.id)
      .in('status', ['completed', 'reversed'])

    if (refundsError) {
      return errorResponse('Failed to evaluate refundable balance', 500, req, requestId)
    }

    const alreadyRefundedCents = (existingRefunds || []).reduce((sum, row) => {
      return sum + centsFromMajor((row as { amount?: unknown }).amount)
    }, 0)

    const remainingRefundableCents = Math.max(0, originalAmountCents - alreadyRefundedCents)
    if (remainingRefundableCents <= 0) {
      return jsonResponse(
        {
          success: false,
          error: 'Sale already fully refunded',
          original_transaction_id: originalSale.id,
        },
        409,
        req,
        requestId,
      )
    }

    const effectiveRefundCents = refundAmountCents ?? remainingRefundableCents
    if (effectiveRefundCents <= 0) {
      return errorResponse('Invalid refund amount', 400, req, requestId)
    }

    if (effectiveRefundCents > remainingRefundableCents) {
      return errorResponse(
        `Refund amount (${(effectiveRefundCents / 100).toFixed(2)}) exceeds remaining refundable amount (${(remainingRefundableCents / 100).toFixed(2)})`,
        409,
        req,
        requestId,
      )
    }

    if (executeProcessorRefund) {
      const provider = getPaymentProvider('card')
      const paymentId = processorPaymentId || originalRef

      const refundResult = await provider.refund({
        payment_intent_id: paymentId,
        amount: effectiveRefundCents,
        metadata: {
          soledgic_ledger_id: ledger.id,
          soledgic_original_sale_reference: originalRef,
        },
      })

      if (!refundResult.success) {
        return errorResponse(refundResult.error || 'Processor refund failed', 502, req, requestId)
      }

      const providerRefundId = refundResult.refund_id ? validateId(refundResult.refund_id, 255) : null
      if (refundResult.refund_id && !providerRefundId) {
        return errorResponse('Processor returned invalid refund ID', 502, req, requestId)
      }
      if (providerRefundId && !externalRefundId) {
        externalRefundId = providerRefundId
      }
    }

    let refundRefId: string
    if (externalRefundId) {
      refundRefId = externalRefundId
    } else if (idempotencyKey) {
      refundRefId = `refund_${idempotencyKey}`
    } else {
      refundRefId = await buildDeterministicRefundReferenceId(originalSale.id, effectiveRefundCents, refundFrom, reason)
    }

    refundRefId = validateId(refundRefId, 255) || ''
    if (!refundRefId) {
      return errorResponse('Could not derive a valid refund reference ID', 500, req, requestId)
    }

    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {}

    const { data: atomicResult, error: txError } = await supabase.rpc('record_refund_atomic_v2', {
      p_ledger_id: ledger.id,
      p_reference_id: refundRefId,
      p_original_tx_id: originalSale.id,
      p_refund_amount: effectiveRefundCents,
      p_reason: reason,
      p_refund_from: refundFrom,
      p_external_refund_id: externalRefundId,
      p_metadata: {
        ...metadata,
        processor_refund_executed: executeProcessorRefund,
        processor_payment_id: executeProcessorRefund ? (processorPaymentId || originalRef) : null,
      },
    })

    if (txError) {
      if (parseDuplicateReferenceError(txError)) {
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('reference_id', refundRefId)
          .maybeSingle()

        return jsonResponse(
          {
            success: false,
            error: 'Duplicate refund reference',
            transaction_id: existingTx?.id || null,
            idempotent: true,
          },
          409,
          req,
          requestId,
        )
      }

      const txMessage = String(txError.message || '')
      if (
        txMessage.includes('No refundable amount remaining') ||
        txMessage.includes('exceeds remaining refundable amount') ||
        txMessage.includes('already reversed')
      ) {
        return errorResponse(txMessage, 409, req, requestId)
      }

      if (txMessage.includes('Invalid refund_from') || txMessage.includes('must be positive')) {
        return errorResponse(txMessage, 400, req, requestId)
      }

      console.error(`[${requestId}] Failed to create refund transaction:`, txError)
      return errorResponse('Failed to create refund transaction', 500, req, requestId)
    }

    const refundRow = (Array.isArray(atomicResult) ? atomicResult[0] : atomicResult) as AtomicRefundResult | null
    if (!refundRow?.out_transaction_id) {
      return errorResponse('Refund transaction result is invalid', 500, req, requestId)
    }

    if (refundRow.out_status === 'duplicate') {
      return jsonResponse(
        {
          success: false,
          error: 'Duplicate refund reference',
          transaction_id: refundRow.out_transaction_id,
          idempotent: true,
        },
        409,
        req,
        requestId,
      )
    }

    const fromCreatorCents = Number(refundRow.out_from_creator_cents || 0)
    const fromPlatformCents = Number(refundRow.out_from_platform_cents || 0)
    const refundedCents = Number(refundRow.out_refunded_cents || effectiveRefundCents)

    createAuditLogAsync(
      supabase,
      req,
      {
        ledger_id: ledger.id,
        action: 'record_refund',
        entity_type: 'transaction',
        entity_id: refundRow.out_transaction_id,
        actor_type: 'api',
        request_body: sanitizeForAudit({
          original_sale_reference: originalRef,
          refund_amount_cents: refundedCents,
          refund_from: refundFrom,
          reason,
          execute_processor_refund: executeProcessorRefund,
        }),
        response_status: 200,
        risk_score: 20,
      },
      requestId,
    )

    supabase
      .rpc('queue_webhook', {
        p_ledger_id: ledger.id,
        p_event_type: 'refund.created',
        p_payload: {
          event: 'refund.created',
          data: {
            transaction_id: refundRow.out_transaction_id,
            original_sale_reference: originalRef,
            refunded_amount: refundedCents / 100,
            from_creator: fromCreatorCents / 100,
            from_platform: fromPlatformCents / 100,
            reason,
            created_at: new Date().toISOString(),
          },
        },
      })
      .then(({ error }) => {
        if (error) {
          console.error(`[${requestId}] Failed to queue refund webhook:`, error)
        }
      })
      .catch((err) => {
        console.error(`[${requestId}] Failed to queue refund webhook:`, err)
      })

    return jsonResponse(
      {
        success: true,
        transaction_id: refundRow.out_transaction_id,
        refunded_amount: refundedCents / 100,
        breakdown: {
          from_creator: fromCreatorCents / 100,
          from_platform: fromPlatformCents / 100,
        },
        is_full_refund: Boolean(refundRow.out_is_full_refund),
      },
      200,
      req,
      requestId,
    )
  },
)

Deno.serve(handler)
