// Soledgic Edge Function: Delete Creator
// POST /delete-creator
// Soft-deletes a creator (sets is_active = false) only if they have zero entries

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface DeleteCreatorRequest {
  creator_id: string
}

const handler = createHandler(
  { endpoint: 'delete-creator', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: DeleteCreatorRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // Validate required fields
    const creatorId = validateId(body.creator_id, 100)
    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
    }

    // Atomic delete: check entries + soft-delete in a single transaction
    const { data: result, error: rpcError } = await supabase.rpc('delete_creator_atomic', {
      p_ledger_id: ledger.id,
      p_creator_id: creatorId,
    })

    if (rpcError) {
      console.error('Failed to delete creator:', rpcError)
      return errorResponse('Failed to delete creator', 500, req, requestId)
    }

    const row = result?.[0] || result
    if (!row?.out_deleted) {
      const errMsg = row?.out_error || 'Creator not found'
      const status = errMsg.includes('existing transactions') ? 409 : 404
      return errorResponse(errMsg, status, req, requestId)
    }

    // Audit log
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'creator.deleted',
      resource_type: 'account',
      resource_id: row.out_account_id,
      details: sanitizeForAudit({
        creator_id: creatorId,
      }),
      request_id: requestId
    })

    return jsonResponse({
      success: true,
      message: 'Creator deleted successfully',
      deleted_at: new Date().toISOString(),
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
