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
  createParticipantResponse,
  getParticipantBalanceResponse,
  getParticipantPayoutEligibilityResponse,
  listParticipantBalancesResponse,
} from '../_shared/participants-service.ts'

const handler = createHandler(
  { endpoint: 'participants', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'participants')

    if (segments.length === 0) {
      if (req.method === 'GET') {
        const response = await listParticipantBalancesResponse(req, supabase, ledger, requestId)
        return respondWithResult(req, requestId, response)
      }

      if (req.method === 'POST') {
        const payload = asJsonObject(body)
        if (!payload) {
          return errorResponse('Invalid JSON body', 400, req, requestId)
        }

        const response = await createParticipantResponse(req, supabase, ledger, {
          participant_id: String(payload.participant_id ?? payload.creator_id ?? ''),
          user_id: typeof payload.user_id === 'string' ? payload.user_id : undefined,
          display_name: typeof payload.display_name === 'string' ? payload.display_name : undefined,
          email: typeof payload.email === 'string' ? payload.email : undefined,
          default_split_percent: typeof payload.default_split_percent === 'number' ? payload.default_split_percent : undefined,
          tax_info: payload.tax_info as any,
          payout_preferences: payload.payout_preferences as any,
          metadata: payload.metadata as Record<string, any> | undefined,
        }, requestId)

        return respondWithResult(req, requestId, response)
      }

      return errorResponse('Method not allowed', 405, req, requestId)
    }

    if (segments.length === 1) {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = await getParticipantBalanceResponse(req, supabase, ledger, segments[0], requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && segments[1] === 'payout-eligibility') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = await getParticipantPayoutEligibilityResponse(req, supabase, ledger, segments[0], requestId)
      return respondWithResult(req, requestId, response)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
