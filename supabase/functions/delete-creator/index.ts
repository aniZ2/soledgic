// Soledgic Edge Function: Delete Creator
// POST /delete-creator
// Standard: soft-delete (is_active = false) only if zero entries
// Force (test mode only): void all transactions + entries, then soft-delete

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
  force?: boolean
}

const handler = createHandler(
  { endpoint: 'delete-creator', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: DeleteCreatorRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const creatorId = validateId(body.creator_id, 100)
    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
    }

    // Live mode: no deletion of any kind
    if (ledger.livemode) {
      return errorResponse('Creators cannot be deleted in live mode', 403, req, requestId)
    }

    // Force delete: void all transactions + soft-delete (test mode only)
    if (body.force === true) {
      const { data: forceResult, error: forceError } = await supabase.rpc('force_delete_creator', {
        p_ledger_id: ledger.id,
        p_creator_id: creatorId,
      })

      if (forceError) {
        console.error('Failed to force-delete creator:', forceError)
        return errorResponse('Failed to delete creator', 500, req, requestId)
      }

      if (!forceResult?.success) {
        const errMsg = forceResult?.error || 'Failed to delete creator'
        return errorResponse(errMsg, errMsg.includes('live mode') ? 403 : 404, req, requestId)
      }

      createAuditLogAsync(supabase, req, {
        ledger_id: ledger.id,
        action: 'creator.force_deleted',
        entity_type: 'account',
        entity_id: forceResult.account_id,
        actor_type: 'api',
        request_body: sanitizeForAudit({
          creator_id: creatorId,
          voided_transactions: forceResult.voided_transactions,
        }),
        response_status: 200,
        risk_score: 60,
      }, requestId)

      return jsonResponse({
        success: true,
        message: 'Creator force-deleted (test mode)',
        voided_transactions: forceResult.voided_transactions,
        voided_entries: forceResult.voided_entries,
        deleted_at: new Date().toISOString(),
      }, 200, req, requestId)
    }

    // Standard delete: only works if creator has zero entries
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
      const hint = !ledger.livemode && errMsg.includes('existing transactions')
        ? ' Use force: true to void transactions and delete in test mode.'
        : ''
      return errorResponse(errMsg + hint, status, req, requestId)
    }

    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'creator.deleted',
      entity_type: 'account',
      entity_id: row.out_account_id,
      actor_type: 'api',
      request_body: sanitizeForAudit({ creator_id: creatorId }),
      response_status: 200,
      risk_score: 40,
    }, requestId)

    return jsonResponse({
      success: true,
      message: 'Creator deleted successfully',
      deleted_at: new Date().toISOString(),
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
