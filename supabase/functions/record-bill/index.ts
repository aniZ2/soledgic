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

    // Create transaction with optional instrument linkage
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
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
        authorizing_instrument_id: instrument?.id || null,
        metadata: transactionMetadata
      })
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
        verified: instrumentValidation?.verified ?? null
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

    return jsonResponse(response, 200, req)

  } catch (error: any) {
    console.error('Error recording bill:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
