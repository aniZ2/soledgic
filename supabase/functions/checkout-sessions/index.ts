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
import { createCheckoutResponse } from '../_shared/checkout-service.ts'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

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
      participant_id: String(payload.participant_id ?? payload.creator_id ?? ''),
      currency: typeof payload.currency === 'string' ? payload.currency : undefined,
      product_id: typeof payload.product_id === 'string' ? payload.product_id : undefined,
      product_name: typeof payload.product_name === 'string' ? payload.product_name : undefined,
      customer_email: typeof payload.customer_email === 'string' ? payload.customer_email : undefined,
      customer_id: typeof payload.customer_id === 'string' ? payload.customer_id : undefined,
      buyer_id: typeof payload.buyer_id === 'string' ? payload.buyer_id : undefined,
      customer_country: typeof payload.customer_country === 'string' ? payload.customer_country : undefined,
      customer_state: typeof payload.customer_state === 'string' ? payload.customer_state : undefined,
      customer_postal_code: typeof payload.customer_postal_code === 'string' ? payload.customer_postal_code : undefined,
      customer_address: payload.customer_address && typeof payload.customer_address === 'object'
        ? {
            country: typeof (payload.customer_address as Record<string, unknown>).country === 'string'
              ? (payload.customer_address as Record<string, unknown>).country as string
              : undefined,
            state: typeof (payload.customer_address as Record<string, unknown>).state === 'string'
              ? (payload.customer_address as Record<string, unknown>).state as string
              : undefined,
            postal_code: typeof (payload.customer_address as Record<string, unknown>).postal_code === 'string'
              ? (payload.customer_address as Record<string, unknown>).postal_code as string
              : undefined,
          }
        : undefined,
      payment_method_id: typeof payload.payment_method_id === 'string' ? payload.payment_method_id : undefined,
      source_id: typeof payload.source_id === 'string' ? payload.source_id : undefined,
      success_url: typeof payload.success_url === 'string' ? payload.success_url : undefined,
      cancel_url: typeof payload.cancel_url === 'string' ? payload.cancel_url : undefined,
      idempotency_key: typeof payload.idempotency_key === 'string' ? payload.idempotency_key : undefined,
      tax_category: typeof payload.tax_category === 'string' ? payload.tax_category : undefined,
      collect_sales_tax: payload.collect_sales_tax === true,
      metadata: payload.metadata as Record<string, string> | undefined,
    }, requestId, getPaymentProvider('card', { livemode: ledger.livemode }))

    return respondWithResult(req, requestId, response)
  },
)

Deno.serve(handler)
