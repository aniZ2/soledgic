// Soledgic Edge Function: Submit Tax Info
// DEPRECATED - This function is intentionally disabled
// Soledgic does NOT store SSN/EIN/TIN or addresses
// Tax reporting exports amounts only - customers merge with their own records
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse
} from '../_shared/utils.ts'

const handler = createHandler(
  { endpoint: 'submit-tax-info', requireAuth: false, rateLimit: true },
  async (req, _supabase, _ledger, _body, { requestId }) => {
    // This endpoint is deprecated
    // Soledgic exports tax amounts only - no PII storage
    return jsonResponse({
      success: false,
      error: 'This endpoint is deprecated. Soledgic does not store tax identification information. Use /tax-documents to export payment amounts, then merge with your own recipient records for 1099 filing.'
    }, 410, req, requestId) // 410 Gone
  }
)

Deno.serve(handler)
