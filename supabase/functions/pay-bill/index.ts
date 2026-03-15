// Soledgic Edge Function: Pay Bill
// POST /pay-bill
// Records payment of a bill (reduces A/P, reduces Cash)
// SECURITY HARDENED VERSION - Uses atomic database function

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext,
  validateId,
  validateString,
  validateAmount,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PayBillRequest {
  bill_transaction_id?: string
  amount: number
  vendor_name?: string
  reference_id?: string
  payment_method?: string
  payment_date?: string
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'pay-bill', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: any,
    { requestId }: { requestId: string }
  ) => {
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

    const billTxId = body.bill_transaction_id ? validateId(body.bill_transaction_id, 100) : null
    const vendorName = body.vendor_name ? validateString(body.vendor_name, 200) : null
    const referenceId = body.reference_id ? validateId(body.reference_id, 255) : null
    const paymentMethod = body.payment_method ? validateString(body.payment_method, 50) : null

    // Use atomic database function
    const { data: result, error } = await supabase.rpc('record_bill_payment_atomic', {
      p_ledger_id: ledger.id,
      p_amount_cents: amount,
      p_bill_transaction_id: billTxId,
      p_vendor_name: vendorName,
      p_payment_method: paymentMethod,
      p_reference_id: referenceId
    })

    if (error) {
      console.error('Failed to record bill payment:', error)
      return errorResponse('Failed to create payment', 500, req, requestId)
    }

    const row = result?.[0] || result
    if (!row?.success) {
      return errorResponse(row?.message || 'Failed to record payment', 400, req, requestId)
    }

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'pay_bill',
      entity_type: 'transaction',
      entity_id: row.transaction_id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: { amount: row.amount_dollars, vendor: vendorName }
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      transaction_id: row.transaction_id,
      amount: row.amount_dollars
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
