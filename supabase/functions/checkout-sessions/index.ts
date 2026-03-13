import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getResourceSegments,
  mapCheckoutSessionResponse,
  transformJsonResponse,
} from '../_shared/treasury-resource.ts'
import { createCheckoutResponse } from '../_shared/checkout-service.ts'

const handler = createHandler(
  { endpoint: 'checkout-sessions', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'checkout-sessions')
    if (segments.length !== 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const payload = asJsonObject(body)
    if (!payload) {
      return errorResponse('Invalid JSON body', 400, req, requestId)
    }

    const response = await createCheckoutResponse(req, supabase, ledger, {
      amount: typeof payload.amount === 'number' ? payload.amount : NaN,
      creator_id: String(payload.participant_id ?? payload.creator_id ?? ''),
      currency: typeof payload.currency === 'string' ? payload.currency : undefined,
      product_id: typeof payload.product_id === 'string' ? payload.product_id : undefined,
      product_name: typeof payload.product_name === 'string' ? payload.product_name : undefined,
      customer_email: typeof payload.customer_email === 'string' ? payload.customer_email : undefined,
      customer_id: typeof payload.customer_id === 'string' ? payload.customer_id : undefined,
      payment_method_id: typeof payload.payment_method_id === 'string' ? payload.payment_method_id : undefined,
      source_id: typeof payload.source_id === 'string' ? payload.source_id : undefined,
      success_url: typeof payload.success_url === 'string' ? payload.success_url : undefined,
      cancel_url: typeof payload.cancel_url === 'string' ? payload.cancel_url : undefined,
      idempotency_key: typeof payload.idempotency_key === 'string' ? payload.idempotency_key : undefined,
      metadata: payload.metadata as Record<string, string> | undefined,
    }, requestId)

    return transformJsonResponse(req, requestId, response, mapCheckoutSessionResponse)
  },
)

Deno.serve(handler)
