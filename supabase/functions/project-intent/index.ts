// Soledgic Edge Function: Project Intent
// POST /project-intent
//
// Projects future obligations based on authorizing instrument terms.
// Creates ghost entries (projected_transactions) that NEVER affect:
// - entries table
// - account balances
// - reports like trial-balance
//
// Ghost entries exist only for:
// - Future intent expression
// - Snap-to matching when reality arrives

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateUUID,
  validateDate,
  validateInteger,
  LedgerContext,
  createAuditLog
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ProjectIntentRequest {
  authorizing_instrument_id: string
  until_date: string  // ISO date string
  horizon_count?: number  // Optional: max projections to create (default 12)
}

interface AuthorizingInstrument {
  id: string
  ledger_id: string
  status: string
  external_ref: string
  extracted_terms: {
    amount: number
    currency: string
    cadence?: string
    counterparty_name: string
  }
}

// Supported cadences for deterministic projection
const SUPPORTED_CADENCES = ['weekly', 'bi_weekly', 'monthly', 'quarterly', 'annual', 'yearly']

// Map cadence to interval in days (approximate for date generation)
function getCadenceInterval(cadence: string): number {
  switch (cadence.toLowerCase()) {
    case 'weekly': return 7
    case 'bi_weekly': return 14
    case 'monthly': return 30
    case 'quarterly': return 91
    case 'annual':
    case 'yearly': return 365
    default: return 0
  }
}

// Generate expected dates based on cadence
function generateExpectedDates(
  startDate: Date,
  untilDate: Date,
  cadence: string,
  maxCount: number
): Date[] {
  const dates: Date[] = []
  let current = new Date(startDate)

  while (current <= untilDate && dates.length < maxCount) {
    dates.push(new Date(current))

    // Advance to next date based on cadence
    switch (cadence.toLowerCase()) {
      case 'weekly':
        current.setDate(current.getDate() + 7)
        break
      case 'bi_weekly':
        current.setDate(current.getDate() + 14)
        break
      case 'monthly':
        current.setMonth(current.getMonth() + 1)
        break
      case 'quarterly':
        current.setMonth(current.getMonth() + 3)
        break
      case 'annual':
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1)
        break
    }
  }

  return dates
}

const handler = createHandler(
  { endpoint: 'project-intent', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: ProjectIntentRequest,
    context: { requestId: string; startTime: number }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    // Validate authorizing_instrument_id
    const instrumentId = validateUUID(body.authorizing_instrument_id)
    if (!instrumentId) {
      return errorResponse('Invalid authorizing_instrument_id: must be valid UUID', 400, req, context.requestId)
    }

    // Validate until_date
    const untilDateStr = validateDate(body.until_date)
    if (!untilDateStr) {
      return errorResponse('Invalid until_date: must be valid ISO date', 400, req, context.requestId)
    }
    const untilDate = new Date(untilDateStr)

    // Validate horizon_count (optional, default 12, max 60)
    const horizonCount = body.horizon_count
      ? validateInteger(body.horizon_count, 1, 60)
      : 12
    if (horizonCount === null) {
      return errorResponse('Invalid horizon_count: must be integer 1-60', 400, req, context.requestId)
    }

    // Fetch the authorizing instrument
    const { data: instrument, error: instrumentError } = await supabase
      .from('authorizing_instruments')
      .select('id, ledger_id, status, external_ref, extracted_terms')
      .eq('id', instrumentId)
      .eq('ledger_id', ledger.id)  // Ensure instrument belongs to this ledger
      .single()

    if (instrumentError || !instrument) {
      return errorResponse('Authorizing instrument not found', 404, req, context.requestId)
    }

    const typedInstrument = instrument as AuthorizingInstrument

    // Check instrument status
    if (typedInstrument.status === 'invalidated') {
      return errorResponse('Cannot project from invalidated instrument', 400, req, context.requestId)
    }

    // Validate cadence is supported
    const cadence = typedInstrument.extracted_terms.cadence?.toLowerCase()
    if (!cadence || !SUPPORTED_CADENCES.includes(cadence)) {
      return jsonResponse({
        success: false,
        error: 'Unsupported cadence for projection',
        supported_cadences: SUPPORTED_CADENCES,
        instrument_cadence: typedInstrument.extracted_terms.cadence || 'none'
      }, 400, req, context.requestId)
    }

    // One-time cadence cannot be projected repeatedly
    if (cadence === 'one_time') {
      return errorResponse('Cannot project one_time cadence - use single projection', 400, req, context.requestId)
    }

    // Generate expected dates starting from today (or next occurrence)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const expectedDates = generateExpectedDates(today, untilDate, cadence, horizonCount)

    if (expectedDates.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No projections created: until_date is before first expected date',
        projections_created: 0
      }, 200, req, context.requestId)
    }

    // Prepare projection records
    const amount = typedInstrument.extracted_terms.amount / 100  // Convert cents to dollars
    const currency = typedInstrument.extracted_terms.currency || 'USD'
    const counterpartyName = typedInstrument.extracted_terms.counterparty_name

    const projectionRecords = expectedDates.map(date => ({
      ledger_id: ledger.id,
      authorizing_instrument_id: instrumentId,
      expected_date: date.toISOString().split('T')[0],  // YYYY-MM-DD
      amount: amount,
      currency: currency.toUpperCase(),
      status: 'pending',
      metadata: {
        counterparty_name: counterpartyName,
        external_ref: typedInstrument.external_ref,
        cadence: cadence
      }
    }))

    // Batch insert using ON CONFLICT DO NOTHING (via upsert with ignoreDuplicates)
    const { data: inserted, error: insertError } = await supabase
      .from('projected_transactions')
      .upsert(projectionRecords, {
        onConflict: 'ledger_id,authorizing_instrument_id,expected_date,amount,currency',
        ignoreDuplicates: true
      })
      .select('id, expected_date')

    if (insertError) {
      console.error(`[${context.requestId}] Failed to create projections:`, insertError.message)
      return errorResponse('Failed to create projections', 500, req, context.requestId)
    }

    const projectionsCreated = inserted?.length || 0

    // Audit log
    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'project_intent',
      entity_type: 'projected_transactions',
      entity_id: instrumentId,
      actor_type: 'api',
      request_body: {
        instrument_id: instrumentId,
        external_ref: typedInstrument.external_ref,
        until_date: untilDateStr,
        cadence: cadence,
        projections_requested: expectedDates.length,
        projections_created: projectionsCreated
      },
      risk_score: 10
    }, context.requestId)

    return jsonResponse({
      success: true,
      instrument_id: instrumentId,
      external_ref: typedInstrument.external_ref,
      cadence: cadence,
      projections_created: projectionsCreated,
      projections_requested: expectedDates.length,
      duplicates_skipped: expectedDates.length - projectionsCreated,
      date_range: {
        from: expectedDates[0]?.toISOString().split('T')[0],
        to: expectedDates[expectedDates.length - 1]?.toISOString().split('T')[0]
      },
      projected_dates: inserted?.map(p => p.expected_date) || []
    }, 200, req, context.requestId)
  }
)

Deno.serve(handler)
