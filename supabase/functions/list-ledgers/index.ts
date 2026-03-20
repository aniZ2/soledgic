// Soledgic Edge Function: List Ledgers
// GET /list-ledgers
// List all ledgers for a given owner email (multi-business support)
// SECURITY HARDENED VERSION v2 - Uses createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateEmail,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface LedgerSummary {
  id: string
  business_name: string
  ledger_mode: string
  status: string
  created_at: string
  stats: {
    total_revenue: number
    total_expenses: number
    net_income: number
    account_count: number
    transaction_count: number
  }
}

function getSaleSubtotalAmount(transaction: { amount: number; metadata?: Record<string, unknown> | null }): number {
  const amounts = transaction.metadata && typeof transaction.metadata === 'object' && !Array.isArray(transaction.metadata)
    ? (transaction.metadata as Record<string, unknown>).amounts_cents
    : null
  if (amounts && typeof amounts === 'object' && !Array.isArray(amounts)) {
    const subtotal = Number((amounts as Record<string, unknown>).subtotal)
    if (Number.isFinite(subtotal)) {
      return subtotal / 100
    }
    const gross = Number((amounts as Record<string, unknown>).gross)
    const salesTax = Number((amounts as Record<string, unknown>).sales_tax)
    if (Number.isFinite(gross) && Number.isFinite(salesTax)) {
      return (gross - salesTax) / 100
    }
  }
  return Number(transaction.amount)
}

const handler = createHandler(
  { endpoint: 'list-ledgers', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, _body: any) => {
    // Only allow GET
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req)
    }

    if (!ledger) {
      return errorResponse('API key required', 401, req)
    }

    // Get owner_email from authenticated ledger
    const { data: ledgerData } = await supabase
      .from('ledgers')
      .select('owner_email')
      .eq('id', ledger.id)
      .single()

    if (!ledgerData?.owner_email) {
      return errorResponse('Ledger owner not found', 404, req)
    }
    const ownerEmailToUse = ledgerData.owner_email

    const { data: ledgers, error } = await supabase
      .from('ledgers')
      .select('id, business_name, ledger_mode, status, created_at')
      .eq('owner_email', ownerEmailToUse)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching ledgers:', error)
      return errorResponse('Failed to fetch ledgers', 500, req)
    }

    // Get stats in bulk (avoid N+1)
    const ledgerIds = (ledgers || []).map((l) => l.id)
    const statsMap = new Map<string, { revenue: number; expenses: number; accounts: number; transactions: number }>()

    if (ledgerIds.length > 0) {
      // Batch: account counts
      const { data: accountCounts } = await supabase
        .from('accounts')
        .select('ledger_id')
        .in('ledger_id', ledgerIds)

      // Batch: transaction summaries (type + amount in one query)
      const { data: txnSummaries } = await supabase
        .from('transactions')
        .select('ledger_id, transaction_type, amount, metadata, status')
        .in('ledger_id', ledgerIds)
        .eq('status', 'completed')
        .in('transaction_type', ['sale', 'expense'])

      for (const id of ledgerIds) {
        const acctCount = (accountCounts || []).filter((a) => a.ledger_id === id).length
        const txns = (txnSummaries || []).filter((t) => t.ledger_id === id)
        const revenue = txns
          .filter((t) => t.transaction_type === 'sale')
          .reduce((s, t) => s + getSaleSubtotalAmount(t as { amount: number; metadata?: Record<string, unknown> | null }), 0)
        const expenses = txns.filter((t) => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

        statsMap.set(id, { revenue, expenses, accounts: acctCount, transactions: txns.length })
      }
    }

    const ledgerSummaries: LedgerSummary[] = (ledgers || []).map((l) => {
      const stats = statsMap.get(l.id) || { revenue: 0, expenses: 0, accounts: 0, transactions: 0 }
      return {
        id: l.id,
        business_name: l.business_name,
        ledger_mode: l.ledger_mode,
        status: l.status,
        created_at: l.created_at,
        stats: {
          total_revenue: Math.round(stats.revenue * 100) / 100,
          total_expenses: Math.round(stats.expenses * 100) / 100,
          net_income: Math.round((stats.revenue - stats.expenses) * 100) / 100,
          account_count: stats.accounts,
          transaction_count: stats.transactions,
        },
      }
    })

    return jsonResponse({ success: true, ledgers: ledgerSummaries }, 200, req)
  }
)

Deno.serve(handler)
