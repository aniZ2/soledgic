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
  createFraudEvaluationResponse,
  createFraudPolicyResponse,
  deleteFraudPolicyResponse,
  getFraudEvaluationResponse,
  listFraudPoliciesResponse,
} from '../_shared/fraud-service.ts'

const handler = createHandler(
  { endpoint: 'fraud', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'fraud')

    if (segments.length === 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    if (segments.length === 2 && segments[0] === 'evaluations' && req.method === 'GET') {
      const result = await getFraudEvaluationResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'evaluations' && req.method === 'POST') {
      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await createFraudEvaluationResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'policies' && req.method === 'GET') {
      const result = await listFraudPoliciesResponse(req, supabase, ledger, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'policies' && req.method === 'POST') {
      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await createFraudPolicyResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'policies' && req.method === 'DELETE') {
      const result = await deleteFraudPolicyResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
