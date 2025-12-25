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

const handler = createHandler(
  { endpoint: 'list-ledgers', requireAuth: false, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, _body: any) => {
    // Only allow GET
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req)
    }

    const ownerEmail = req.headers.get('x-owner-email')
    const apiKey = req.headers.get('x-api-key')

    if (!ownerEmail && !apiKey) {
      return errorResponse('Missing x-owner-email or x-api-key header', 401, req)
    }

    let ownerEmailToUse: string

    if (apiKey && ledger) {
      // Get owner_email from ledger
      const { data: ledgerData } = await supabase
        .from('ledgers')
        .select('owner_email')
        .eq('id', ledger.id)
        .single()

      if (!ledgerData?.owner_email) {
        return errorResponse('Ledger owner not found', 404, req)
      }
      ownerEmailToUse = ledgerData.owner_email
    } else if (ownerEmail) {
      const validatedEmail = validateEmail(ownerEmail)
      if (!validatedEmail) {
        return errorResponse('Invalid email format', 400, req)
      }
      ownerEmailToUse = validatedEmail
    } else {
      return errorResponse('Invalid authentication', 401, req)
    }

    const { data: ledgers, error } = await supabase
      .from('ledgers')
      .select('id, business_name, ledger_mode, status, created_at')
      .eq('owner_email', ownerEmailToUse)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching ledgers:', error)
      return errorResponse('Failed to fetch ledgers', 500, req)
    }

    // Get stats for each ledger
    const ledgerSummaries: LedgerSummary[] = await Promise.all(
      (ledgers || []).map(async (l) => {
        const { count: accountCount } = await supabase
          .from('accounts')
          .select('*', { count: 'exact', head: true })
          .eq('ledger_id', l.id)

        const { count: transactionCount } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('ledger_id', l.id)

        const { data: sales } = await supabase
          .from('transactions')
          .select('amount')
          .eq('ledger_id', l.id)
          .eq('transaction_type', 'sale')
          .eq('status', 'completed')

        const totalRevenue = sales?.reduce((sum, t) => sum + Number(t.amount), 0) || 0

        const { data: expenses } = await supabase
          .from('transactions')
          .select('amount')
          .eq('ledger_id', l.id)
          .eq('transaction_type', 'expense')
          .eq('status', 'completed')

        const totalExpenses = expenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0

        return {
          id: l.id,
          business_name: l.business_name,
          ledger_mode: l.ledger_mode,
          status: l.status,
          created_at: l.created_at,
          stats: {
            total_revenue: Math.round(totalRevenue * 100) / 100,
            total_expenses: Math.round(totalExpenses * 100) / 100,
            net_income: Math.round((totalRevenue - totalExpenses) * 100) / 100,
            account_count: accountCount || 0,
            transaction_count: transactionCount || 0
          }
        }
      })
    )

    return jsonResponse({ success: true, ledgers: ledgerSummaries }, 200, req)
  }
)

Deno.serve(handler)
