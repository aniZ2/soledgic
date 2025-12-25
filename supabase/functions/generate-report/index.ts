// Soledgic Edge Function: Generate Report
// POST /generate-report
// Generates financial reports: P&L, Trial Balance, 1099, etc.
// SECURITY HARDENED VERSION

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ReportType = 'profit_loss' | 'trial_balance' | 'general_ledger' | '1099_summary' | 'creator_earnings' | 'transaction_history'

interface ReportRequest {
  report_type: ReportType
  start_date?: string
  end_date?: string
  creator_id?: string
  format?: 'json' | 'csv'
}

const EXCLUDED_STATUSES = ['voided', 'reversed']

const handler = createHandler(
  { endpoint: 'generate-report', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ReportRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Validate dates
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const startDate = body.start_date && dateRegex.test(body.start_date) 
      ? body.start_date 
      : new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const endDate = body.end_date && dateRegex.test(body.end_date)
      ? body.end_date 
      : new Date().toISOString().split('T')[0]

    const creatorId = body.creator_id ? validateId(body.creator_id, 100) : null

    switch (body.report_type) {
      case 'profit_loss': {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, account_type')
          .eq('ledger_id', ledger.id)
          .in('account_type', ['revenue', 'platform_revenue', 'other_income', 'expense', 'processing_fees', 'cost_of_goods'])

        const revenue: any[] = []
        const expenses: any[] = []
        let totalRevenue = 0
        let totalExpenses = 0

        for (const account of accounts || []) {
          const { data: entries } = await supabase
            .from('entries')
            .select('entry_type, amount, transactions!inner(created_at, status)')
            .eq('account_id', account.id)
            .gte('transactions.created_at', startDate)
            .lte('transactions.created_at', endDate + 'T23:59:59')
            .not('transactions.status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)

          let balance = 0
          for (const e of entries || []) {
            balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
          }
          balance = Math.abs(balance)

          if (['revenue', 'platform_revenue', 'other_income'].includes(account.account_type)) {
            revenue.push({ name: account.name, amount: balance })
            totalRevenue += balance
          } else {
            expenses.push({ name: account.name, amount: balance })
            totalExpenses += balance
          }
        }

        return jsonResponse({
          success: true,
          report: {
            type: 'profit_loss',
            business: ledger.business_name,
            period: { start: startDate, end: endDate },
            revenue: { items: revenue, total: Math.round(totalRevenue * 100) / 100 },
            expenses: { items: expenses, total: Math.round(totalExpenses * 100) / 100 },
            net_income: Math.round((totalRevenue - totalExpenses) * 100) / 100
          }
        }, 200, req)
      }

      case 'trial_balance': {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, account_type')
          .eq('ledger_id', ledger.id)
          .eq('is_active', true)

        const rows: any[] = []
        let totalDebits = 0
        let totalCredits = 0

        for (const account of accounts || []) {
          const { data: entries } = await supabase
            .from('entries')
            .select('entry_type, amount, transactions!inner(status)')
            .eq('account_id', account.id)
            .not('transactions.status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)

          let debits = 0, credits = 0
          for (const e of entries || []) {
            if (e.entry_type === 'debit') debits += Number(e.amount)
            else credits += Number(e.amount)
          }

          if (debits > 0 || credits > 0) {
            const netDebit = debits > credits ? debits - credits : 0
            const netCredit = credits > debits ? credits - debits : 0
            rows.push({
              account: account.name,
              account_type: account.account_type,
              debit: Math.round(netDebit * 100) / 100,
              credit: Math.round(netCredit * 100) / 100
            })
            totalDebits += netDebit
            totalCredits += netCredit
          }
        }

        return jsonResponse({
          success: true,
          report: {
            type: 'trial_balance',
            as_of: endDate,
            accounts: rows,
            totals: {
              debits: Math.round(totalDebits * 100) / 100,
              credits: Math.round(totalCredits * 100) / 100,
              balanced: Math.abs(totalDebits - totalCredits) < 0.01
            }
          }
        }, 200, req)
      }

      case '1099_summary': {
        const year = new Date(endDate).getFullYear()
        const yearStart = `${year}-01-01`
        const yearEnd = `${year}-12-31`

        const { data: creators } = await supabase
          .from('accounts')
          .select('id, entity_id, name, metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')

        const payees: any[] = []

        for (const creator of creators || []) {
          const { data: payoutEntries } = await supabase
            .from('entries')
            .select('amount, transactions!inner(created_at, transaction_type, status)')
            .eq('account_id', creator.id)
            .eq('entry_type', 'debit')
            .eq('transactions.transaction_type', 'payout')
            .gte('transactions.created_at', yearStart)
            .lte('transactions.created_at', yearEnd + 'T23:59:59')
            .not('transactions.status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)

          let totalPaid = 0
          for (const e of payoutEntries || []) totalPaid += Number(e.amount)

          if (totalPaid > 0) {
            payees.push({
              id: creator.entity_id,
              name: creator.name,
              total_paid: Math.round(totalPaid * 100) / 100,
              requires_1099: totalPaid >= 600,
              w9_status: creator.metadata?.w9_status || 'unknown'
            })
          }
        }

        return jsonResponse({
          success: true,
          report: {
            type: '1099_summary',
            tax_year: year,
            payees: payees.sort((a, b) => b.total_paid - a.total_paid),
            summary: {
              total_payees: payees.length,
              requiring_1099: payees.filter(p => p.requires_1099).length,
              total_paid: Math.round(payees.reduce((s, p) => s + p.total_paid, 0) * 100) / 100
            }
          }
        }, 200, req)
      }

      case 'creator_earnings': {
        const { data: creators } = await supabase
          .from('accounts')
          .select('id, entity_id, name, metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')

        const earnings: any[] = []

        for (const creator of creators || []) {
          const { data: creditEntries } = await supabase
            .from('entries')
            .select('amount, transactions!inner(created_at, status)')
            .eq('account_id', creator.id)
            .eq('entry_type', 'credit')
            .gte('transactions.created_at', startDate)
            .lte('transactions.created_at', endDate + 'T23:59:59')
            .not('transactions.status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)

          const { data: debitEntries } = await supabase
            .from('entries')
            .select('amount, transactions!inner(created_at, status)')
            .eq('account_id', creator.id)
            .eq('entry_type', 'debit')
            .gte('transactions.created_at', startDate)
            .lte('transactions.created_at', endDate + 'T23:59:59')
            .not('transactions.status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)

          let totalEarned = 0, totalPaid = 0
          for (const e of creditEntries || []) totalEarned += Number(e.amount)
          for (const e of debitEntries || []) totalPaid += Number(e.amount)

          if (totalEarned > 0 || totalPaid > 0) {
            earnings.push({
              creator_id: creator.entity_id,
              name: creator.name,
              tier: creator.metadata?.tier_name || 'starter',
              total_earned: Math.round(totalEarned * 100) / 100,
              total_paid: Math.round(totalPaid * 100) / 100,
              balance: Math.round((totalEarned - totalPaid) * 100) / 100
            })
          }
        }

        return jsonResponse({
          success: true,
          report: {
            type: 'creator_earnings',
            period: { start: startDate, end: endDate },
            creators: earnings.sort((a, b) => b.total_earned - a.total_earned),
            totals: {
              earned: Math.round(earnings.reduce((s, c) => s + c.total_earned, 0) * 100) / 100,
              paid: Math.round(earnings.reduce((s, c) => s + c.total_paid, 0) * 100) / 100
            }
          }
        }, 200, req)
      }

      case 'transaction_history': {
        let query = supabase
          .from('transactions')
          .select('id, transaction_type, reference_id, description, amount, status, created_at, metadata')
          .eq('ledger_id', ledger.id)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59')
          .order('created_at', { ascending: false })
          .limit(500)

        if (creatorId) {
          query = query.eq('metadata->creator_id', creatorId)
        }

        const { data: transactions } = await query

        const annotated = (transactions || []).map(tx => ({
          ...tx,
          is_active: !EXCLUDED_STATUSES.includes(tx.status)
        }))

        return jsonResponse({
          success: true,
          report: {
            type: 'transaction_history',
            period: { start: startDate, end: endDate },
            creator_id: creatorId,
            transactions: annotated,
            count: annotated.length,
            active_count: annotated.filter(t => t.is_active).length
          }
        }, 200, req)
      }

      default:
        return errorResponse(`Unknown report type: ${body.report_type}`, 400, req)
    }
  }
)

Deno.serve(handler)
