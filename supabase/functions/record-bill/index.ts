// Soledgic Edge Function: Record Bill
// POST /record-bill
// Records a bill (accounts payable) - works for any ledger mode
// SECURITY HARDENED VERSION

import {
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  validateAmount,
  validateUUID,
  getClientIp,
  logSecurityEvent
} from '../_shared/utils.ts'

interface RecordBillRequest {
  amount: number
  description: string
  vendor_name: string
  vendor_id?: string
  reference_id?: string
  due_date?: string
  expense_category?: string
  paid?: boolean
  metadata?: Record<string, any>
  authorizing_instrument_id?: string  // Optional: link to authorizing instrument for validation
  authorization_decision_id?: string  // Optional: preflight authorization decision ID
}

interface AuthorizingInstrument {
  id: string
  ledger_id: string
  external_ref: string
  extracted_terms: {
    amount: number
    currency: string
    cadence?: string
    counterparty_name: string
  }
}

interface InstrumentValidationResult {
  verified: boolean
  instrument_id: string
  external_ref: string
  mismatches: string[]
}

interface ProjectionMatch {
  projection_id: string
  authorizing_instrument_id: string
  expected_date: string
  amount: number
  currency: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return errorResponse('Missing API key', 401, req)
    }

    const supabase = getSupabaseClient()
    const ledger = await validateApiKey(supabase, apiKey)

    if (!ledger) {
      return errorResponse('Invalid API key', 401, req)
    }

    if (ledger.status !== 'active') {
      return errorResponse('Ledger is not active', 403, req)
    }

    const body: RecordBillRequest = await req.json()

    // Validate required fields
    const amount = validateAmount(body.amount)
    const description = validateString(body.description, 500)
    const vendorName = validateString(body.vendor_name, 200)

    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be positive integer (cents)', 400, req)
    }
    if (!description) {
      return errorResponse('Invalid or missing description', 400, req)
    }
    if (!vendorName) {
      return errorResponse('Invalid or missing vendor_name', 400, req)
    }

    const amountInDollars = amount / 100
    const isPaid = body.paid === true

    // Get accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, account_type')
      .eq('ledger_id', ledger.id)
      .in('account_type', ['cash', 'accounts_payable', 'expense'])

    let cashAccount = accounts?.find(a => a.account_type === 'cash')
    let apAccount = accounts?.find(a => a.account_type === 'accounts_payable')
    let expenseAccount = accounts?.find(a => a.account_type === 'expense')

    // Create missing accounts as needed
    if (!expenseAccount) {
      const { data: newExpense } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'expense',
          entity_type: 'business',
          name: 'Operating Expenses'
        })
        .select('id, account_type')
        .single()
      expenseAccount = newExpense
    }

    if (!apAccount && !isPaid) {
      const { data: newAP } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'accounts_payable',
          entity_type: 'business',
          name: 'Accounts Payable'
        })
        .select('id, account_type')
        .single()
      apAccount = newAP
    }

    if (!expenseAccount) {
      return errorResponse('Expense account not found', 500, req)
    }

    // Get expense category if provided
    let expenseCategoryId = null
    if (body.expense_category) {
      const categoryCode = validateId(body.expense_category, 50)
      if (categoryCode) {
        const { data: category } = await supabase
          .from('expense_categories')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('code', categoryCode)
          .single()
        if (category) expenseCategoryId = category.id
      }
    }

    // ========================================================================
    // PREFLIGHT AUTHORIZATION VERIFICATION (Phase 3)
    // ========================================================================
    // If authorization_decision_id is provided, verify it before proceeding.
    // This does NOT affect double-entry logic - only validates the decision.

    let authorizationDecision: {
      id: string
      decision: string
      expires_at: string
    } | null = null

    if (body.authorization_decision_id) {
      const decisionId = validateUUID(body.authorization_decision_id)
      if (!decisionId) {
        return errorResponse('Invalid authorization_decision_id: must be valid UUID', 400, req)
      }

      // Load the decision
      const { data: decision, error: decisionError } = await supabase
        .from('authorization_decisions')
        .select('id, decision, expires_at, proposed_transaction')
        .eq('id', decisionId)
        .eq('ledger_id', ledger.id)
        .single()

      if (decisionError || !decision) {
        return errorResponse('Authorization decision not found', 404, req)
      }

      // Check if decision has expired
      if (new Date(decision.expires_at) < new Date()) {
        return errorResponse('Authorization decision has expired', 400, req)
      }

      // Check if decision allows proceeding
      if (decision.decision === 'blocked') {
        return errorResponse('Transaction blocked by authorization policy', 403, req)
      }

      authorizationDecision = {
        id: decision.id,
        decision: decision.decision,
        expires_at: decision.expires_at
      }
    }

    // ========================================================================
    // AUTHORIZING INSTRUMENT VALIDATION
    // ========================================================================
    // If an authorizing_instrument_id is provided, load and validate it
    // This does NOT affect double-entry logic - only adds verification metadata

    let instrument: AuthorizingInstrument | null = null
    let instrumentValidation: InstrumentValidationResult | null = null

    if (body.authorizing_instrument_id) {
      const instrumentId = validateUUID(body.authorizing_instrument_id)
      if (!instrumentId) {
        return errorResponse('Invalid authorizing_instrument_id: must be valid UUID', 400, req)
      }

      // Load the instrument
      const { data: instrumentData, error: instrumentError } = await supabase
        .from('authorizing_instruments')
        .select('id, ledger_id, external_ref, extracted_terms')
        .eq('id', instrumentId)
        .eq('ledger_id', ledger.id)  // Ensure instrument belongs to this ledger
        .single()

      if (instrumentError || !instrumentData) {
        return errorResponse('Authorizing instrument not found', 404, req)
      }

      instrument = instrumentData as AuthorizingInstrument

      // Validate transaction against instrument terms
      const mismatches: string[] = []

      // Compare amount (transaction amount in cents vs instrument amount in cents)
      if (amount !== instrument.extracted_terms.amount) {
        mismatches.push(`amount: expected ${instrument.extracted_terms.amount}, got ${amount}`)
      }

      // Compare counterparty (vendor_name vs counterparty_name)
      const txCounterparty = (vendorName || '').toLowerCase().trim()
      const instCounterparty = (instrument.extracted_terms.counterparty_name || '').toLowerCase().trim()
      if (txCounterparty !== instCounterparty) {
        mismatches.push(`counterparty: expected "${instrument.extracted_terms.counterparty_name}", got "${vendorName}"`)
      }

      instrumentValidation = {
        verified: mismatches.length === 0,
        instrument_id: instrument.id,
        external_ref: instrument.external_ref,
        mismatches
      }

      // Log security event for mismatches
      if (!instrumentValidation.verified) {
        await logSecurityEvent(supabase, ledger.id, 'instrument_validation_mismatch', {
          instrument_id: instrument.id,
          external_ref: instrument.external_ref,
          mismatches: mismatches,
          transaction_amount: amount,
          transaction_vendor: vendorName,
          ip: getClientIp(req)
        })
      }
    }

    // Build transaction metadata with optional verification status
    const transactionMetadata: Record<string, any> = {
      vendor_id: body.vendor_id ? validateId(body.vendor_id, 100) : null,
      vendor_name: vendorName,
      due_date: body.due_date,
      paid: isPaid
    }

    // Add verification status if instrument was validated
    if (instrumentValidation) {
      transactionMetadata.verified = instrumentValidation.verified
      transactionMetadata.instrument_validation = {
        instrument_id: instrumentValidation.instrument_id,
        external_ref: instrumentValidation.external_ref,
        verified: instrumentValidation.verified,
        mismatches: instrumentValidation.mismatches
      }
    }

    // Build insert payload - only include authorizing_instrument_id if we have an instrument
    const transactionInsert: Record<string, any> = {
      ledger_id: ledger.id,
      transaction_type: isPaid ? 'expense' : 'bill',
      reference_id: body.reference_id ? validateId(body.reference_id, 255) : null,
      reference_type: 'vendor_bill',
      description: description,
      amount: amountInDollars,
      currency: (ledger.settings as any)?.currency || 'USD',
      status: 'completed',
      expense_category_id: expenseCategoryId,
      merchant_name: vendorName,
      metadata: transactionMetadata
    }

    // Only add authorizing_instrument_id if instrument exists (column may not exist in older schemas)
    if (instrument) {
      transactionInsert.authorizing_instrument_id = instrument.id
    }

    // Create transaction with optional instrument linkage
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert(transactionInsert)
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      return errorResponse('Failed to create bill', 500, req)
    }

    // Create entries (double-entry integrity preserved - instrument validation has no effect here)
    let entries = []
    if (isPaid) {
      if (!cashAccount) {
        return errorResponse('Cash account not found', 500, req)
      }
      entries = [
        { transaction_id: transaction.id, account_id: expenseAccount.id, entry_type: 'debit', amount: amountInDollars },
        { transaction_id: transaction.id, account_id: cashAccount.id, entry_type: 'credit', amount: amountInDollars }
      ]
    } else {
      if (!apAccount) {
        return errorResponse('Accounts Payable account not found', 500, req)
      }
      entries = [
        { transaction_id: transaction.id, account_id: expenseAccount.id, entry_type: 'debit', amount: amountInDollars },
        { transaction_id: transaction.id, account_id: apAccount.id, entry_type: 'credit', amount: amountInDollars }
      ]
    }

    await supabase.from('entries').insert(entries)

    // ========================================================================
    // SNAP-TO MATCHING: Shadow Ledger Integration
    // ========================================================================
    // Search for a matching projection and link if found.
    // This does NOT affect double-entry integrity - only adds traceability.

    let projectionMatch: ProjectionMatch | null = null
    const currency = (ledger.settings as any)?.currency || 'USD'

    try {
      // Get today's date for matching window (+/- 3 days)
      const today = new Date()
      const dateTolerance = 3
      const minDate = new Date(today)
      minDate.setDate(minDate.getDate() - dateTolerance)
      const maxDate = new Date(today)
      maxDate.setDate(maxDate.getDate() + dateTolerance)

      // Search for matching projection
      const { data: matchingProjection } = await supabase
        .from('projected_transactions')
        .select('id, authorizing_instrument_id, expected_date, amount, currency')
        .eq('ledger_id', ledger.id)
        .eq('status', 'pending')
        .eq('amount', amountInDollars)
        .eq('currency', currency)
        .gte('expected_date', minDate.toISOString().split('T')[0])
        .lte('expected_date', maxDate.toISOString().split('T')[0])
        .order('expected_date', { ascending: true })
        .limit(1)
        .single()

      if (matchingProjection) {
        projectionMatch = matchingProjection as ProjectionMatch

        // Fulfill the projection: update status and link to transaction
        await supabase
          .from('projected_transactions')
          .update({
            status: 'fulfilled',
            matched_transaction_id: transaction.id
          })
          .eq('id', projectionMatch.projection_id)

        // Link transaction back to projection
        await supabase
          .from('transactions')
          .update({
            projection_id: projectionMatch.projection_id,
            metadata: {
              ...transactionMetadata,
              projection_verified: true,
              matched_projection_id: projectionMatch.projection_id,
              matched_expected_date: projectionMatch.expected_date
            }
          })
          .eq('id', transaction.id)
      }
    } catch (snapError) {
      // Snap-to matching is non-critical - log but don't fail the transaction
      console.warn('Snap-to matching failed (non-critical):', snapError)
    }

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_bill',
      entity_type: 'transaction',
      entity_id: transaction.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: {
        amount: amountInDollars,
        vendor: vendorName,
        paid: isPaid,
        authorizing_instrument_id: instrument?.id || null,
        verified: instrumentValidation?.verified ?? null,
        projection_matched: projectionMatch?.projection_id || null,
        authorization_decision_id: authorizationDecision?.id || null,
        authorization_decision: authorizationDecision?.decision || null
      }
    }).then(() => {}).catch(() => {})

    // Build response
    const response: Record<string, any> = {
      success: true,
      transaction_id: transaction.id,
      amount: amountInDollars,
      status: isPaid ? 'paid' : 'pending'
    }

    // Include validation result if instrument was provided
    if (instrumentValidation) {
      response.authorization = {
        verified: instrumentValidation.verified,
        instrument_id: instrumentValidation.instrument_id,
        external_ref: instrumentValidation.external_ref,
        mismatches: instrumentValidation.mismatches.length > 0 ? instrumentValidation.mismatches : undefined
      }
    }

    // Include projection match if found (Shadow Ledger snap-to)
    if (projectionMatch) {
      response.projection = {
        matched: true,
        projection_id: projectionMatch.projection_id,
        expected_date: projectionMatch.expected_date,
        instrument_id: projectionMatch.authorizing_instrument_id
      }
    }

    // Include preflight authorization if provided (Phase 3)
    if (authorizationDecision) {
      response.preflight_authorization = {
        decision_id: authorizationDecision.id,
        decision: authorizationDecision.decision,
        warning: authorizationDecision.decision === 'warn' ? 'Transaction allowed with policy warnings' : undefined
      }
    }

    return jsonResponse(response, 200, req)

  } catch (error: any) {
    console.error('Error recording bill:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
