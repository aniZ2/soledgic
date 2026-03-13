import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getNumberParam,
  getResourceSegments,
  respondWithResult,
} from '../_shared/treasury-resource.ts'
import {
  autoMatchReconciliationResponse,
  createReconciliationMatchResponse,
  createReconciliationSnapshotResponse,
  deleteReconciliationMatchResponse,
  getReconciliationSnapshotResponse,
  listUnmatchedTransactionsResponse,
} from '../_shared/reconciliations-service.ts'

const handler = createHandler(
  { endpoint: 'reconciliations', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'reconciliations')

    if (segments.length === 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    if (segments.length === 1 && segments[0] === 'unmatched') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const limit = getNumberParam(new URL(req.url), 'limit')
      const result = await listUnmatchedTransactionsResponse(req, supabase, ledger, { limit }, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'matches') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await createReconciliationMatchResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'matches') {
      if (req.method !== 'DELETE') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const result = await deleteReconciliationMatchResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'snapshots') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await createReconciliationSnapshotResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'snapshots') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const result = await getReconciliationSnapshotResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'auto-match') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await autoMatchReconciliationResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
