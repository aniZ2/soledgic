import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getResourceSegments,
  mapPayoutResponse,
  transformJsonResponse,
} from '../_shared/treasury-resource.ts'
import { processPayoutResponse } from '../_shared/payout-service.ts'

const handler = createHandler(
  { endpoint: 'payouts', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'payouts')
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

    const response = await processPayoutResponse(req, supabase, ledger, {
      creator_id: String(payload.participant_id ?? payload.creator_id ?? ''),
      amount: typeof payload.amount === 'number' ? payload.amount : NaN,
      reference_id: String(payload.reference_id ?? ''),
      reference_type: typeof payload.reference_type === 'string' ? payload.reference_type : undefined,
      description: typeof payload.description === 'string' ? payload.description : undefined,
      payout_method: typeof payload.payout_method === 'string' ? payload.payout_method : undefined,
      fees: typeof payload.fees === 'number' ? payload.fees : undefined,
      fees_paid_by: payload.fees_paid_by as 'platform' | 'creator' | undefined,
      metadata: payload.metadata as Record<string, any> | undefined,
    }, requestId)

    return transformJsonResponse(req, requestId, response, mapPayoutResponse)
  },
)

Deno.serve(handler)
