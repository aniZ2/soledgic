// Debug version using createHandler to isolate the issue
import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TestRequest {
  message?: string
}

const handler = createHandler(
  { endpoint: 'debug-handler', requireAuth: true, rateLimit: false },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: TestRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Simple test - just return ledger info
    return jsonResponse({
      success: true,
      ledger_id: ledger.id,
      ledger_mode: ledger.ledger_mode,
      message: body.message || 'no message'
    }, 200, req)
  }
)

Deno.serve(handler)
