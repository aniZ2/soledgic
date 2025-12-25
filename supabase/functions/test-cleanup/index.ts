// Soledgic Edge Function: Test Data Cleanup
// POST /test-cleanup
// Cleans up all test data for a ledger before running stress tests
// SECURITY: Only works with authenticated API key

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext
} from '../_shared/utils.ts'

const handler = createHandler(
  { endpoint: 'test-cleanup', requireAuth: true, rateLimit: false },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    try {
      // Use the database function for cleanup
      const { data, error } = await supabase.rpc('cleanup_ledger_data', {
        p_ledger_id: ledger.id
      })

      if (error) {
        console.error('Cleanup error:', error)
        return errorResponse(`Cleanup failed: ${error.message}`, 500, req, requestId)
      }

      return jsonResponse({
        success: true,
        message: 'Test data cleaned up successfully',
        ledger_id: ledger.id
      }, 200, req, requestId)

    } catch (error) {
      console.error('Cleanup error:', error)
      return errorResponse(`Cleanup failed: ${error.message}`, 500, req, requestId)
    }
  }
)

Deno.serve(handler)
