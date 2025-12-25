// Soledgic Edge Function: Manage Recurring Expenses
// POST /manage-recurring - Create recurring template
// GET /manage-recurring - List recurring expenses
// GET /manage-recurring/due - Get upcoming due expenses
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  validateAmount
} from '../_shared/utils.ts'

interface CreateRecurringRequest {
  name: string
  merchant_name: string
  category_code: string
  amount: number
  recurrence_interval: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  recurrence_day?: number
  start_date: string
  end_date?: string
  business_purpose: string
  is_variable_amount?: boolean
}

const VALID_INTERVALS = ['weekly', 'monthly', 'quarterly', 'annual']

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
    const isDue = url.pathname.endsWith('/due')

    // GET /due - Get upcoming expenses
    if (req.method === 'GET' && isDue) {
      const daysParam = url.searchParams.get('days')
      const daysAhead = daysParam ? Math.min(Math.max(parseInt(daysParam) || 30, 1), 365) : 30
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + daysAhead)

      const { data: upcoming } = await supabase
        .from('recurring_expense_templates')
        .select(`id, name, merchant_name, amount, recurrence_interval, next_due_date, expense_categories(code, name)`)
        .eq('ledger_id', ledger.id)
        .eq('is_active', true)
        .lte('next_due_date', futureDate.toISOString().split('T')[0])
        .order('next_due_date')

      const totalUpcoming = upcoming?.reduce((sum, e) => sum + Number(e.amount), 0) || 0

      return jsonResponse({
        success: true,
        days_ahead: daysAhead,
        upcoming_expenses: upcoming?.map(e => ({
          ...e,
          amount: Math.round(e.amount * 100) / 100,
          category: (e as any).expense_categories?.name
        })),
        total_upcoming: Math.round(totalUpcoming * 100) / 100,
        count: upcoming?.length || 0
      }, 200, req)
    }

    // GET - List all recurring expenses
    if (req.method === 'GET') {
      const { data: templates } = await supabase
        .from('recurring_expense_templates')
        .select(`id, name, merchant_name, amount, recurrence_interval, recurrence_day, start_date, end_date, next_due_date, is_active, total_occurrences, total_amount_spent, business_purpose, expense_categories(code, name)`)
        .eq('ledger_id', ledger.id)
        .order('name')

      const templatesWithAnnual = templates?.map(t => {
        let annualMultiplier = 1
        switch (t.recurrence_interval) {
          case 'weekly': annualMultiplier = 52; break
          case 'monthly': annualMultiplier = 12; break
          case 'quarterly': annualMultiplier = 4; break
          case 'annual': annualMultiplier = 1; break
        }
        return {
          ...t,
          amount: Math.round(t.amount * 100) / 100,
          annual_cost: Math.round(t.amount * annualMultiplier * 100) / 100,
          total_amount_spent: Math.round(t.total_amount_spent * 100) / 100,
          category: (t as any).expense_categories?.name
        }
      })

      const totalAnnual = templatesWithAnnual?.reduce((sum, t) => sum + t.annual_cost, 0) || 0

      return jsonResponse({
        success: true,
        recurring_expenses: templatesWithAnnual,
        summary: {
          count: templates?.length || 0,
          active_count: templates?.filter(t => t.is_active).length || 0,
          total_monthly: Math.round((totalAnnual / 12) * 100) / 100,
          total_annual: Math.round(totalAnnual * 100) / 100
        }
      }, 200, req)
    }

    // POST - Create recurring expense template
    if (req.method === 'POST') {
      const body: CreateRecurringRequest = await req.json()

      const name = validateString(body.name, 200)
      const merchantName = validateString(body.merchant_name, 200)
      const categoryCode = validateId(body.category_code, 50)
      const amount = validateAmount(body.amount)
      const businessPurpose = validateString(body.business_purpose, 500)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/

      if (!name) return errorResponse('Invalid or missing name', 400, req)
      if (!merchantName) return errorResponse('Invalid or missing merchant_name', 400, req)
      if (!categoryCode) return errorResponse('Invalid or missing category_code', 400, req)
      if (amount === null || amount <= 0) return errorResponse('Invalid amount', 400, req)
      if (!body.recurrence_interval || !VALID_INTERVALS.includes(body.recurrence_interval)) {
        return errorResponse(`Invalid recurrence_interval: must be ${VALID_INTERVALS.join(', ')}`, 400, req)
      }
      if (!body.start_date || !dateRegex.test(body.start_date)) {
        return errorResponse('Invalid start_date: must be YYYY-MM-DD', 400, req)
      }
      if (!businessPurpose) return errorResponse('Invalid or missing business_purpose', 400, req)

      const { data: category } = await supabase
        .from('expense_categories')
        .select('id')
        .eq('ledger_id', ledger.id)
        .eq('code', categoryCode)
        .single()

      if (!category) {
        return errorResponse(`Invalid category: ${categoryCode}`, 400, req)
      }

      const startDate = new Date(body.start_date)

      const { data: template, error: createError } = await supabase
        .from('recurring_expense_templates')
        .insert({
          ledger_id: ledger.id,
          name: name,
          merchant_name: merchantName,
          category_id: category.id,
          amount: amount / 100,
          recurrence_interval: body.recurrence_interval,
          recurrence_day: body.recurrence_day ? Math.min(Math.max(body.recurrence_day, 1), 31) : null,
          start_date: body.start_date,
          end_date: body.end_date && dateRegex.test(body.end_date) ? body.end_date : null,
          next_due_date: startDate.toISOString().split('T')[0],
          business_purpose: businessPurpose,
          is_variable_amount: body.is_variable_amount || false,
          is_active: true
        })
        .select('id, name, amount, recurrence_interval, next_due_date')
        .single()

      if (createError) {
        console.error('Create error:', createError)
        return errorResponse('Failed to create recurring expense', 500, req)
      }

      return jsonResponse({
        success: true,
        recurring_expense: {
          ...template,
          amount: Math.round(template.amount * 100) / 100
        }
      }, 201, req)
    }

    return errorResponse('Method not allowed', 405, req)

  } catch (error: any) {
    console.error('Error managing recurring expenses:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
