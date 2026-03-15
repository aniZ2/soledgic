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
  createAuditLog,
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

    // Build description
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

    // Atomic RPC: transaction + entries in a single database transaction
    const referenceId = body.reference_id ? validateId(body.reference_id, 255) : null
    const paymentMethod = body.payment_method ? validateString(body.payment_method, 50) : null

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('receive_payment_atomic', {
        p_ledger_id: ledger.id,
        p_amount_cents: amount,
        p_reference_id: referenceId,
        p_payment_method: paymentMethod,
        p_description: description,
        p_currency: (ledger.settings as any)?.currency || 'USD',
        p_metadata: {
          original_invoice_id: invoiceTxId,
          customer_id: body.customer_id ? validateId(body.customer_id, 100) : null,
          customer_name: customerName,
          payment_method: paymentMethod,
          payment_date: body.payment_date
        }
      })

    if (rpcError) {
      console.error('receive_payment_atomic failed:', rpcError)
      if (rpcError.message?.includes('amount must be')) {
        return errorResponse(rpcError.message, 400, req, requestId)
      }
      return errorResponse('Failed to create payment', 500, req, requestId)
    }

    const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    if (!row?.transaction_id) {
      return errorResponse('Failed to create payment', 500, req, requestId)
    }

    // Audit log
    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'receive_payment',
      entity_type: 'transaction',
      entity_id: row.transaction_id,
      actor_type: 'api',
      request_body: { amount: amountInDollars, customer: customerName }
    }, requestId)

    return jsonResponse({
      success: true,
      transaction_id: row.transaction_id,
      amount: row.amount_dollars,
      ...(row.status === 'duplicate' ? { idempotent: true } : {})
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
