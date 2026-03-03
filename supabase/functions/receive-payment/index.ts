// Soledgic Edge Function: Receive Payment
// POST /receive-payment
// Records receipt of payment on an invoice (reduces A/R, increases Cash)
// MIGRATED TO createHandler

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  validateAmount,
  createAuditLogAsync,
  LedgerContext
} from '../_shared/utils.ts'

interface ReceivePaymentRequest {
  invoice_transaction_id?: string
  amount: number
  customer_name?: string
  customer_id?: string
  reference_id?: string
  payment_method?: string
  payment_date?: string
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'receive-payment', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: ReceivePaymentRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (ledger.status !== 'active') {
      return errorResponse('Ledger is not active', 403, req, requestId)
    }

    const amount = validateAmount(body.amount)
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be positive integer (cents)', 400, req, requestId)
    }

    const amountInDollars = amount / 100

    // Get accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, account_type')
      .eq('ledger_id', ledger.id)
      .in('account_type', ['cash', 'accounts_receivable'])

    const cashAccount = accounts?.find(a => a.account_type === 'cash')
    let arAccount = accounts?.find(a => a.account_type === 'accounts_receivable')

    if (!cashAccount) {
      return errorResponse('Cash account not found', 500, req, requestId)
    }

    if (!arAccount) {
      const { data: newAR } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'accounts_receivable',
          entity_type: 'business',
          name: 'Accounts Receivable'
        })
        .select('id, account_type')
        .single()
      arAccount = newAR
    }

    if (!arAccount) {
      return errorResponse('Could not create Accounts Receivable account', 500, req, requestId)
    }

    // Description
    let description = 'Payment received'
    const invoiceTxId = body.invoice_transaction_id ? validateId(body.invoice_transaction_id, 100) : null
    const customerName = body.customer_name ? validateString(body.customer_name, 200) : null

    if (invoiceTxId) {
      const { data: originalInvoice } = await supabase
        .from('transactions')
        .select('description')
        .eq('id', invoiceTxId)
        .eq('ledger_id', ledger.id)
        .single()

      if (originalInvoice) {
        description = `Payment received: ${originalInvoice.description}`
      }
    } else if (customerName) {
      description = `Payment from ${customerName}`
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'invoice_payment',
        reference_id: body.reference_id ? validateId(body.reference_id, 255) : null,
        reference_type: body.payment_method ? validateString(body.payment_method, 50) : 'payment',
        description,
        amount: amountInDollars,
        currency: (ledger.settings as any)?.currency || 'USD',
        status: 'completed',
        metadata: {
          original_invoice_id: invoiceTxId,
          customer_id: body.customer_id ? validateId(body.customer_id, 100) : null,
          customer_name: customerName,
          payment_method: body.payment_method ? validateString(body.payment_method, 50) : null,
          payment_date: body.payment_date
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      return errorResponse('Failed to create payment', 500, req, requestId)
    }

    // Create entries
    const entries = [
      { transaction_id: transaction.id, account_id: cashAccount.id, entry_type: 'debit', amount: amountInDollars },
      { transaction_id: transaction.id, account_id: arAccount.id, entry_type: 'credit', amount: amountInDollars }
    ]

    await supabase.from('entries').insert(entries)

    // Audit log
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'receive_payment',
      entity_type: 'transaction',
      entity_id: transaction.id,
      actor_type: 'api',
      request_body: { amount: amountInDollars, customer: customerName }
    }, requestId)

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      amount: amountInDollars
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
