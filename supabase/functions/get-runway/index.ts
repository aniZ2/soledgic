// Soledgic Edge Function: Get Runway
// GET /get-runway
// Calculate cash runway and financial health metrics
// SECURITY HARDENED VERSION v2 - Uses createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const handler = createHandler(
  { endpoint: 'get-runway', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, _body: any) => {
    // Only allow GET
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req)
    }

    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Get all account balances
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_type, balance')
      .eq('ledger_id', ledger.id)
      .eq('is_active', true)

    let cashBalance = 0, totalAssets = 0, totalLiabilities = 0, taxReserve = 0

    accounts?.forEach((acc: any) => {
      const balance = Number(acc.balance)
      if (acc.account_type === 'cash') {
        cashBalance = balance
        totalAssets += balance
      } else if (acc.account_type === 'tax_reserve') {
        taxReserve = balance
        totalAssets += balance
      } else if (['creator_balance', 'creator_pool', 'accounts_payable'].includes(acc.account_type)) {
        totalLiabilities += Math.abs(balance)
      } else if (balance > 0) {
        totalAssets += balance
      }
    })

    // Get 3-month trailing averages
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const { data: revenueData } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('ledger_id', ledger.id)
      .eq('transaction_type', 'sale')
      .eq('status', 'completed')
      .gte('created_at', threeMonthsAgo.toISOString())

    const revenueByMonth: Record<string, number> = {}
    revenueData?.forEach((tx: any) => {
      const month = tx.created_at.substring(0, 7)
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(tx.amount)
    })
    const monthsWithRevenue = Object.keys(revenueByMonth).length || 1
    const avgRevenue = Object.values(revenueByMonth).reduce((a, b) => a + b, 0) / monthsWithRevenue

    const { data: expenseData } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('ledger_id', ledger.id)
      .eq('transaction_type', 'expense')
      .eq('status', 'completed')
      .gte('created_at', threeMonthsAgo.toISOString())

    const expenseByMonth: Record<string, number> = {}
    expenseData?.forEach((tx: any) => {
      const month = tx.created_at.substring(0, 7)
      expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(tx.amount)
    })
    const monthsWithExpenses = Object.keys(expenseByMonth).length || 1
    const avgExpenses = Object.values(expenseByMonth).reduce((a, b) => a + b, 0) / monthsWithExpenses

    const netBurn = avgExpenses - avgRevenue

    // Calculate runway
    let runwayMonths: number | 'infinite'
    let runwayStatus: 'critical' | 'warning' | 'healthy' | 'profitable'
    let runwayMessage: string

    if (netBurn <= 0) {
      runwayMonths = 'infinite'
      runwayStatus = 'profitable'
      runwayMessage = `Business is profitable. Generating $${Math.abs(netBurn).toFixed(2)}/month net.`
    } else if (cashBalance <= 0) {
      runwayMonths = 0
      runwayStatus = 'critical'
      runwayMessage = 'No cash remaining. Immediate action required.'
    } else {
      runwayMonths = Math.round((cashBalance / netBurn) * 10) / 10
      if (runwayMonths < 3) {
        runwayStatus = 'critical'
        runwayMessage = `Only ${runwayMonths} months of runway remaining. Take immediate action.`
      } else if (runwayMonths < 6) {
        runwayStatus = 'warning'
        runwayMessage = `${runwayMonths} months of runway. Consider reducing expenses or increasing revenue.`
      } else {
        runwayStatus = 'healthy'
        runwayMessage = `${runwayMonths} months of runway. Business is in good financial health.`
      }
    }

    const monthlyNet = avgRevenue - avgExpenses
    const cash3mo = cashBalance + (monthlyNet * 3)
    const cash6mo = cashBalance + (monthlyNet * 6)
    const cash12mo = cashBalance + (monthlyNet * 12)

    const ytdProfit = avgRevenue * 12 - avgExpenses * 12
    const estimatedTaxOwed = ytdProfit > 0 ? ytdProfit * 0.30 : 0
    const taxShortfall = Math.max(0, estimatedTaxOwed - taxReserve)

    // Save snapshot (fire and forget)
    supabase.from('runway_snapshots').insert({
      ledger_id: ledger.id,
      cash_balance: cashBalance,
      avg_monthly_revenue: avgRevenue,
      avg_monthly_expenses: avgExpenses,
      avg_monthly_burn: netBurn,
      runway_months: typeof runwayMonths === 'number' ? runwayMonths : 999,
      projected_cash_3mo: cash3mo,
      projected_cash_6mo: cash6mo,
      projected_cash_12mo: cash12mo
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      snapshot_date: new Date().toISOString().split('T')[0],
      current_state: {
        cash_balance: Math.round(cashBalance * 100) / 100,
        total_assets: Math.round(totalAssets * 100) / 100,
        total_liabilities: Math.round(totalLiabilities * 100) / 100,
        net_position: Math.round((totalAssets - totalLiabilities) * 100) / 100
      },
      monthly_averages: {
        revenue: Math.round(avgRevenue * 100) / 100,
        expenses: Math.round(avgExpenses * 100) / 100,
        net_burn: Math.round(netBurn * 100) / 100
      },
      runway: { months: runwayMonths, status: runwayStatus, message: runwayMessage },
      projections: {
        cash_3_months: Math.round(cash3mo * 100) / 100,
        cash_6_months: Math.round(cash6mo * 100) / 100,
        cash_12_months: Math.round(cash12mo * 100) / 100
      },
      tax_reserves: {
        total_reserved: Math.round(taxReserve * 100) / 100,
        estimated_owed: Math.round(estimatedTaxOwed * 100) / 100,
        shortfall: Math.round(taxShortfall * 100) / 100
      }
    }, 200, req)
  }
)

Deno.serve(handler)
