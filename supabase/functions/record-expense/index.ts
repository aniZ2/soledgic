// Soledgic Edge Function: Record Expense
// POST /record-expense
// Records a business expense (Standard + Marketplace mode)
// SECURITY HARDENED VERSION

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  validateAmount,
  validateString,
  validateUrl,
  validateUUID,
  LedgerContext,
  getClientIp,
  logSecurityEvent
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ExpenseRequest {
  reference_id: string
  amount: number
  description: string
  category?: string
  vendor_id?: string
  vendor_name?: string
  paid_from?: 'cash' | 'credit_card' | string
  receipt_url?: string
  tax_deductible?: boolean
  metadata?: Record<string, any>
  authorizing_instrument_id?: string  // Optional: link to authorizing instrument for validation
  risk_evaluation_id?: string  // Optional: link to prior risk evaluation (informational only)
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

const handler = createHandler(
  { endpoint: 'record-expense', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ExpenseRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Validate required fields
    const referenceId = validateId(body.reference_id, 255)
    const amount = validateAmount(body.amount)
    const description = validateString(body.description, 500)

    if (!referenceId) {
      return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req)
    }
    if (!description) {
      return errorResponse('Invalid description: required and max 500 characters', 400, req)
    }

    // Validate optional fields
    const category = body.category ? validateId(body.category, 50) : null
    const vendorId = body.vendor_id ? validateId(body.vendor_id, 100) : null
    const vendorName = body.vendor_name ? validateString(body.vendor_name, 200) : null
    const paidFrom = body.paid_from ? validateId(body.paid_from, 50) : 'cash'
    
    // Validate receipt URL if provided
    let receiptUrl: string | null = null
    if (body.receipt_url) {
      receiptUrl = validateUrl(body.receipt_url)
      if (!receiptUrl) {
        return errorResponse('Invalid receipt_url: must be a valid HTTPS URL', 400, req)
      }
    }

    // Check duplicate
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', referenceId)
      .single()

    if (existingTx) {
      return jsonResponse({
        success: false,
        error: 'Duplicate reference_id',
        transaction_id: existingTx.id
      }, 409, req)
    }

    // ========================================================================
    // RISK EVALUATION LINKAGE (Phase 3.1 - Signal Engine)
    // ========================================================================
    // If risk_evaluation_id is provided, link it for audit purposes.
    // This is PURELY INFORMATIONAL - we never block based on risk signal.
    // "Soledgic never says 'do' or 'don't.' It says 'this is where you are standing.'"

    let riskEvaluation: {
      id: string
      signal: string
      valid_until: string
    } | null = null

    if (body.risk_evaluation_id) {
      const evaluationId = validateUUID(body.risk_evaluation_id)
      if (!evaluationId) {
        return errorResponse('Invalid risk_evaluation_id: must be valid UUID', 400, req)
      }

      // Load the evaluation (purely for audit linkage)
      const { data: evaluation, error: evalError } = await supabase
        .from('risk_evaluations')
        .select('id, signal, valid_until, proposed_transaction')
        .eq('id', evaluationId)
        .eq('ledger_id', ledger.id)
        .single()

      if (evaluation && !evalError) {
        riskEvaluation = {
          id: evaluation.id,
          signal: evaluation.signal,
          valid_until: evaluation.valid_until
        }

        // Mark the evaluation as acknowledged (user proceeded despite any risk)
        if (evaluation.signal === 'high_risk' || evaluation.signal === 'elevated_risk') {
          await supabase
            .from('risk_evaluations')
            .update({
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: 'api'
            })
            .eq('id', evaluation.id)
            .catch(() => {})  // Non-critical
        }
      }
      // Note: We don't error if evaluation not found - transaction proceeds regardless
    }

    const amountDollars = amount / 100

    // Get payment account
    const paymentAccountType = paidFrom || 'cash'
    const { data: paymentAccounts } = await supabase
      .from('accounts')
      .select('id, account_type')
      .eq('ledger_id', ledger.id)
      .eq('account_type', paymentAccountType)
      .limit(1)

    let paymentAccount = paymentAccounts?.[0]

    // Create credit card account if needed
    if (!paymentAccount && paymentAccountType === 'credit_card') {
      const { data: newAccount } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'credit_card',
          entity_type: ledger.ledger_mode === 'marketplace' ? 'platform' : 'business',
          name: 'Business Credit Card'
        })
        .select('id, account_type')
        .single()
      paymentAccount = newAccount
    }

    if (!paymentAccount) {
      return errorResponse(`Payment account '${paymentAccountType}' not found`, 400, req)
    }

    // Get or create expense account
    // First, check if ANY expense account exists (due to unique constraint on ledger_id + account_type)
    const { data: expenseAccounts } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'expense')
      .limit(1)

    let expenseAccount = expenseAccounts?.[0]

    // Only create if no expense account exists at all
    if (!expenseAccount) {
      let expenseAccountName = 'Operating Expenses'
      if (category) {
        expenseAccountName = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')
      }

      const { data: newExpense, error: createExpenseError } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'expense',
          entity_type: ledger.ledger_mode === 'marketplace' ? 'platform' : 'business',
          name: expenseAccountName,
          metadata: { category: category || 'general' }
        })
        .select('id')
        .single()

      if (createExpenseError) {
        console.error('Failed to create expense account:', createExpenseError)
        return errorResponse('Failed to create expense account', 500, req)
      }
      expenseAccount = newExpense
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
        mismatches.push(`counterparty: expected "${instrument.extracted_terms.counterparty_name}", got "${vendorName || ''}"`)
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

    // Create transaction with optional instrument linkage and verification status
    const transactionMetadata: Record<string, any> = {
      category: category,
      vendor_id: vendorId,
      vendor_name: vendorName,
      receipt_url: receiptUrl,
      tax_deductible: body.tax_deductible ?? true,
      paid_from: paymentAccountType,
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
      transaction_type: 'expense',
      reference_id: referenceId,
      reference_type: 'expense',
      description: description,
      amount: amountDollars,
      currency: 'USD',
      status: 'completed',
      metadata: transactionMetadata
    }

    // Only add authorizing_instrument_id if instrument exists (column may not exist in older schemas)
    if (instrument) {
      transactionInsert.authorizing_instrument_id = instrument.id
    }

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert(transactionInsert)
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create expense transaction:', txError)
      return errorResponse('Failed to create expense transaction', 500, req)
    }

    // Create entries (double-entry integrity preserved - instrument validation has no effect here)
    const entries = [
      { transaction_id: transaction.id, account_id: expenseAccount.id, entry_type: 'debit', amount: amountDollars },
      { transaction_id: transaction.id, account_id: paymentAccount.id, entry_type: 'credit', amount: amountDollars },
    ]

    await supabase.from('entries').insert(entries)

    // ========================================================================
    // SNAP-TO MATCHING: Shadow Ledger Integration
    // ========================================================================
    // Search for a matching projection and link if found.
    // This does NOT affect double-entry integrity - only adds traceability.

    let projectionMatch: ProjectionMatch | null = null

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
        .eq('amount', amountDollars)
        .eq('currency', 'USD')
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

    // Audit log with IP
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_expense',
      entity_type: 'transaction',
      entity_id: transaction.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: {
        amount: amountDollars,
        category: category || 'general',
        paid_from: paymentAccountType,
        authorizing_instrument_id: instrument?.id || null,
        verified: instrumentValidation?.verified ?? null,
        projection_matched: projectionMatch?.projection_id || null,
        risk_evaluation_id: riskEvaluation?.id || null,
        risk_signal: riskEvaluation?.signal || null
      }
    })

    // Build response
    const response: Record<string, any> = {
      success: true,
      transaction_id: transaction.id,
      amount: amountDollars,
      category: category || 'general',
      paid_from: paymentAccountType
    }

    // Include validation result if instrument was provided
    if (instrumentValidation) {
      response.instrument_verification = {
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

    // Include risk evaluation if provided (Phase 3.1 - Signal Engine)
    if (riskEvaluation) {
      response.risk_evaluation = {
        evaluation_id: riskEvaluation.id,
        signal: riskEvaluation.signal,
        acknowledged: riskEvaluation.signal !== 'within_policy'
      }
    }

    return jsonResponse(response, 200, req)
  }
)

Deno.serve(handler)
