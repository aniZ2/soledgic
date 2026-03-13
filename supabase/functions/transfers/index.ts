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
import { transferWalletFundsResponse } from '../_shared/wallet-service.ts'

const handler = createHandler(
  { endpoint: 'transfers', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'transfers')
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

    const response = await transferWalletFundsResponse(req, supabase, ledger, {
      from_wallet_id: typeof payload.from_wallet_id === 'string' ? payload.from_wallet_id : undefined,
      to_wallet_id: typeof payload.to_wallet_id === 'string' ? payload.to_wallet_id : undefined,
      from_participant_id: typeof payload.from_participant_id === 'string' ? payload.from_participant_id : undefined,
      to_participant_id: typeof payload.to_participant_id === 'string' ? payload.to_participant_id : undefined,
      amount: typeof payload.amount === 'number' ? payload.amount : undefined,
      reference_id: typeof payload.reference_id === 'string' ? payload.reference_id : undefined,
      description: typeof payload.description === 'string' ? payload.description : undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
    }, requestId)

    return respondWithResult(req, requestId, response)
  },
)

Deno.serve(handler)
