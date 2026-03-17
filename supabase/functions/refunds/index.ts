import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getResourceSegments,
  respondWithResult,
} from '../_shared/treasury-resource.ts'
import {
  listRefundsResponse,
  recordRefundResponse,
} from '../_shared/refund-service.ts'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

const handler = createHandler(
  { endpoint: 'refunds', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'refunds')
    if (segments.length !== 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const rawLimit = url.searchParams.get('limit')
      const response = await listRefundsResponse(req, supabase, ledger, {
        sale_reference: url.searchParams.get('sale_reference') || undefined,
        limit: rawLimit === null ? undefined : Number(rawLimit),
      }, requestId)

      return respondWithResult(req, requestId, response)
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const payload = asJsonObject(body)
    if (!payload) {
      return errorResponse('Invalid JSON body', 400, req, requestId)
    }

    const response = await recordRefundResponse(req, supabase, ledger, {
      original_sale_reference: String(payload.sale_reference ?? payload.original_sale_reference ?? ''),
      reason: String(payload.reason ?? ''),
      amount: typeof payload.amount === 'number' ? payload.amount : undefined,
      refund_from: payload.refund_from as 'both' | 'platform_only' | 'creator_only' | undefined,
      external_refund_id: typeof payload.external_refund_id === 'string' ? payload.external_refund_id : undefined,
      idempotency_key: typeof payload.idempotency_key === 'string' ? payload.idempotency_key : undefined,
      mode: payload.mode as 'ledger_only' | 'processor_refund' | undefined,
      processor_payment_id: typeof payload.processor_payment_id === 'string' ? payload.processor_payment_id : undefined,
      metadata: payload.metadata as Record<string, any> | undefined,
    }, requestId, getPaymentProvider('card', { livemode: ledger.livemode }))

    return respondWithResult(req, requestId, response)
  },
)

Deno.serve(handler)
