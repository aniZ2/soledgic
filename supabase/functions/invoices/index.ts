// Soledgic Edge Function: Invoice Management
// POST /invoices - Create invoice
// GET /invoices - List invoices
// GET /invoices/:id - Get invoice details
// POST /invoices/:id/send - Send invoice via email
// POST /invoices/:id/record-payment - Record payment on invoice
// POST /invoices/:id/void - Void an invoice
// SECURITY HARDENED VERSION - Uses atomic database functions

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  validateId,
  validateUUID,
  validateString,
  validateAmount,
  validateEmail,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface InvoiceLineItem {
  description: string
  quantity: number
  unit_price: number  // in cents
  amount: number      // in cents (quantity * unit_price)
}

interface CreateInvoiceRequest {
  customer_name: string
  customer_email?: string
  customer_id?: string
  customer_address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  line_items: InvoiceLineItem[]
  due_date?: string
  notes?: string
  terms?: string
  reference_id?: string
  metadata?: Record<string, any>
}

interface RecordPaymentRequest {
  amount: number  // in cents
  payment_method?: string
  payment_date?: string
  reference_id?: string
  notes?: string
}

// Generate a unique invoice number
function generateInvoiceNumber(prefix: string = 'INV'): string {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${year}${month}-${random}`
}

const handler = createHandler(
  { endpoint: 'invoices', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: any, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    
    const invoicesIndex = pathParts.findIndex(p => p === 'invoices')
    const invoiceId = invoicesIndex >= 0 && pathParts.length > invoicesIndex + 1 
      ? pathParts[invoicesIndex + 1] 
      : null
    const action = invoicesIndex >= 0 && pathParts.length > invoicesIndex + 2 
      ? pathParts[invoicesIndex + 2] 
      : null

    // =========================================================================
    // GET /invoices - List all invoices
    // =========================================================================
    if (req.method === 'GET' && !invoiceId) {
      const status = url.searchParams.get('status')
      const customerId = url.searchParams.get('customer_id')

      // SECURITY: Validate limit and offset to prevent NaN propagation
      const limitParam = parseInt(url.searchParams.get('limit') || '50', 10)
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50

      const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10)
      const offset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : 0

      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('ledger_id', ledger.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) query = query.eq('status', status)
      if (customerId) query = query.eq('customer_id', customerId)

      const { data: invoices, count, error } = await query

      if (error) {
        console.error('Failed to fetch invoices:', error)
        return errorResponse('Failed to fetch invoices', 500, req, requestId)
      }

      return jsonResponse({
        success: true,
        data: invoices || [],
        pagination: { total: count || 0, limit, offset, has_more: (count || 0) > offset + limit }
      }, 200, req, requestId)
    }

    // =========================================================================
    // GET /invoices/:id - Get invoice details
    // =========================================================================
    if (req.method === 'GET' && invoiceId && !action) {
      // Validate UUID format before calling database
      if (!validateUUID(invoiceId)) {
        return errorResponse('Invoice not found', 404, req, requestId)
      }

      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('ledger_id', ledger.id)
        .single()

      if (error || !invoice) {
        return errorResponse('Invoice not found', 404, req, requestId)
      }

      const { data: payments } = await supabase
        .from('invoice_payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false })

      return jsonResponse({
        success: true,
        data: { ...invoice, payments: payments || [] }
      }, 200, req, requestId)
    }

    // =========================================================================
    // POST /invoices - Create new invoice
    // =========================================================================
    if (req.method === 'POST' && !invoiceId) {
      const data = body as CreateInvoiceRequest

      const customerName = validateString(data.customer_name, 200)
      if (!customerName) {
        return errorResponse('customer_name is required', 400, req, requestId)
      }

      if (!data.line_items || !Array.isArray(data.line_items) || data.line_items.length === 0) {
        return errorResponse('At least one line_item is required', 400, req, requestId)
      }

      let subtotal = 0
      const validatedLineItems: InvoiceLineItem[] = []
      
      for (let i = 0; i < data.line_items.length; i++) {
        const item = data.line_items[i]
        const description = validateString(item.description, 500)
        const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : null
        const unitPrice = validateAmount(item.unit_price)

        if (!description) return errorResponse(`Line item ${i + 1}: description is required`, 400, req, requestId)
        if (quantity === null) return errorResponse(`Line item ${i + 1}: quantity must be positive`, 400, req, requestId)
        if (unitPrice === null || unitPrice < 0) return errorResponse(`Line item ${i + 1}: unit_price must be non-negative (in cents)`, 400, req, requestId)

        const amount = Math.round(quantity * unitPrice)

        // SECURITY: Check for integer overflow - amounts must be safe integers
        // Max amount is $100M (10 billion cents) to prevent precision loss
        const MAX_LINE_AMOUNT = 10_000_000_000
        if (!Number.isSafeInteger(amount) || amount > MAX_LINE_AMOUNT) {
          return errorResponse(`Line item ${i + 1}: calculated amount exceeds maximum allowed ($100M)`, 400, req, requestId)
        }

        subtotal += amount

        // SECURITY: Check subtotal doesn't overflow
        if (!Number.isSafeInteger(subtotal) || subtotal > MAX_LINE_AMOUNT) {
          return errorResponse('Invoice total exceeds maximum allowed ($100M)', 400, req, requestId)
        }
        validatedLineItems.push({ description, quantity, unit_price: unitPrice, amount })
      }

      let customerEmail = null
      if (data.customer_email) {
        customerEmail = validateEmail(data.customer_email)
        if (!customerEmail) return errorResponse('Invalid customer_email format', 400, req, requestId)
      }

      let dueDate: Date
      if (data.due_date) {
        dueDate = new Date(data.due_date)
        if (isNaN(dueDate.getTime())) return errorResponse('Invalid due_date format', 400, req, requestId)
      } else {
        dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 30)
      }

      const invoiceNumber = generateInvoiceNumber((ledger.settings as any)?.invoice_prefix || 'INV')

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          ledger_id: ledger.id,
          invoice_number: invoiceNumber,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_id: data.customer_id ? validateId(data.customer_id, 100) : null,
          customer_address: data.customer_address || null,
          line_items: validatedLineItems,
          subtotal: subtotal,
          tax_amount: 0,
          total_amount: subtotal,
          amount_paid: 0,
          amount_due: subtotal,
          currency: (ledger.settings as any)?.currency || 'USD',
          status: 'draft',
          issue_date: new Date().toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          notes: data.notes ? validateString(data.notes, 2000) : null,
          terms: data.terms ? validateString(data.terms, 2000) : null,
          reference_id: data.reference_id ? validateId(data.reference_id, 255) : null,
          metadata: data.metadata || {}
        })
        .select()
        .single()

      if (invoiceError) {
        console.error('Failed to create invoice:', invoiceError)
        return errorResponse('Failed to create invoice', 500, req, requestId)
      }

      await supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'invoice_created',
        entity_type: 'invoice',
        entity_id: invoice.id,
        actor_type: 'api',
        ip_address: getClientIp(req),
        request_id: requestId,
        request_body: { customer_name: customerName, total: subtotal / 100, line_items_count: validatedLineItems.length },
        response_status: 201
      })

      return jsonResponse({ success: true, data: invoice }, 201, req, requestId)
    }

    // =========================================================================
    // POST /invoices/:id/send - Send invoice (ATOMIC)
    // =========================================================================
    if (req.method === 'POST' && invoiceId && action === 'send') {
      // Validate UUID format before calling database
      if (!validateUUID(invoiceId)) {
        return errorResponse('Invoice not found', 404, req, requestId)
      }

      // Use atomic database function
      const { data: result, error } = await supabase.rpc('send_invoice_atomic', {
        p_invoice_id: invoiceId,
        p_ledger_id: ledger.id
      })

      if (error) {
        console.error('Failed to send invoice:', JSON.stringify(error))
        if (error.message?.includes('not found') || error.code === 'PGRST116') {
          return errorResponse('Invoice not found', 404, req, requestId)
        }
        return errorResponse(error.message || 'Failed to send invoice', 500, req, requestId)
      }

      const row = result?.[0] || result
      if (!row?.success) {
        return errorResponse(row?.message || 'Failed to send invoice', 400, req, requestId)
      }

      // Fetch updated invoice
      const { data: updatedInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      await supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'invoice_sent',
        entity_type: 'invoice',
        entity_id: invoiceId,
        actor_type: 'api',
        ip_address: getClientIp(req),
        request_id: requestId,
        request_body: { transaction_id: row.transaction_id },
        response_status: 200
      })

      return jsonResponse({
        success: true,
        message: 'Invoice sent and AR entry created',
        data: updatedInvoice,
        transaction_id: row.transaction_id
      }, 200, req, requestId)
    }

    // =========================================================================
    // POST /invoices/:id/record-payment - Record payment (ATOMIC)
    // =========================================================================
    if (req.method === 'POST' && invoiceId && action === 'record-payment') {
      // Validate UUID format before calling database
      if (!validateUUID(invoiceId)) {
        return errorResponse('Invoice not found', 404, req, requestId)
      }

      const paymentData = body as RecordPaymentRequest

      const amount = validateAmount(paymentData.amount)
      if (amount === null || amount <= 0) {
        return errorResponse('amount must be positive (in cents)', 400, req, requestId)
      }

      // Use atomic database function
      const { data: result, error } = await supabase.rpc('record_invoice_payment_atomic', {
        p_invoice_id: invoiceId,
        p_ledger_id: ledger.id,
        p_amount_cents: amount,
        p_payment_method: paymentData.payment_method || null,
        p_payment_date: paymentData.payment_date || null,
        p_reference_id: paymentData.reference_id ? validateId(paymentData.reference_id, 255) : null,
        p_notes: paymentData.notes ? validateString(paymentData.notes, 500) : null
      })

      if (error) {
        console.error('Failed to record payment:', JSON.stringify(error))
        // Check for specific error types
        if (error.message?.includes('not found') || error.code === 'PGRST116') {
          return errorResponse('Invoice not found', 404, req, requestId)
        }
        return errorResponse(error.message || 'Failed to record payment', 500, req, requestId)
      }

      const row = result?.[0] || result
      if (!row?.success) {
        return errorResponse(row?.message || 'Failed to record payment', 400, req, requestId)
      }

      // Fetch updated invoice
      const { data: updatedInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      await supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'invoice_payment_recorded',
        entity_type: 'invoice',
        entity_id: invoiceId,
        actor_type: 'api',
        ip_address: getClientIp(req),
        request_id: requestId,
        request_body: { amount: amount / 100, transaction_id: row.transaction_id, new_status: row.new_status },
        response_status: 200
      })

      return jsonResponse({
        success: true,
        message: row.message,
        data: {
          invoice: updatedInvoice,
          payment_transaction_id: row.transaction_id
        }
      }, 200, req, requestId)
    }

    // =========================================================================
    // POST /invoices/:id/void - Void an invoice (ATOMIC)
    // =========================================================================
    if (req.method === 'POST' && invoiceId && action === 'void') {
      // Validate UUID format before calling database
      if (!validateUUID(invoiceId)) {
        return errorResponse('Invoice not found', 404, req, requestId)
      }

      // Use atomic database function with row locking
      const { data: result, error } = await supabase.rpc('void_invoice_atomic', {
        p_invoice_id: invoiceId,
        p_ledger_id: ledger.id,
        p_reason: body?.reason ? validateString(body.reason, 500) : null
      })

      if (error) {
        console.error('Failed to void invoice:', JSON.stringify(error))
        if (error.message?.includes('not found') || error.code === 'PGRST116') {
          return errorResponse('Invoice not found', 404, req, requestId)
        }
        return errorResponse(error.message || 'Failed to void invoice', 500, req, requestId)
      }

      const row = result?.[0] || result
      if (!row?.success) {
        return errorResponse(row?.message || 'Failed to void invoice', 400, req, requestId)
      }

      // Fetch updated invoice
      const { data: updatedInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()

      await supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'invoice_voided',
        entity_type: 'invoice',
        entity_id: invoiceId,
        actor_type: 'api',
        ip_address: getClientIp(req),
        request_id: requestId,
        request_body: { reason: body?.reason, reversal_transaction_id: row.reversal_transaction_id },
        response_status: 200
      })

      return jsonResponse({
        success: true,
        message: 'Invoice voided',
        data: updatedInvoice,
        reversal_transaction_id: row.reversal_transaction_id,
        reversed_amount: row.reversed_amount
      }, 200, req, requestId)
    }

    return errorResponse('Method not allowed or invalid path', 405, req, requestId)
  }
)

Deno.serve(handler)
