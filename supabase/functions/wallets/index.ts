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
  depositToWalletResponse,
  getWalletBalanceResponse,
  listWalletEntriesResponse,
  transferWalletFundsResponse,
  withdrawFromWalletResponse,
} from '../_shared/wallet-service.ts'

const handler = createHandler(
  { endpoint: 'wallets', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'wallets')
    if (segments.length === 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    const participantId = segments[0]

    if (segments.length === 1) {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = await getWalletBalanceResponse(req, supabase, ledger, { participant_id: participantId }, requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && segments[1] === 'entries') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const url = new URL(req.url)
      const limit = getNumberParam(url, 'limit')
      const offset = getNumberParam(url, 'offset')

      const response = await listWalletEntriesResponse(req, supabase, ledger, {
        participant_id: participantId,
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      }, requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && segments[1] === 'deposits') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const response = await depositToWalletResponse(req, supabase, ledger, {
        participant_id: participantId,
        amount: typeof payload.amount === 'number' ? payload.amount : undefined,
        reference_id: typeof payload.reference_id === 'string' ? payload.reference_id : undefined,
        description: typeof payload.description === 'string' ? payload.description : undefined,
        metadata: payload.metadata as Record<string, unknown> | undefined,
      }, requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && segments[1] === 'withdrawals') {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const response = await withdrawFromWalletResponse(req, supabase, ledger, {
        participant_id: participantId,
        amount: typeof payload.amount === 'number' ? payload.amount : undefined,
        reference_id: typeof payload.reference_id === 'string' ? payload.reference_id : undefined,
        description: typeof payload.description === 'string' ? payload.description : undefined,
        metadata: payload.metadata as Record<string, unknown> | undefined,
      }, requestId)
      return respondWithResult(req, requestId, response)
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
