// Soledgic Edge Function: Register Authorizing Instrument
// POST /register-instrument
//
// Registers a financial authorization instrument (NOT a contract in CLM sense).
// Instruments are ledger-adjacent representations of financial intent used to:
// - explain why money moved
// - validate whether a transaction was authorized
// - support reconciliation-by-proof
//
// Instruments are IMMUTABLE once created. To change, invalidate and create new.

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateString,
  validateAmount,
  validateUUID,
  LedgerContext,
  getClientIp,
  createAuditLog
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ExtractedTerms {
  amount: number          // Amount in cents
  currency: string        // ISO currency code (e.g., "USD")
  cadence?: string        // "one_time", "monthly", "annual", etc.
  counterparty_name: string
}

interface RegisterInstrumentRequest {
  external_ref: string
  extracted_terms: ExtractedTerms
}

interface RegisterInstrumentResponse {
  success: boolean
  instrument_id: string
  fingerprint: string
  external_ref: string
}

/**
 * Generate deterministic fingerprint for instrument deduplication
 * This creates a SHA-256 hash of the canonical term representation
 */
async function generateFingerprint(
  externalRef: string,
  terms: ExtractedTerms
): Promise<string> {
  // Canonical string representation for consistent hashing
  const canonical = [
    externalRef || '',
    String(terms.amount || 0),
    (terms.currency || 'USD').toUpperCase(),
    (terms.cadence || 'one_time').toLowerCase(),
    (terms.counterparty_name || '').toLowerCase().trim()
  ].join('|')

  const encoder = new TextEncoder()
  const data = encoder.encode(canonical)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const handler = createHandler(
  { endpoint: 'register-instrument', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: RegisterInstrumentRequest,
    context: { requestId: string; startTime: number }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    // Validate external_ref
    const externalRef = validateString(body.external_ref, 255)
    if (!externalRef) {
      return errorResponse('Invalid external_ref: required, max 255 characters', 400, req, context.requestId)
    }

    // Validate extracted_terms
    if (!body.extracted_terms || typeof body.extracted_terms !== 'object') {
      return errorResponse('Invalid extracted_terms: required object', 400, req, context.requestId)
    }

    const terms = body.extracted_terms

    // Validate amount (in cents)
    const amount = validateAmount(terms.amount)
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid extracted_terms.amount: must be positive integer (cents)', 400, req, context.requestId)
    }

    // Validate currency
    const currency = validateString(terms.currency, 3)
    if (!currency || !/^[A-Z]{3}$/i.test(currency)) {
      return errorResponse('Invalid extracted_terms.currency: must be 3-letter ISO code', 400, req, context.requestId)
    }

    // Validate counterparty_name
    const counterpartyName = validateString(terms.counterparty_name, 200)
    if (!counterpartyName) {
      return errorResponse('Invalid extracted_terms.counterparty_name: required, max 200 characters', 400, req, context.requestId)
    }

    // Validate cadence (optional)
    const validCadences = ['one_time', 'monthly', 'quarterly', 'annual', 'weekly', 'bi_weekly']
    const cadence = terms.cadence ? validateString(terms.cadence, 20) : 'one_time'
    if (cadence && !validCadences.includes(cadence.toLowerCase())) {
      return errorResponse(`Invalid extracted_terms.cadence: must be one of ${validCadences.join(', ')}`, 400, req, context.requestId)
    }

    // Generate deterministic fingerprint
    const normalizedTerms: ExtractedTerms = {
      amount: amount,
      currency: currency.toUpperCase(),
      cadence: cadence?.toLowerCase() || 'one_time',
      counterparty_name: counterpartyName
    }
    const fingerprint = await generateFingerprint(externalRef, normalizedTerms)

    // Check for duplicate by fingerprint
    const { data: existingByFingerprint } = await supabase
      .from('authorizing_instruments')
      .select('id, external_ref')
      .eq('ledger_id', ledger.id)
      .eq('fingerprint', fingerprint)
      .single()

    if (existingByFingerprint) {
      return jsonResponse({
        success: false,
        error: 'Duplicate instrument: identical terms already registered',
        existing_instrument_id: existingByFingerprint.id,
        existing_external_ref: existingByFingerprint.external_ref
      }, 409, req, context.requestId)
    }

    // Check for duplicate by external_ref
    const { data: existingByRef } = await supabase
      .from('authorizing_instruments')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('external_ref', externalRef)
      .single()

    if (existingByRef) {
      return jsonResponse({
        success: false,
        error: 'Duplicate external_ref: already registered',
        existing_instrument_id: existingByRef.id
      }, 409, req, context.requestId)
    }

    // Insert the instrument
    const { data: instrument, error: insertError } = await supabase
      .from('authorizing_instruments')
      .insert({
        ledger_id: ledger.id,
        external_ref: externalRef,
        fingerprint: fingerprint,
        extracted_terms: normalizedTerms
      })
      .select('id')
      .single()

    if (insertError) {
      console.error(`[${context.requestId}] Failed to register instrument:`, insertError.message)
      return errorResponse('Failed to register instrument', 500, req, context.requestId)
    }

    // Audit log
    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'register_instrument',
      entity_type: 'authorizing_instrument',
      entity_id: instrument.id,
      actor_type: 'api',
      request_body: {
        external_ref: externalRef,
        amount: amount,
        currency: currency.toUpperCase(),
        cadence: cadence,
        counterparty_name: counterpartyName,
        fingerprint_prefix: fingerprint.substring(0, 16)
      },
      risk_score: 10
    }, context.requestId)

    return jsonResponse({
      success: true,
      instrument_id: instrument.id,
      fingerprint: fingerprint,
      external_ref: externalRef
    } as RegisterInstrumentResponse, 200, req, context.requestId)
  }
)

Deno.serve(handler)
