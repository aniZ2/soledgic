// Soledgic Edge Function: Submit Tax Info
// POST /submit-tax-info
// Collect W-9 style tax identity for a creator (last 4 of TIN only)

import {
  createHandler,
  jsonResponse,
  validateId,
  validateString,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getLinkedUserIdForParticipant,
  upsertSharedTaxProfile,
} from '../_shared/identity-service.ts'

function taxInfoError(req: Request, requestId: string, error: string, status: number, errorCode: string) {
  return jsonResponse({
    success: false,
    error,
    error_code: errorCode,
  }, status, req, requestId)
}

const VALID_TAX_ID_TYPES = ['ssn', 'ein', 'itin'] as const
const VALID_BUSINESS_TYPES = ['individual', 'sole_proprietor', 'llc', 'corporation', 'partnership'] as const

interface SubmitTaxInfoRequest {
  participant_id?: string
  creator_id?: string
  legal_name: string
  tax_id_type: typeof VALID_TAX_ID_TYPES[number]
  tax_id_last4: string
  business_type: typeof VALID_BUSINESS_TYPES[number]
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  certify: boolean
}

const handler = createHandler(
  { endpoint: 'submit-tax-info', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: SubmitTaxInfoRequest, { requestId }) => {
    if (!ledger) {
      return taxInfoError(req, requestId, 'Ledger not found', 401, 'ledger_not_found')
    }

    if (req.method !== 'POST') {
      return taxInfoError(req, requestId, 'Method not allowed', 405, 'method_not_allowed')
    }

    const participantId = validateId(body.participant_id ?? body.creator_id, 100)
    if (!participantId) {
      return taxInfoError(req, requestId, 'Invalid participant_id', 400, 'invalid_participant_id')
    }

    // Validate legal_name
    const legalName = validateString(body.legal_name, 255)
    if (!legalName) {
      return taxInfoError(req, requestId, 'legal_name is required (max 255 characters)', 400, 'invalid_legal_name')
    }

    // Validate tax_id_type
    if (!VALID_TAX_ID_TYPES.includes(body.tax_id_type as any)) {
      return taxInfoError(req, requestId, 'tax_id_type must be one of: ssn, ein, itin', 400, 'invalid_tax_id_type')
    }

    // Validate tax_id_last4
    if (!body.tax_id_last4 || !/^\d{4}$/.test(body.tax_id_last4)) {
      return taxInfoError(req, requestId, 'tax_id_last4 must be exactly 4 digits', 400, 'invalid_tax_id_last4')
    }

    // Validate business_type
    if (!VALID_BUSINESS_TYPES.includes(body.business_type as any)) {
      return taxInfoError(
        req,
        requestId,
        'business_type must be one of: individual, sole_proprietor, llc, corporation, partnership',
        400,
        'invalid_business_type',
      )
    }

    // Require certification
    if (body.certify !== true) {
      return taxInfoError(req, requestId, 'Certification is required (certify must be true)', 400, 'missing_certification')
    }

    // Verify creator exists
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', participantId)
      .eq('is_active', true)
      .single()

    if (accountError || !account) {
      return taxInfoError(req, requestId, 'Participant not found', 404, 'participant_not_found')
    }

    // Validate address fields if provided
    const address = body.address || {}
    const addressLine1 = address.line1 ? validateString(address.line1, 255) : null
    const addressLine2 = address.line2 ? validateString(address.line2, 255) : null
    const addressCity = address.city ? validateString(address.city, 100) : null
    const addressState = address.state ? validateString(address.state, 50) : null
    const addressPostalCode = address.postal_code ? validateString(address.postal_code, 20) : null
    const addressCountry = address.country ? validateString(address.country, 2) : 'US'

    // Supersede any existing active submission
    await supabase
      .from('tax_info_submissions')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('ledger_id', ledger.id)
      .eq('entity_id', participantId)
      .eq('status', 'active')

    // Insert new submission
    const now = new Date().toISOString()
    const { data: submission, error: insertError } = await supabase
      .from('tax_info_submissions')
      .insert({
        ledger_id: ledger.id,
        entity_id: participantId,
        status: 'active',
        legal_name: legalName,
        tax_id_type: body.tax_id_type,
        tax_id_last4: body.tax_id_last4,
        business_type: body.business_type,
        address_line1: addressLine1,
        address_line2: addressLine2,
        address_city: addressCity,
        address_state: addressState,
        address_postal_code: addressPostalCode,
        address_country: addressCountry,
        certified_at: now,
        certified_by: participantId,
      })
      .select('id, entity_id, legal_name, tax_id_type, tax_id_last4, business_type, certified_at')
      .single()

    if (insertError) {
      console.error('Failed to submit tax info:', insertError)
      return taxInfoError(req, requestId, 'Failed to submit tax info', 500, 'tax_info_submission_failed')
    }

    // Audit log
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'tax_info.submitted',
      entity_type: 'tax_info_submission',
      entity_id: submission.id,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        participant_id: participantId,
        tax_id_type: body.tax_id_type,
        tax_id_last4: body.tax_id_last4,
        business_type: body.business_type,
      }),
    }, requestId)

    const linkedUserId = await getLinkedUserIdForParticipant(supabase, ledger.id, participantId)
    if (linkedUserId) {
      await upsertSharedTaxProfile(supabase, linkedUserId, {
        legal_name: legalName,
        tax_id_type: body.tax_id_type,
        tax_id_last4: body.tax_id_last4,
        business_type: body.business_type,
        address: {
          line1: addressLine1,
          line2: addressLine2,
          city: addressCity,
          state: addressState,
          postal_code: addressPostalCode,
          country: addressCountry,
        },
        certified_at: now,
        certified_by: participantId,
        metadata: {
          source: 'submit-tax-info',
          ledger_id: ledger.id,
          participant_id: participantId,
        },
      })
    }

    return jsonResponse({
      success: true,
      submission,
    }, 201, req, requestId)
  }
)

Deno.serve(handler)
