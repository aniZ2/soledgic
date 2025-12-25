// Soledgic Edge Function: Record Income
// POST /record-income
// Records business income (Standard mode - no splits)
// SECURITY HARDENED VERSION

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateId,
  validateAmount,
  validateString,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface IncomeRequest {
  reference_id: string
  amount: number
  description: string
  category?: string
  customer_id?: string
  customer_name?: string
  received_to?: 'cash' | string
  invoice_id?: string
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'record-income', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: IncomeRequest) => {
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
    const category = body.category ? validateId(body.category, 50) : 'sales'
    const customerId = body.customer_id ? validateId(body.customer_id, 100) : null
    const customerName = body.customer_name ? validateString(body.customer_name, 200) : null
    const receivedTo = body.received_to ? validateId(body.received_to, 50) : 'cash'
    const invoiceId = body.invoice_id ? validateId(body.invoice_id, 255) : null

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

    // Get cash/bank account
    const { data: cashAccounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', receivedTo)
      .limit(1)

    const cashAccount = cashAccounts?.[0]
    if (!cashAccount) {
      return errorResponse(`Account '${receivedTo}' not found`, 400, req)
    }

    // Get revenue account
    const revenueType = ledger.ledger_mode === 'marketplace' ? 'platform_revenue' : 'revenue'
    const { data: revenueAccounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', revenueType)
      .limit(1)

    let revenueAccount = revenueAccounts?.[0]

    if (!revenueAccount) {
      const { data: newRevenue } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: revenueType,
          entity_type: ledger.ledger_mode === 'marketplace' ? 'platform' : 'business',
          name: ledger.ledger_mode === 'marketplace' ? 'Platform Revenue' : 'Sales Revenue'
        })
        .select('id')
        .single()
      revenueAccount = newRevenue
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'income',
        reference_id: referenceId,
        reference_type: 'income',
        description: description,
        amount: amountDollars,
        currency: 'USD',
        status: 'completed',
        metadata: {
          category: category,
          customer_id: customerId,
          customer_name: customerName,
          invoice_id: invoiceId,
          received_to: receivedTo,
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create income transaction:', txError)
      return errorResponse('Failed to create income transaction', 500, req)
    }

    // Create entries
    const entries = [
      { transaction_id: transaction.id, account_id: cashAccount.id, entry_type: 'debit', amount: amountDollars },
      { transaction_id: transaction.id, account_id: revenueAccount.id, entry_type: 'credit', amount: amountDollars },
    ]

    await supabase.from('entries').insert(entries)

    // If this pays an invoice, mark it
    if (invoiceId) {
      await supabase
        .from('transactions')
        .update({ 
          status: 'paid', 
          metadata: { paid_by_transaction: transaction.id } 
        })
        .eq('ledger_id', ledger.id)
        .eq('reference_id', invoiceId)
    }

    // Audit log with IP
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_income',
      entity_type: 'transaction',
      entity_id: transaction.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: { 
        amount: amountDollars, 
        category: category, 
        received_to: receivedTo 
      }
    })

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      amount: amountDollars,
      category: category
    }, 200, req)
  }
)

Deno.serve(handler)
