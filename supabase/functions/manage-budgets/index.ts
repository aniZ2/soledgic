// Soledgic Edge Function: Manage Budgets
// POST /manage-budgets - Create budget envelope
// GET /manage-budgets - List budgets with current status
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

interface CreateBudgetRequest {
  name: string
  category_code?: string
  budget_amount: number
  budget_period: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  alert_at_percentage?: number
}

const VALID_PERIODS = ['weekly', 'monthly', 'quarterly', 'annual']

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

    // GET - List budgets with current period spending
    if (req.method === 'GET') {
      const { data: budgets } = await supabase
        .from('budget_envelopes')
        .select(`id, name, budget_amount, budget_period, alert_at_percentage, is_active, category_id, expense_categories(code, name)`)
        .eq('ledger_id', ledger.id)
        .order('name')

      const now = new Date()
      const budgetsWithSpending = await Promise.all(
        (budgets || []).map(async (budget) => {
          let periodStart: Date
          switch (budget.budget_period) {
            case 'weekly':
              periodStart = new Date(now)
              periodStart.setDate(now.getDate() - now.getDay())
              break
            case 'monthly':
              periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
              break
            case 'quarterly':
              const quarter = Math.floor(now.getMonth() / 3)
              periodStart = new Date(now.getFullYear(), quarter * 3, 1)
              break
            case 'annual':
              periodStart = new Date(now.getFullYear(), 0, 1)
              break
            default:
              periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
          }

          let query = supabase
            .from('transactions')
            .select('amount')
            .eq('ledger_id', ledger.id)
            .eq('transaction_type', 'expense')
            .eq('status', 'completed')
            .gte('created_at', periodStart.toISOString())

          if (budget.category_id) {
            query = query.eq('expense_category_id', budget.category_id)
          }

          const { data: expenses } = await query

          const spent = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
          const budgetAmount = Number(budget.budget_amount)
          const remaining = budgetAmount - spent
          const percentUsed = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0

          let status: 'under' | 'warning' | 'over'
          if (percentUsed >= 100) status = 'over'
          else if (percentUsed >= (budget.alert_at_percentage || 80)) status = 'warning'
          else status = 'under'

          return {
            id: budget.id,
            name: budget.name,
            category: (budget as any).expense_categories?.name || 'All Expenses',
            category_code: (budget as any).expense_categories?.code,
            budget_period: budget.budget_period,
            budget_amount: Math.round(budgetAmount * 100) / 100,
            spent: Math.round(spent * 100) / 100,
            remaining: Math.round(remaining * 100) / 100,
            percent_used: Math.round(percentUsed * 10) / 10,
            status,
            alert_threshold: budget.alert_at_percentage || 80,
            period_start: periodStart.toISOString().split('T')[0],
            is_active: budget.is_active
          }
        })
      )

      const totalBudgeted = budgetsWithSpending.reduce((sum, b) => sum + b.budget_amount, 0)
      const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + b.spent, 0)

      return jsonResponse({
        success: true,
        budgets: budgetsWithSpending,
        summary: {
          total_budgeted: Math.round(totalBudgeted * 100) / 100,
          total_spent: Math.round(totalSpent * 100) / 100,
          total_remaining: Math.round((totalBudgeted - totalSpent) * 100) / 100,
          over_budget_count: budgetsWithSpending.filter(b => b.status === 'over').length,
          warning_count: budgetsWithSpending.filter(b => b.status === 'warning').length
        }
      }, 200, req)
    }

    // POST - Create budget
    if (req.method === 'POST') {
      const body: CreateBudgetRequest = await req.json()

      const name = validateString(body.name, 200)
      const amount = validateAmount(body.budget_amount)

      if (!name) return errorResponse('Invalid or missing name', 400, req)
      if (amount === null || amount <= 0) return errorResponse('Invalid budget_amount', 400, req)
      if (!body.budget_period || !VALID_PERIODS.includes(body.budget_period)) {
        return errorResponse(`Invalid budget_period: must be ${VALID_PERIODS.join(', ')}`, 400, req)
      }

      let categoryId = null
      if (body.category_code) {
        const categoryCode = validateId(body.category_code, 50)
        if (!categoryCode) return errorResponse('Invalid category_code', 400, req)

        const { data: category } = await supabase
          .from('expense_categories')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('code', categoryCode)
          .single()

        if (!category) return errorResponse(`Invalid category: ${categoryCode}`, 400, req)
        categoryId = category.id
      }

      const alertPercentage = body.alert_at_percentage 
        ? Math.min(Math.max(body.alert_at_percentage, 1), 100) 
        : 80

      const { data: budget, error: createError } = await supabase
        .from('budget_envelopes')
        .insert({
          ledger_id: ledger.id,
          name: name,
          category_id: categoryId,
          budget_amount: amount / 100,
          budget_period: body.budget_period,
          alert_at_percentage: alertPercentage,
          is_active: true
        })
        .select('id, name, budget_amount, budget_period')
        .single()

      if (createError) {
        console.error('Create error:', createError)
        return errorResponse('Failed to create budget', 500, req)
      }

      return jsonResponse({
        success: true,
        budget: { ...budget, budget_amount: Math.round(budget.budget_amount * 100) / 100 }
      }, 201, req)
    }

    return errorResponse('Method not allowed', 405, req)

  } catch (error: any) {
    console.error('Error managing budgets:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
