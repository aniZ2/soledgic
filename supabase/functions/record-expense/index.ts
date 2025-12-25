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
  LedgerContext,
  getClientIp
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
    let expenseAccountName = 'Operating Expenses'
    if (category) {
      expenseAccountName = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')
    }

    const { data: expenseAccounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'expense')
      .ilike('name', expenseAccountName)
      .limit(1)

    let expenseAccount = expenseAccounts?.[0]

    if (!expenseAccount) {
      const { data: newExpense } = await supabase
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
      expenseAccount = newExpense
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'expense',
        reference_id: referenceId,
        reference_type: 'expense',
        description: description,
        amount: amountDollars,
        currency: 'USD',
        status: 'completed',
        metadata: {
          category: category,
          vendor_id: vendorId,
          vendor_name: vendorName,
          receipt_url: receiptUrl,
          tax_deductible: body.tax_deductible ?? true,
          paid_from: paymentAccountType,
          // Don't blindly copy metadata
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create expense transaction:', txError)
      return errorResponse('Failed to create expense transaction', 500, req)
    }

    // Create entries
    const entries = [
      { transaction_id: transaction.id, account_id: expenseAccount.id, entry_type: 'debit', amount: amountDollars },
      { transaction_id: transaction.id, account_id: paymentAccount.id, entry_type: 'credit', amount: amountDollars },
    ]

    await supabase.from('entries').insert(entries)

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
        paid_from: paymentAccountType 
      }
    })

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      amount: amountDollars,
      category: category || 'general',
      paid_from: paymentAccountType
    }, 200, req)
  }
)

Deno.serve(handler)
