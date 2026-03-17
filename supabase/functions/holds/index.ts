// SERVICE_ID: SVC_HOLDS_ROUTER
import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getBooleanParam,
  getNumberParam,
  getResourceSegments,
  respondWithResult,
} from '../_shared/treasury-resource.ts'
import {
  getHeldFundsSummaryResponse,
  listHeldFundsResponse,
  releaseHeldFundsResponse,
} from '../_shared/holds-service.ts'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

const handler = createHandler(
  { endpoint: 'holds', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'holds')

    if (segments.length === 0) {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const url = new URL(req.url)
      const participantId =
        url.searchParams.get('participant_id') || url.searchParams.get('creator_id')
      const ventureId = url.searchParams.get('venture_id')
      const readyOnly = getBooleanParam(url, 'ready_only')
      const limit = getNumberParam(url, 'limit')

      const response = await listHeldFundsResponse(req, supabase, ledger, {
        ...(participantId ? { participant_id: participantId } : {}),
        ...(ventureId ? { venture_id: ventureId } : {}),
        ...(readyOnly !== undefined ? { ready_only: readyOnly } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }, requestId)

      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 1 && segments[0] === 'summary') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = await getHeldFundsSummaryResponse(req, supabase, ledger, requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && segments[1] === 'release') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const response = await releaseHeldFundsResponse(req, supabase, ledger, {
        entry_id: segments[0],
        execute_transfer: payload.execute_transfer !== false,
      }, requestId, getPaymentProvider('card', { livemode: ledger.livemode }))

      return respondWithResult(req, requestId, response)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
