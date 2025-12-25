// Soledgic Edge Function: Profit & Loss Report
// GET /profit-loss
// Generate P&L statement combining revenue and expenses
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface MonthlyData {
  month: string
  month_name: string
  revenue: number
  expenses: number
  net_income: number
}

interface ProfitLossResponse {
  success: boolean
  period?: {
    start_date: string
    end_date: string
    type: 'annual' | 'quarterly' | 'monthly' | 'custom'
  }
  revenue?: {
    gross_sales: number
    refunds: number
    net_revenue: number
    platform_fees_earned: number
  }
  expenses?: {
    by_category: Array<{
      code: string
      name: string
      schedule_c_line: number | null
      amount: number
      transaction_count: number
    }>
    total: number
  }
  summary?: {
    gross_profit: number
    total_expenses: number
    net_income: number
    effective_tax_estimate?: number
  }
  monthly_breakdown?: MonthlyData[]
  schedule_c_summary?: Record<number, {
    line: number
    description: string
    amount: number
  }>
  error?: string
}

// Revenue account types (credit-normal)
const REVENUE_ACCOUNT_TYPES = ['revenue', 'platform_revenue', 'income', 'sales', 'service_revenue', 'other_income']
// Expense account types (debit-normal)
const EXPENSE_ACCOUNT_TYPES = ['expense', 'cost_of_goods_sold', 'operating_expense']

async function calculatePeriodPL(
  supabase: SupabaseClient,
  ledgerId: string,
  startDate: string,
  endDate: string,
  _platformAccountId: string | null
) {
  // Get all accounts for this ledger
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, account_type')
    .eq('ledger_id', ledgerId)

  if (!accounts || accounts.length === 0) {
    return { grossSales: 0, refunds: 0, netRevenue: 0, platformFeesEarned: 0, expensesByCategory: [], totalExpenses: 0, netIncome: 0 }
  }

  // Get all entries for these accounts within the date range
  // This mirrors exactly how the balance sheet calculates account balances
  const { data: entries } = await supabase
    .from('entries')
    .select(`
      account_id,
      entry_type,
      amount,
      transaction:transactions!inner(created_at, status)
    `)
    .eq('transactions.ledger_id', ledgerId)
    .eq('transactions.status', 'completed')
    .gte('transactions.created_at', startDate)
    .lte('transactions.created_at', endDate + 'T23:59:59Z')

  // Calculate balance for each account (same logic as balance sheet)
  const accountBalances: Record<string, number> = {}
  for (const entry of entries || []) {
    const accountId = entry.account_id
    if (!accountBalances[accountId]) {
      accountBalances[accountId] = 0
    }
    // Debit increases, credit decreases (for debit-normal accounts)
    // We'll handle the sign flip for credit-normal accounts when summing
    if (entry.entry_type === 'debit') {
      accountBalances[accountId] += Number(entry.amount)
    } else {
      accountBalances[accountId] -= Number(entry.amount)
    }
  }

  // Sum up revenue and expenses (same logic as balance sheet)
  let totalRevenue = 0
  let totalExpenses = 0
  let platformFeesEarned = 0

  for (const account of accounts) {
    const balance = accountBalances[account.id] || 0
    const accountType = account.account_type

    if (REVENUE_ACCOUNT_TYPES.includes(accountType)) {
      // Revenue accounts are credit-normal, so flip the sign
      // A credit to revenue makes balance negative in our calculation,
      // but we want it as positive revenue
      const revenueAmount = -balance
      totalRevenue += revenueAmount

      if (accountType === 'platform_revenue') {
        platformFeesEarned = revenueAmount
      }
    } else if (EXPENSE_ACCOUNT_TYPES.includes(accountType)) {
      // Expense accounts are debit-normal, balance is already positive
      totalExpenses += Math.abs(balance)
    }
  }

  // For backwards compatibility, use totalRevenue as grossSales
  const grossSales = Math.round(totalRevenue * 100) / 100
  const refunds = 0 // Would need separate tracking for refunds
  const netRevenue = grossSales - refunds
  const netIncome = netRevenue - totalExpenses

  // Simplified expense categorization (could be enhanced later)
  const expensesByCategory = totalExpenses > 0 ? [{
    code: 'uncategorized',
    name: 'Uncategorized',
    schedule_c_line: null,
    amount: totalExpenses,
    transaction_count: 0
  }] : []

  return {
    grossSales,
    refunds,
    netRevenue: Math.round(netRevenue * 100) / 100,
    platformFeesEarned: Math.round(platformFeesEarned * 100) / 100,
    expensesByCategory,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netIncome: Math.round(netIncome * 100) / 100
  }
}

function getScheduleCDescription(line: number): string {
  const descriptions: Record<number, string> = {
    1: 'Gross receipts or sales', 2: 'Returns and allowances', 4: 'Cost of goods sold',
    8: 'Advertising', 10: 'Car and truck expenses', 11: 'Commissions and fees',
    13: 'Depreciation', 14: 'Employee benefit programs', 15: 'Insurance', 16: 'Interest',
    17: 'Legal and professional services', 18: 'Office expense', 19: 'Pension and profit-sharing plans',
    20: 'Rent or lease', 21: 'Repairs and maintenance', 22: 'Supplies', 23: 'Taxes and licenses',
    24: 'Travel and meals', 25: 'Utilities', 26: 'Wages', 27: 'Other expenses'
  }
  return descriptions[line] || `Line ${line}`
}

const handler = createHandler(
  { endpoint: 'profit-loss', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // Only allow GET
    if (req.method !== 'GET' && req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const { data: platformAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'platform_revenue')
      .single()

    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString())
    const month = url.searchParams.get('month')
    const quarter = url.searchParams.get('quarter')
    const breakdown = url.searchParams.get('breakdown') === 'monthly'
    
    let startDate: string, endDate: string
    let periodType: 'annual' | 'quarterly' | 'monthly' | 'custom' = 'annual'
    
    if (month) {
      const m = parseInt(month)
      startDate = `${year}-${m.toString().padStart(2, '0')}-01`
      const lastDay = new Date(year, m, 0).getDate()
      endDate = `${year}-${m.toString().padStart(2, '0')}-${lastDay}`
      periodType = 'monthly'
    } else if (quarter) {
      const q = parseInt(quarter)
      const startMonth = (q - 1) * 3 + 1
      const endMonth = q * 3
      startDate = `${year}-${startMonth.toString().padStart(2, '0')}-01`
      const lastDay = new Date(year, endMonth, 0).getDate()
      endDate = `${year}-${endMonth.toString().padStart(2, '0')}-${lastDay}`
      periodType = 'quarterly'
    } else {
      startDate = url.searchParams.get('start_date') || `${year}-01-01`
      endDate = url.searchParams.get('end_date') || `${year}-12-31`
      if (url.searchParams.get('start_date') || url.searchParams.get('end_date')) {
        periodType = 'custom'
      }
    }

    const mainPL = await calculatePeriodPL(supabase, ledger.id, startDate, endDate, platformAccount?.id)

    let monthlyBreakdown: MonthlyData[] | undefined
    if (breakdown) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']
      monthlyBreakdown = []
      for (let m = 1; m <= 12; m++) {
        const mStart = `${year}-${m.toString().padStart(2, '0')}-01`
        const lastDay = new Date(year, m, 0).getDate()
        const mEnd = `${year}-${m.toString().padStart(2, '0')}-${lastDay}`
        const monthPL = await calculatePeriodPL(supabase, ledger.id, mStart, mEnd, platformAccount?.id)
        monthlyBreakdown.push({
          month: `${year}-${m.toString().padStart(2, '0')}`,
          month_name: monthNames[m - 1],
          revenue: Math.round(monthPL.netRevenue * 100) / 100,
          expenses: Math.round(monthPL.totalExpenses * 100) / 100,
          net_income: Math.round(monthPL.netIncome * 100) / 100
        })
      }
    }

    const scheduleCLines: Record<number, { line: number; description: string; amount: number }> = {}
    mainPL.expensesByCategory.forEach((cat: any) => {
      if (cat.schedule_c_line) {
        if (!scheduleCLines[cat.schedule_c_line]) {
          scheduleCLines[cat.schedule_c_line] = {
            line: cat.schedule_c_line,
            description: getScheduleCDescription(cat.schedule_c_line),
            amount: 0
          }
        }
        scheduleCLines[cat.schedule_c_line].amount += cat.amount
      }
    })
    scheduleCLines[1] = { line: 1, description: 'Gross receipts or sales', amount: mainPL.grossSales }
    if (mainPL.refunds > 0) {
      scheduleCLines[2] = { line: 2, description: 'Returns and allowances', amount: mainPL.refunds }
    }

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'profit_loss_report',
      entity_type: 'report',
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      response_status: 200
    })

    const effectiveTaxEstimate = mainPL.netIncome > 0 ? mainPL.netIncome * 0.25 : 0

    const response: ProfitLossResponse = {
      success: true,
      period: { start_date: startDate, end_date: endDate, type: periodType },
      revenue: {
        gross_sales: Math.round(mainPL.grossSales * 100) / 100,
        refunds: Math.round(mainPL.refunds * 100) / 100,
        net_revenue: Math.round(mainPL.netRevenue * 100) / 100,
        platform_fees_earned: Math.round(mainPL.platformFeesEarned * 100) / 100
      },
      expenses: {
        by_category: mainPL.expensesByCategory.map((c: any) => ({ ...c, amount: Math.round(c.amount * 100) / 100 })),
        total: Math.round(mainPL.totalExpenses * 100) / 100
      },
      summary: {
        gross_profit: Math.round(mainPL.netRevenue * 100) / 100,
        total_expenses: Math.round(mainPL.totalExpenses * 100) / 100,
        net_income: Math.round(mainPL.netIncome * 100) / 100,
        effective_tax_estimate: Math.round(effectiveTaxEstimate * 100) / 100
      },
      monthly_breakdown: monthlyBreakdown,
      schedule_c_summary: scheduleCLines
    }

    return jsonResponse(response, 200, req, requestId)
  }
)

Deno.serve(handler)
