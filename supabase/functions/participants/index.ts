import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getResourceSegments,
  mapParticipantCreateResponse,
  mapParticipantSummary,
  mapPayoutEligibilityResponse,
  transformJsonResponse,
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
        return transformJsonResponse(req, requestId, response, (source) => ({
          success: source.success,
          participants: Array.isArray(source.data)
            ? source.data.map((row) => mapParticipantSummary(asJsonObject(row) || {}))
            : [],
        }))
      }

      if (req.method === 'POST') {
        const payload = asJsonObject(body)
        if (!payload) {
          return errorResponse('Invalid JSON body', 400, req, requestId)
        }

        const response = await createParticipantResponse(req, supabase, ledger, {
          creator_id: String(payload.participant_id ?? payload.creator_id ?? ''),
          display_name: typeof payload.display_name === 'string' ? payload.display_name : undefined,
          email: typeof payload.email === 'string' ? payload.email : undefined,
          default_split_percent: typeof payload.default_split_percent === 'number' ? payload.default_split_percent : undefined,
          tax_info: payload.tax_info as any,
          payout_preferences: payload.payout_preferences as any,
          metadata: payload.metadata as Record<string, any> | undefined,
        }, requestId)

        return transformJsonResponse(req, requestId, response, mapParticipantCreateResponse)
      }

      return errorResponse('Method not allowed', 405, req, requestId)
    }

    if (segments.length === 1) {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = await getParticipantBalanceResponse(req, supabase, ledger, segments[0], requestId)
      return transformJsonResponse(req, requestId, response, (source) => {
        const participant = asJsonObject(source.data) || {}
        return {
          success: source.success,
          participant: {
            id: participant.creator_id,
            name: participant.name,
            tier: participant.tier,
            custom_split_percent: participant.custom_split,
            ledger_balance: participant.ledger_balance,
            held_amount: participant.held_amount,
            available_balance: participant.available_balance,
            holds: Array.isArray(participant.holds) ? participant.holds : [],
          },
        }
      })
    }

    if (segments.length === 2 && segments[1] === 'payout-eligibility') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = await getParticipantPayoutEligibilityResponse(req, supabase, ledger, segments[0], requestId)
      return transformJsonResponse(req, requestId, response, mapPayoutEligibilityResponse)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
