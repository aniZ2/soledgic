// SERVICE_ID: SVC_REFUND_ENGINE
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLog,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateId,
  validateString,
} from './utils.ts'
import type { PaymentProvider } from './payment-provider.ts'
import { autoLinkTransaction } from './transaction-graph.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'
import { checkRefundRate } from './risk-engine.ts'

export interface RefundRequest {
  original_sale_reference: string
  amount?: number
  reason: string
  refund_from?: 'both' | 'platform_only' | 'creator_only'
  external_refund_id?: string
  idempotency_key?: string
  mode?: 'ledger_only' | 'processor_refund'
  execute_processor_refund?: boolean
  processor_payment_id?: string
  metadata?: Record<string, any>
}

export interface ListRefundsRequest {
  sale_reference?: string
  limit?: number
}

interface AtomicRefundResult {
  out_transaction_id: string
  out_refunded_cents: number
  out_from_creator_cents: number
  out_from_platform_cents: number
  out_is_full_refund: boolean
  out_status: 'created' | 'duplicate'
}

interface PendingProcessorRefundRow {
  id: string
  reference_id: string
  original_transaction_id: string
  refund_amount: number
  reason: string | null
  refund_from: string | null
  external_refund_id: string | null
  status: string
  error_message: string | null
  created_at: string | null
}

interface RefundAmountRow {
  id: string
  amount?: unknown
}

interface RefundReversalAmountRow {
  reverses?: unknown
  amount?: unknown
}

function centsFromMajor(amount: unknown): number {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}

function calculateNetRefundedCents(
  refunds: RefundAmountRow[],
  reversals: RefundReversalAmountRow[],
): number {
  const reversedByRefundId = new Map<string, number>()

  for (const reversal of reversals) {
    const refundId = typeof reversal.reverses === 'string' ? reversal.reverses : null
    if (!refundId) continue

    reversedByRefundId.set(
      refundId,
      (reversedByRefundId.get(refundId) || 0) + centsFromMajor(reversal.amount),
    )
  }

  return refunds.reduce((sum, refund) => {
    const refundCents = centsFromMajor(refund.amount)
    const reversedCents = reversedByRefundId.get(refund.id) || 0
    return sum + Math.max(0, refundCents - reversedCents)
  }, 0)
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
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `refund_${hash.slice(0, 48)}`
}

function parseDuplicateReferenceError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '23505' || message.includes('unique') || message.includes('duplicate')
}

function mapRefundRow(row: any) {
  const metadata = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>
  const breakdownSource = metadata.breakdown
  const breakdown = breakdownSource && typeof breakdownSource === 'object'
    ? {
        from_creator: Number((breakdownSource as Record<string, unknown>).from_creator || 0),
        from_platform: Number((breakdownSource as Record<string, unknown>).from_platform || 0),
      }
    : null

  return {
    id: String(row.id),
    transaction_id: String(row.id),
    reference_id: row.reference_id ? String(row.reference_id) : null,
    sale_reference: metadata.original_sale_reference ? String(metadata.original_sale_reference) : null,
    refunded_amount: Number(row.amount || 0),
    currency: row.currency ? String(row.currency) : 'USD',
    status: row.status ? String(row.status) : 'completed',
    reason: metadata.reason ? String(metadata.reason) : (row.description ? String(row.description) : null),
    refund_from: metadata.refund_from ? String(metadata.refund_from) : null,
    external_refund_id: metadata.external_refund_id ? String(metadata.external_refund_id) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    breakdown,
  }
}

function mapPendingRefundRow(
  row: PendingProcessorRefundRow,
  originalSale: { reference_id?: string | null; currency?: string | null } | null,
) {
  return {
    id: String(row.reference_id || row.id),
    transaction_id: null,
    reference_id: row.reference_id ? String(row.reference_id) : null,
    sale_reference: originalSale?.reference_id ? String(originalSale.reference_id) : null,
    refunded_amount: Number(row.refund_amount || 0) / 100,
    currency: originalSale?.currency ? String(originalSale.currency) : 'USD',
    status: row.status === 'pending'
      ? 'pending_repair'
      : row.status,
    reason: row.reason ? String(row.reason) : null,
    refund_from: row.refund_from ? String(row.refund_from) : null,
    external_refund_id: row.external_refund_id ? String(row.external_refund_id) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    breakdown: null,
    repair_pending: true,
    last_error: row.error_message ? String(row.error_message) : null,
  }
}

export async function listRefundsResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: ListRefundsRequest,
  _requestId: string,
): Promise<ResourceResult> {
  const saleReference = body.sale_reference ? validateId(body.sale_reference, 255) : null
  if (body.sale_reference && !saleReference) {
    return resourceError('Invalid sale_reference', 400, {}, 'invalid_sale_reference')
  }

  const rawLimit = body.limit ?? 20
  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    return resourceError('limit must be an integer between 1 and 100', 400, {}, 'invalid_limit')
  }

  let saleTransactionId: string | null = null
  if (saleReference) {
    const { data: originalSaleLookup, error: originalSaleLookupError } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', saleReference)
      .eq('transaction_type', 'sale')
      .maybeSingle()

    if (originalSaleLookupError) {
      console.error('Failed to look up original sale for refund filter:', originalSaleLookupError)
      return resourceError('Failed to list refunds', 500, {}, 'refund_list_failed')
    }

    saleTransactionId = originalSaleLookup?.id ? String(originalSaleLookup.id) : null
  }

  let query = supabase
    .from('transactions')
    .select('id, reference_id, amount, currency, status, description, metadata, created_at')
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'refund')

  if (saleReference) {
    query = query.eq('metadata->>original_sale_reference', saleReference)
  }

  const { data: refunds, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Failed to list refunds:', error)
    return resourceError('Failed to list refunds', 500, {}, 'refund_list_failed')
  }

  let pendingRefundRows: PendingProcessorRefundRow[] = []
  if (!saleReference || saleTransactionId) {
    let pendingQuery = supabase
      .from('pending_processor_refunds')
      .select('id, reference_id, original_transaction_id, refund_amount, reason, refund_from, external_refund_id, status, error_message, created_at')
      .eq('ledger_id', ledger.id)
      .in('status', ['pending', 'repair_failed'])

    if (saleTransactionId) {
      pendingQuery = pendingQuery.eq('original_transaction_id', saleTransactionId)
    }

    const { data, error: pendingRefundError } = await pendingQuery
      .order('created_at', { ascending: false })
      .limit(limit)

    if (pendingRefundError) {
      console.error('Failed to list pending processor refunds:', pendingRefundError)
      return resourceError('Failed to list refunds', 500, {}, 'refund_list_failed')
    }

    pendingRefundRows = (data || []) as PendingProcessorRefundRow[]
  }

  const originalTransactionIds = Array.from(new Set(pendingRefundRows.map((row) => row?.original_transaction_id).filter(Boolean)))

  let originalSalesById = new Map<string, { reference_id?: string | null; currency?: string | null }>()
  if (originalTransactionIds.length > 0) {
    const { data: originalSales, error: originalSalesError } = await supabase
      .from('transactions')
      .select('id, reference_id, currency')
      .in('id', originalTransactionIds)

    if (originalSalesError) {
      console.error('Failed to load original sale references for pending refunds:', originalSalesError)
      return resourceError('Failed to list refunds', 500, {}, 'refund_list_failed')
    }

    originalSalesById = new Map(
      (originalSales || []).map((row) => [
        String(row.id),
        {
          reference_id: row.reference_id ? String(row.reference_id) : null,
          currency: row.currency ? String(row.currency) : null,
        },
      ]),
    )
  }

  const mappedRefunds = [
    ...(refunds || []).map(mapRefundRow),
    ...pendingRefundRows.map((row) =>
      mapPendingRefundRow(row, originalSalesById.get(String(row.original_transaction_id)) || null)
    ),
  ]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, limit)

  return resourceOk({
    success: true,
    refunds: mappedRefunds,
    count: mappedRefunds.length,
  })
}

export async function recordRefundResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: RefundRequest,
  requestId: string,
  provider?: PaymentProvider,
): Promise<ResourceResult> {
  const originalRef = validateId(body.original_sale_reference, 255)
  const reason = validateString(body.reason, 500)

  if (!originalRef) {
    return resourceError('Invalid original_sale_reference', 400, {}, 'invalid_original_sale_reference')
  }
  if (!reason) {
    return resourceError('Invalid or missing reason', 400, {}, 'invalid_reason')
  }

  let refundAmountCents: number | null = null
  if (body.amount !== undefined) {
    refundAmountCents = validateAmount(body.amount)
    if (refundAmountCents === null || refundAmountCents <= 0) {
      return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
    }
  }

  const validRefundFrom = ['both', 'platform_only', 'creator_only']
  const refundFrom = body.refund_from || 'both'
  if (!validRefundFrom.includes(refundFrom)) {
    return resourceError('Invalid refund_from: must be both, platform_only, or creator_only', 400, {}, 'invalid_refund_from')
  }

  let externalRefundId = body.external_refund_id ? validateId(body.external_refund_id, 255) : null
  if (body.external_refund_id && !externalRefundId) {
    return resourceError('Invalid external_refund_id', 400, {}, 'invalid_external_refund_id')
  }

  const idempotencyKey = body.idempotency_key ? validateId(body.idempotency_key, 120) : null
  if (body.idempotency_key && !idempotencyKey) {
    return resourceError('Invalid idempotency_key', 400, {}, 'invalid_idempotency_key')
  }

  if (body.mode !== undefined && body.mode !== 'ledger_only' && body.mode !== 'processor_refund') {
    return resourceError('Invalid mode: must be ledger_only or processor_refund', 400, {}, 'invalid_mode')
  }

  const executeProcessorRefund = body.mode
    ? body.mode === 'processor_refund'
    : body.execute_processor_refund === true
  const processorPaymentId = body.processor_payment_id ? validateId(body.processor_payment_id, 255) : null
  if (body.processor_payment_id && !processorPaymentId) {
    return resourceError('Invalid processor_payment_id', 400, {}, 'invalid_processor_payment_id')
  }

  const { data: originalSale, error: saleError } = await supabase
    .from('transactions')
    .select('id, amount, currency, status, reference_id, metadata, reversed_by')
    .eq('ledger_id', ledger.id)
    .eq('reference_id', originalRef)
    .eq('transaction_type', 'sale')
    .single()

  if (saleError || !originalSale) {
    return resourceError('Original sale not found', 404, {}, 'original_sale_not_found')
  }

  if (originalSale.status === 'reversed') {
    const reversedById = typeof originalSale.reversed_by === 'string' ? originalSale.reversed_by : null
    if (!reversedById) {
      return resourceOk({
        success: false,
        error: 'Sale already refunded/reversed',
        error_code: 'sale_already_reversed',
        original_transaction_id: originalSale.id,
      }, 409)
    }

    const { data: reversedByTx, error: reversedByError } = await supabase
      .from('transactions')
      .select('transaction_type')
      .eq('ledger_id', ledger.id)
      .eq('id', reversedById)
      .maybeSingle()

    if (reversedByError) {
      return resourceError('Failed to evaluate sale reversal state', 500, {}, 'sale_reversal_state_failed')
    }

    if (reversedByTx?.transaction_type !== 'refund') {
      return resourceOk({
        success: false,
        error: 'Sale already refunded/reversed',
        error_code: 'sale_already_reversed',
        original_transaction_id: originalSale.id,
      }, 409)
    }
  }

  const originalAmountCents = centsFromMajor(originalSale.amount)
  if (originalAmountCents <= 0) {
    return resourceError('Original sale amount is invalid', 500, {}, 'invalid_original_sale_amount')
  }

  const { data: existingRefunds, error: refundsError } = await supabase
    .from('transactions')
    .select('id, amount')
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'refund')
    .eq('reverses', originalSale.id)
    .not('status', 'in', '("voided","draft")')

  if (refundsError) {
    return resourceError('Failed to evaluate refundable balance', 500, {}, 'refundable_balance_evaluation_failed')
  }

  let alreadyRefundedCents = 0
  const refundIds = (existingRefunds || [])
    .map((row) => String((row as { id?: unknown }).id || ''))
    .filter(Boolean)

  if (refundIds.length > 0) {
    const { data: refundReversals, error: reversalsError } = await supabase
      .from('transactions')
      .select('reverses, amount')
      .eq('ledger_id', ledger.id)
      .eq('transaction_type', 'reversal')
      .in('reverses', refundIds)
      .not('status', 'in', '("voided","reversed","draft")')

    if (reversalsError) {
      return resourceError('Failed to evaluate refundable balance', 500, {}, 'refundable_balance_evaluation_failed')
    }

    alreadyRefundedCents = calculateNetRefundedCents(
      (existingRefunds || []) as RefundAmountRow[],
      (refundReversals || []) as RefundReversalAmountRow[],
    )
  }

  const remainingRefundableCents = Math.max(0, originalAmountCents - alreadyRefundedCents)
  if (remainingRefundableCents <= 0) {
    return resourceOk({
      success: false,
      error: 'Sale already fully refunded',
      error_code: 'sale_already_fully_refunded',
      original_transaction_id: originalSale.id,
    }, 409)
  }

  const effectiveRefundCents = refundAmountCents ?? remainingRefundableCents
  if (effectiveRefundCents <= 0) {
    return resourceError('Invalid refund amount', 400, {}, 'invalid_refund_amount')
  }

  if (effectiveRefundCents > remainingRefundableCents) {
    return resourceError(
      `Refund amount (${(effectiveRefundCents / 100).toFixed(2)}) exceeds remaining refundable amount (${(remainingRefundableCents / 100).toFixed(2)})`,
      409,
      {},
      'refund_amount_exceeds_remaining',
    )
  }

  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {}

  let refundRefId: string
  if (externalRefundId) {
    refundRefId = externalRefundId
  } else if (idempotencyKey) {
    refundRefId = `refund_${idempotencyKey}`
  } else {
    refundRefId = await buildDeterministicRefundReferenceId(originalSale.id, effectiveRefundCents, refundFrom, reason)
  }

  if (executeProcessorRefund) {
    if (!processorPaymentId) {
      return resourceError(
        'processor_payment_id is required for processor refunds',
        400,
        {},
        'missing_processor_payment_id',
      )
    }

    // Reserve refund capacity with a DB lock BEFORE calling the processor.
    // This prevents two concurrent processor refunds from both succeeding
    // when only one can be booked.
    const { data: capacityCheck, error: capacityError } = await supabase.rpc('record_refund_atomic_v2', {
      p_ledger_id: ledger.id,
      p_reference_id: refundRefId,
      p_original_tx_id: originalSale.id,
      p_refund_amount: effectiveRefundCents,
      p_reason: reason,
      p_refund_from: refundFrom,
      p_external_refund_id: externalRefundId,
      p_metadata: {
        ...metadata,
        processor_refund_executed: true,
        processor_payment_id: processorPaymentId,
        processor_refund_pending: true,
      },
      p_entry_method: 'processor',
    })

    if (capacityError) {
      if (parseDuplicateReferenceError(capacityError)) {
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('reference_id', refundRefId)
          .maybeSingle()

        return resourceOk({
          success: false,
          error: 'Duplicate refund reference',
          error_code: 'duplicate_refund_reference',
          transaction_id: existingTx?.id || null,
          idempotent: true,
        }, 409)
      }

      const txMessage = String(capacityError.message || '')
      if (
        txMessage.includes('No refundable amount remaining') ||
        txMessage.includes('exceeds remaining refundable amount') ||
        txMessage.includes('already reversed')
      ) {
        return resourceError(txMessage, 409, {}, 'refund_conflict')
      }

      console.error(`[${requestId}] Failed to reserve refund capacity:`, capacityError)
      return resourceError('Failed to reserve refund capacity', 500, {}, 'refund_reserve_failed')
    }

    const reservedRow = (Array.isArray(capacityCheck) ? capacityCheck[0] : capacityCheck) as AtomicRefundResult | null
    if (!reservedRow?.out_transaction_id) {
      return resourceError('Refund capacity reservation failed', 500, {}, 'refund_reserve_failed')
    }

    if (reservedRow.out_status === 'duplicate') {
      return resourceOk({
        success: false,
        error: 'Duplicate refund reference',
        error_code: 'duplicate_refund_reference',
        transaction_id: reservedRow.out_transaction_id,
        idempotent: true,
      }, 409)
    }

    // Ledger entry is now booked. Call the processor.
    if (!provider) return resourceError('PaymentProvider is required for processor refunds', 500, {}, 'missing_provider')
    const processorIdempotencyId = idempotencyKey
      ? `refund_${idempotencyKey}`
      : await buildDeterministicRefundReferenceId(originalSale.id, effectiveRefundCents, refundFrom, reason)

    const refundResult = await provider.refund({
      payment_intent_id: processorPaymentId,
      amount: effectiveRefundCents,
      idempotency_id: processorIdempotencyId,
      metadata: {
        soledgic_ledger_id: ledger.id,
        soledgic_original_sale_reference: originalRef,
      },
    })

    if (!refundResult.success) {
      // Processor failed — void the reserved ledger entry so capacity is freed
      console.error(`[${requestId}] Processor refund failed after ledger booking — voiding reservation`)
      await supabase.rpc('void_transaction_atomic', {
        p_ledger_id: ledger.id,
        p_transaction_id: reservedRow.out_transaction_id,
        p_reason: `Processor refund failed: ${refundResult.error || 'unknown'}`,
      }).then(({ error }: any) => {
        if (error) console.error(`[${requestId}] Failed to void reserved refund:`, error)
      })

      return resourceError(refundResult.error || 'Processor refund failed', 502, {}, 'processor_refund_failed')
    }

    const providerRefundId = refundResult.refund_id ? validateId(refundResult.refund_id, 255) : null

    // Update the reserved transaction with the processor's refund ID
    if (providerRefundId) {
      externalRefundId = providerRefundId
      await supabase
        .from('transactions')
        .update({
          metadata: {
            ...metadata,
            processor_refund_executed: true,
            processor_payment_id: processorPaymentId,
            external_refund_id: providerRefundId,
          },
        })
        .eq('id', reservedRow.out_transaction_id)
    }

    const fromCreatorCents = Number(reservedRow.out_from_creator_cents || 0)
    const fromPlatformCents = Number(reservedRow.out_from_platform_cents || 0)
    const refundedCents = Number(reservedRow.out_refunded_cents || effectiveRefundCents)

    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'record_refund',
      entity_type: 'transaction',
      entity_id: reservedRow.out_transaction_id,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        original_sale_reference: originalRef,
        refund_amount_cents: refundedCents,
        refund_from: refundFrom,
        reason,
        execute_processor_refund: true,
        processor_payment_id: processorPaymentId,
      }),
      response_status: 200,
      risk_score: 20,
    }, requestId)

    // Build transaction graph edge: refund → original sale
    void autoLinkTransaction(supabase, ledger.id, {
      id: reservedRow.out_transaction_id,
      transaction_type: 'refund',
      reverses: originalSale.id,
    })

    Promise.resolve(
      supabase.rpc('queue_webhook', {
        p_ledger_id: ledger.id,
        p_event_type: 'refund.created',
        p_payload: {
          event: 'refund.created',
          data: {
            transaction_id: reservedRow.out_transaction_id,
            original_sale_reference: originalRef,
            refunded_amount: refundedCents / 100,
            from_creator: fromCreatorCents / 100,
            from_platform: fromPlatformCents / 100,
            reason,
            created_at: new Date().toISOString(),
          },
        },
      }),
    ).then(({ error }: any) => {
      if (error) {
        console.error(`[${requestId}] Failed to queue refund webhook:`, error)
      }
    })

    // Risk signal: check if refund rate is elevated (fire-and-forget)
    if (ledger.organization_id) {
      void checkRefundRate(supabase, ledger.id, ledger.organization_id, reservedRow.out_transaction_id)
    }

    // Recalculate creator risk score after every refund (mandatory)
    const processorRefundCreatorId = (originalSale.metadata as Record<string, unknown> | null)?.creator_id
    if (processorRefundCreatorId) {
      void supabase.rpc('update_creator_risk_score', {
        p_ledger_id: ledger.id,
        p_creator_id: String(processorRefundCreatorId),
      }).then(() => {}, () => {})
    }

    return resourceOk({
      success: true,
      refund: {
        id: reservedRow.out_transaction_id,
        transaction_id: reservedRow.out_transaction_id,
        refunded_amount: refundedCents / 100,
        breakdown: {
          from_creator: fromCreatorCents / 100,
          from_platform: fromPlatformCents / 100,
        },
        is_full_refund: Boolean(reservedRow.out_is_full_refund),
      },
    })
  }

  refundRefId = validateId(refundRefId, 255) || ''
  if (!refundRefId) {
    return resourceError('Could not derive a valid refund reference ID', 500, {}, 'invalid_refund_reference_id')
  }

  const refundEntryMethod = 'manual'

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
      processor_refund_executed: false,
    },
    p_entry_method: refundEntryMethod,
  })

  if (txError) {
    if (parseDuplicateReferenceError(txError)) {
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('ledger_id', ledger.id)
        .eq('reference_id', refundRefId)
        .maybeSingle()

      return resourceOk({
        success: false,
        error: 'Duplicate refund reference',
        error_code: 'duplicate_refund_reference',
        transaction_id: existingTx?.id || null,
        idempotent: true,
      }, 409)
    }

    const txMessage = String(txError.message || '')
    if (
      txMessage.includes('No refundable amount remaining') ||
      txMessage.includes('exceeds remaining refundable amount') ||
      txMessage.includes('already reversed')
    ) {
      return resourceError(txMessage, 409, {}, 'refund_conflict')
    }

    if (txMessage.includes('Idempotency conflict')) {
      return resourceError(txMessage, 409, {}, 'idempotency_conflict')
    }

    if (txMessage.includes('Invalid refund_from') || txMessage.includes('must be positive')) {
      return resourceError(txMessage, 400, {}, 'invalid_refund_request')
    }

    console.error(`[${requestId}] Failed to create refund transaction:`, txError)
    return resourceError('Failed to create refund transaction', 500, {}, 'refund_create_failed')
  }

  const refundRow = (Array.isArray(atomicResult) ? atomicResult[0] : atomicResult) as AtomicRefundResult | null
  if (!refundRow?.out_transaction_id) {
    return resourceError('Refund transaction result is invalid', 500, {}, 'invalid_refund_result')
  }

  if (refundRow.out_status === 'duplicate') {
    return resourceOk({
      success: false,
      error: 'Duplicate refund reference',
      error_code: 'duplicate_refund_reference',
      transaction_id: refundRow.out_transaction_id,
      idempotent: true,
    }, 409)
  }

  const fromCreatorCents = Number(refundRow.out_from_creator_cents || 0)
  const fromPlatformCents = Number(refundRow.out_from_platform_cents || 0)
  const refundedCents = Number(refundRow.out_refunded_cents || effectiveRefundCents)

  await createAuditLog(supabase, req, {
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
  }, requestId)

  // Build transaction graph edge: refund → original sale
  void autoLinkTransaction(supabase, ledger.id, {
    id: refundRow.out_transaction_id,
    transaction_type: 'refund',
    reverses: originalSale.id,
  })

  Promise.resolve(
    supabase.rpc('queue_webhook', {
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
    }),
  ).then(({ error }: any) => {
    if (error) {
      console.error(`[${requestId}] Failed to queue refund webhook:`, error)
    }
  })

  // Risk signal: check if refund rate is elevated (ledger-only path)
  if (ledger.organization_id) {
    void checkRefundRate(supabase, ledger.id, ledger.organization_id, refundRow.out_transaction_id)
  }

  // Recalculate creator risk score after every refund (mandatory)
  const ledgerRefundCreatorId = (originalSale.metadata as Record<string, unknown> | null)?.creator_id
  if (ledgerRefundCreatorId) {
    void supabase.rpc('update_creator_risk_score', {
      p_ledger_id: ledger.id,
      p_creator_id: String(ledgerRefundCreatorId),
    }).then(() => {}, () => {})
  }

  return resourceOk({
    success: true,
    refund: {
      id: refundRow.out_transaction_id,
      transaction_id: refundRow.out_transaction_id,
      refunded_amount: refundedCents / 100,
      breakdown: {
        from_creator: fromCreatorCents / 100,
        from_platform: fromPlatformCents / 100,
      },
      is_full_refund: Boolean(refundRow.out_is_full_refund),
    },
  })
}
