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

    // Find the creator account
    const { data: account, error: findError } = await supabase
      .from('accounts')
      .select('id, name, entity_id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', creatorId)
      .eq('is_active', true)
      .single()

    if (findError || !account) {
      return errorResponse('Creator not found', 404, req, requestId)
    }

    // Guard: check for existing entries
    const { count, error: countError } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)

    if (countError) {
      console.error('Failed to check entries:', countError)
      return errorResponse('Failed to verify creator transactions', 500, req, requestId)
    }

    if (count && count > 0) {
      return errorResponse('Cannot delete creator with existing transactions', 409, req, requestId)
    }

    // Soft delete: set is_active = false
    const { error: updateError } = await supabase
      .from('accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', account.id)

    if (updateError) {
      console.error('Failed to delete creator:', updateError)
      return errorResponse('Failed to delete creator', 500, req, requestId)
    }

    // Audit log
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'creator.deleted',
      resource_type: 'account',
      resource_id: account.id,
      details: sanitizeForAudit({
        creator_id: creatorId,
        display_name: account.name,
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
