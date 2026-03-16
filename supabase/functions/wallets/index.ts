// SERVICE_ID: SVC_WALLET_ROUTER
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
  createWalletResponse,
  getWalletByIdResponse,
  getWalletBalanceResponse,
  listWalletEntriesResponse,
  listWalletEntriesByIdResponse,
  listWalletsResponse,
  topUpWalletByIdResponse,
  withdrawFromWalletByIdResponse,
  withdrawFromWalletResponse,
} from '../_shared/wallet-service.ts'
import { validateUUID } from '../_shared/utils.ts'

const handler = createHandler(
  { endpoint: 'wallets', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'wallets')
    if (segments.length === 0) {
      const url = new URL(req.url)

      if (req.method === 'GET') {
        const response = await listWalletsResponse(req, supabase, ledger, {
          owner_id: url.searchParams.get('owner_id') || url.searchParams.get('participant_id') || url.searchParams.get('user_id') || undefined,
          owner_type: url.searchParams.get('owner_type') || undefined,
          wallet_type: url.searchParams.get('wallet_type') || undefined,
          limit: getNumberParam(url, 'limit'),
          offset: getNumberParam(url, 'offset'),
        }, requestId)
        return respondWithResult(req, requestId, response)
      }

      if (req.method === 'POST') {
        const payload = asJsonObject(body)
        if (!payload) {
          return errorResponse('Invalid JSON body', 400, req, requestId)
        }

        const response = await createWalletResponse(req, supabase, ledger, {
          owner_id: typeof payload.owner_id === 'string' ? payload.owner_id : undefined,
          participant_id: typeof payload.participant_id === 'string' ? payload.participant_id : undefined,
          owner_type: typeof payload.owner_type === 'string' ? payload.owner_type : undefined,
          wallet_type: typeof payload.wallet_type === 'string' ? payload.wallet_type : undefined,
          name: typeof payload.name === 'string' ? payload.name : undefined,
          metadata: payload.metadata as Record<string, unknown> | undefined,
        }, requestId)
        return respondWithResult(req, requestId, response)
      }

      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const resourceId = segments[0]
    const walletId = validateUUID(resourceId)

    if (segments.length === 1) {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const response = walletId
        ? await getWalletByIdResponse(req, supabase, ledger, walletId, requestId)
        : await getWalletBalanceResponse(req, supabase, ledger, { participant_id: resourceId }, requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && segments[1] === 'entries') {
      if (req.method !== 'GET') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const url = new URL(req.url)
      const limit = getNumberParam(url, 'limit')
      const offset = getNumberParam(url, 'offset')

      const response = walletId
        ? await listWalletEntriesByIdResponse(req, supabase, ledger, walletId, {
            ...(limit !== undefined ? { limit } : {}),
            ...(offset !== undefined ? { offset } : {}),
          }, requestId)
        : await listWalletEntriesResponse(req, supabase, ledger, {
            participant_id: resourceId,
            ...(limit !== undefined ? { limit } : {}),
            ...(offset !== undefined ? { offset } : {}),
          }, requestId)
      return respondWithResult(req, requestId, response)
    }

    if (segments.length === 2 && (segments[1] === 'deposits' || segments[1] === 'topups')) {
      if (req.method !== 'POST') {
        return errorResponse('Method not allowed', 405, req, requestId)
      }

      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const response = walletId
        ? await topUpWalletByIdResponse(req, supabase, ledger, walletId, {
            amount: typeof payload.amount === 'number' ? payload.amount : undefined,
            reference_id: typeof payload.reference_id === 'string' ? payload.reference_id : undefined,
            description: typeof payload.description === 'string' ? payload.description : undefined,
            metadata: payload.metadata as Record<string, unknown> | undefined,
          }, requestId)
        : await depositToWalletResponse(req, supabase, ledger, {
            participant_id: resourceId,
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

      const response = walletId
        ? await withdrawFromWalletByIdResponse(req, supabase, ledger, walletId, {
            amount: typeof payload.amount === 'number' ? payload.amount : undefined,
            reference_id: typeof payload.reference_id === 'string' ? payload.reference_id : undefined,
            description: typeof payload.description === 'string' ? payload.description : undefined,
            metadata: payload.metadata as Record<string, unknown> | undefined,
          }, requestId)
        : await withdrawFromWalletResponse(req, supabase, ledger, {
            participant_id: resourceId,
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
