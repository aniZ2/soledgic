import {
  createHandler,
  errorResponse,
  jsonResponse,
  LedgerContext,
  createAuditLog,
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
      if (req.method === 'GET') {
        const response = await getParticipantBalanceResponse(req, supabase, ledger, segments[0], requestId)
        return respondWithResult(req, requestId, response)
      }

      if (req.method === 'DELETE') {
        // Only allowed on test-mode ledgers
        const { data: ledgerRow } = await supabase
          .from('ledgers')
          .select('livemode')
          .eq('id', ledger.id)
          .single()

        if (ledgerRow?.livemode === true) {
          return errorResponse('Cannot delete participants on live ledgers. Use test mode.', 403, req, requestId)
        }

        const participantId = segments[0]

        // Find the participant's account(s)
        const { data: accounts, error: accErr } = await supabase
          .from('accounts')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('entity_id', participantId)

        if (accErr || !accounts || accounts.length === 0) {
          return errorResponse('Participant not found', 404, req, requestId)
        }

        const accountIds = accounts.map((a: { id: string }) => a.id)

        // Delete entries for these accounts
        const { error: entriesErr } = await supabase
          .from('entries')
          .delete()
          .in('account_id', accountIds)

        if (entriesErr) {
          return errorResponse(`Failed to delete entries: ${entriesErr.message}`, 500, req, requestId)
        }

        // Delete transactions that only involve this participant's accounts
        // (transactions with entries ONLY in this participant's accounts)
        const { data: txnIds } = await supabase
          .from('entries')
          .select('transaction_id')
          .in('account_id', accountIds)

        // The entries are already deleted, so find orphaned transactions
        // (transactions with zero remaining entries)
        if (txnIds && txnIds.length > 0) {
          const uniqueTxnIds = [...new Set(txnIds.map((t: { transaction_id: string }) => t.transaction_id))]
          for (const txnId of uniqueTxnIds) {
            const { count } = await supabase
              .from('entries')
              .select('id', { count: 'exact', head: true })
              .eq('transaction_id', txnId)
            if (count === 0) {
              await supabase.from('transactions').delete().eq('id', txnId)
            }
          }
        }

        // Delete transaction links referencing deleted transactions
        await supabase
          .from('transaction_links')
          .delete()
          .eq('ledger_id', ledger.id)
          .or(accountIds.map((id: string) => `source_id.eq.${id}`).join(','))

        // Delete connected accounts
        await supabase
          .from('connected_accounts')
          .delete()
          .eq('ledger_id', ledger.id)
          .eq('entity_id', participantId)

        // Delete the accounts themselves
        const { error: deleteErr } = await supabase
          .from('accounts')
          .delete()
          .in('id', accountIds)

        if (deleteErr) {
          // Soft-delete fallback if hard delete fails (FK constraints)
          await supabase
            .from('accounts')
            .update({ is_active: false })
            .in('id', accountIds)
        }

        await createAuditLog(supabase, req, {
          ledger_id: ledger.id,
          action: 'participant.purged',
          entity_type: 'account',
          actor_type: 'api',
          request_body: { participant_id: participantId, accounts_deleted: accountIds.length, test_mode: true },
          risk_score: 50,
        }, requestId)

        return jsonResponse({
          success: true,
          message: 'Test participant deleted',
          participant_id: participantId,
          accounts_deleted: accountIds.length,
        }, 200, req, requestId)
      }

      return errorResponse('Method not allowed', 405, req, requestId)
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
