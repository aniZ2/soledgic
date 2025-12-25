// Soledgic Edge Function: Manage Contractors
// POST /manage-contractors - Create contractor
// GET /manage-contractors - List contractors
// POST /manage-contractors/payment - Record payment
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  validateEmail,
  validateAmount,
  getClientIp
} from '../_shared/utils.ts'

interface CreateContractorRequest {
  name: string
  email?: string
  company_name?: string
  stripe_account_id?: string
}

interface RecordPaymentRequest {
  contractor_id: string
  amount: number
  payment_date: string
  payment_method?: string
  payment_reference?: string
  description?: string
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

    const url = new URL(req.url)
    const isPayment = url.pathname.endsWith('/payment')

    // GET - List contractors
    if (req.method === 'GET') {
      const { data: contractors, error } = await supabase
        .from('contractors')
        .select(`id, name, email, company_name, w9_status, ytd_payments, lifetime_payments, needs_1099, is_active, created_at`)
        .eq('ledger_id', ledger.id)
        .order('name')

      if (error) {
        console.error('Error fetching contractors:', error)
        return errorResponse('Failed to fetch contractors', 500, req)
      }

      const currentYear = new Date().getFullYear()

      return jsonResponse({ 
        success: true, 
        contractors: contractors?.map(c => ({
          ...c,
          ytd_payments: Math.round(c.ytd_payments * 100) / 100,
          lifetime_payments: Math.round(c.lifetime_payments * 100) / 100,
          threshold_warning: c.ytd_payments >= 500 && c.ytd_payments < 600,
          over_threshold: c.needs_1099
        })),
        threshold_info: {
          current_year: currentYear,
          threshold_amount: 600,
          message: 'Contractors paid $600+ require 1099-NEC'
        }
      }, 200, req)
    }

    // POST /payment - Record contractor payment
    if (req.method === 'POST' && isPayment) {
      const body: RecordPaymentRequest = await req.json()

      const contractorId = validateId(body.contractor_id, 100)
      const amount = validateAmount(body.amount)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/

      if (!contractorId) {
        return errorResponse('Invalid contractor_id', 400, req)
      }
      if (amount === null || amount <= 0) {
        return errorResponse('Invalid amount: must be positive integer (cents)', 400, req)
      }
      if (!body.payment_date || !dateRegex.test(body.payment_date)) {
        return errorResponse('Invalid payment_date: must be YYYY-MM-DD', 400, req)
      }

      const { data: contractor } = await supabase
        .from('contractors')
        .select('id, name')
        .eq('id', contractorId)
        .eq('ledger_id', ledger.id)
        .single()

      if (!contractor) {
        return errorResponse('Contractor not found', 404, req)
      }

      const paymentAmount = amount / 100
      const taxYear = new Date(body.payment_date).getFullYear()

      const { data: payment, error: paymentError } = await supabase
        .from('contractor_payments')
        .insert({
          ledger_id: ledger.id,
          contractor_id: contractorId,
          amount: paymentAmount,
          payment_date: body.payment_date,
          payment_method: body.payment_method ? validateString(body.payment_method, 50) : null,
          payment_reference: body.payment_reference ? validateId(body.payment_reference, 100) : null,
          description: body.description ? validateString(body.description, 500) : null,
          tax_year: taxYear
        })
        .select('id')
        .single()

      if (paymentError) {
        console.error('Payment error:', paymentError)
        return errorResponse('Failed to record payment', 500, req)
      }

      const { data: updatedContractor } = await supabase
        .from('contractors')
        .select('ytd_payments, needs_1099')
        .eq('id', contractorId)
        .single()

      // Audit log
      supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'contractor_payment',
        entity_type: 'contractor_payment',
        entity_id: payment.id,
        actor_type: 'api',
        ip_address: getClientIp(req),
        request_body: { contractor_id: contractorId, amount: paymentAmount }
      }).then(() => {}).catch(() => {})

      return jsonResponse({
        success: true,
        payment_id: payment.id,
        contractor: contractor.name,
        amount: paymentAmount,
        ytd_total: updatedContractor?.ytd_payments,
        needs_1099: updatedContractor?.needs_1099,
        warning: updatedContractor?.needs_1099 ? 'Contractor has exceeded $600 threshold - 1099-NEC required' : undefined
      }, 200, req)
    }

    // POST - Create contractor
    if (req.method === 'POST') {
      const body: CreateContractorRequest = await req.json()

      const name = validateString(body.name, 200)
      if (!name) {
        return errorResponse('Invalid or missing name', 400, req)
      }

      const email = body.email ? validateEmail(body.email) : null

      const { data: contractor, error: createError } = await supabase
        .from('contractors')
        .insert({
          ledger_id: ledger.id,
          name: name,
          email: email,
          company_name: body.company_name ? validateString(body.company_name, 200) : null,
          stripe_account_id: body.stripe_account_id ? validateId(body.stripe_account_id, 100) : null,
          is_active: true
        })
        .select('id, name, email')
        .single()

      if (createError) {
        if (createError.code === '23505') {
          return jsonResponse({ success: false, error: 'Contractor with this email already exists' }, 409, req)
        }
        console.error('Create error:', createError)
        return errorResponse('Failed to create contractor', 500, req)
      }

      return jsonResponse({ success: true, contractor }, 201, req)
    }

    return errorResponse('Method not allowed', 405, req)

  } catch (error: any) {
    console.error('Error managing contractors:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
