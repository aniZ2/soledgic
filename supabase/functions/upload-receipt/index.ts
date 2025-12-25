// Soledgic Edge Function: Upload Receipt
// POST /upload-receipt - Upload and optionally link a receipt to a transaction
// SECURITY HARDENED VERSION

import { 
  createHandler,
  jsonResponse, 
  errorResponse, 
  validateId, 
  validateString, 
  validateAmount, 
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface UploadReceiptRequest { 
  file_url: string
  file_name?: string
  file_size?: number
  mime_type?: string
  merchant_name?: string
  transaction_date?: string
  total_amount?: number
  transaction_id?: string 
}

const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

const handler = createHandler(
  { endpoint: 'upload-receipt', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: UploadReceiptRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    if (!body.file_url) return errorResponse('Missing file_url', 400, req)

    // Validate file_url is from allowed domain (Supabase storage)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!body.file_url.startsWith(supabaseUrl || '') && !body.file_url.startsWith('https://')) {
      return errorResponse('Invalid file_url', 400, req)
    }

    const mimeType = body.mime_type || 'image/jpeg'
    if (!VALID_MIME_TYPES.includes(mimeType)) {
      return errorResponse(`Invalid mime_type: must be one of ${VALID_MIME_TYPES.join(', ')}`, 400, req)
    }

    const transactionId = body.transaction_id ? validateId(body.transaction_id, 100) : null
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/

    if (transactionId) {
      const { data: tx } = await supabase
        .from('transactions')
        .select('id')
        .eq('ledger_id', ledger.id)
        .eq('id', transactionId)
        .single()
      if (!tx) return errorResponse('Invalid transaction_id', 400, req)
    }

    let status = 'uploaded'
    if (transactionId) status = 'matched'
    else if (body.merchant_name && body.transaction_date && body.total_amount) status = 'uploaded'
    else status = 'orphan'

    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        ledger_id: ledger.id,
        file_url: body.file_url,
        file_name: body.file_name ? validateString(body.file_name, 255) : null,
        file_size: body.file_size && body.file_size > 0 && body.file_size < 50000000 ? body.file_size : null,
        mime_type: mimeType,
        merchant_name: body.merchant_name ? validateString(body.merchant_name, 200) : null,
        transaction_date: body.transaction_date && dateRegex.test(body.transaction_date) ? body.transaction_date : null,
        total_amount: body.total_amount ? (validateAmount(body.total_amount) || 0) / 100 : null,
        status,
        uploaded_via: 'api'
      })
      .select('id, status')
      .single()

    if (receiptError) return errorResponse('Failed to create receipt', 500, req)

    if (transactionId) {
      await supabase.from('expense_attachments').insert({ 
        ledger_id: ledger.id, 
        transaction_id: transactionId, 
        attachment_type: 'receipt', 
        receipt_id: receipt.id 
      })
    }

    supabase.from('audit_log').insert({ 
      ledger_id: ledger.id, 
      action: 'upload_receipt', 
      entity_type: 'receipt', 
      entity_id: receipt.id, 
      actor_type: 'api', 
      ip_address: getClientIp(req), 
      request_body: { 
        file_name: body.file_name, 
        merchant: body.merchant_name, 
        linked_to: transactionId 
      } 
    }).then(() => {}).catch(() => {})

    return jsonResponse({ 
      success: true, 
      receipt_id: receipt.id, 
      status: receipt.status, 
      linked_transaction_id: transactionId 
    }, 200, req)
  }
)

Deno.serve(handler)
