// Soledgic Edge Function: Get Balance
// GET /get-balance?creator_id=xxx or GET /get-balance (all balances)
// Returns current balance for creator(s)
// SECURITY HARDENED VERSION v2 - Uses createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BalanceResponse {
  success: boolean
  balance?: {
    creator_id: string
    available: number
    pending: number
    total_earned: number
    total_paid_out: number
    currency: string
  }
  balances?: Array<{
    creator_id: string
    available: number
    pending: number
    currency: string
  }>
  platform_summary?: {
    total_revenue: number
    total_owed_creators: number
    total_paid_out: number
    cash_balance: number
  }
}

const handler = createHandler(
  { endpoint: 'get-balance', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, _body: any) => {
    // Only allow GET
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req)
    }

    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Parse query params with validation
    const url = new URL(req.url)
    const rawCreatorId = url.searchParams.get('creator_id')
    const includePlatform = url.searchParams.get('include_platform') === 'true'

    // Validate creator_id if provided
    const creatorId = rawCreatorId ? validateId(rawCreatorId, 100) : null
    if (rawCreatorId && !creatorId) {
      return errorResponse('Invalid creator_id format', 400, req)
    }

    if (creatorId) {
      // Get single creator balance
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, balance, currency, metadata')
        .eq('ledger_id', ledger.id)
        .eq('account_type', 'creator_balance')
        .eq('entity_id', creatorId)
        .single()

      if (accountError || !account) {
        return errorResponse('Creator not found', 404, req)
      }

      // Calculate total earned and paid out from entries
      const { data: earnings } = await supabase
        .from('entries')
        .select(`
          amount,
          entry_type,
          transaction:transactions!inner(transaction_type, status)
        `)
        .eq('account_id', account.id)

      let totalEarned = 0
      let totalPaidOut = 0

      earnings?.forEach((entry: any) => {
        if (entry.transaction?.status === 'completed' || entry.transaction?.status === 'reversed') {
          if (entry.transaction?.transaction_type === 'sale' && entry.entry_type === 'credit') {
            totalEarned += Number(entry.amount)
          }
          if (entry.transaction?.transaction_type === 'payout' && entry.entry_type === 'debit') {
            totalPaidOut += Number(entry.amount)
          }
        }
      })

      // Get pending payouts
      const { data: pendingPayouts } = await supabase
        .from('payouts')
        .select('amount')
        .eq('ledger_id', ledger.id)
        .eq('account_id', account.id)
        .in('status', ['pending', 'processing'])

      const pendingAmount = pendingPayouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      // SECURITY: Validate balance is a valid finite number
      const rawBalance = Number(account.balance)
      if (!Number.isFinite(rawBalance)) {
        return errorResponse('Invalid account balance state', 500, req)
      }

      // SECURITY: Handle negative balances explicitly instead of masking with Math.abs
      // Negative balance indicates a debt - report it accurately
      const availableBalance = rawBalance - pendingAmount

      const response: BalanceResponse = {
        success: true,
        balance: {
          creator_id: creatorId,
          // Available can be negative if there's a debt or pending exceeds balance
          available: availableBalance,
          pending: pendingAmount,
          total_earned: totalEarned,
          total_paid_out: totalPaidOut,
          currency: account.currency
        }
      }

      return jsonResponse(response, 200, req)

    } else {
      // Get all creator balances
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('entity_id, balance, currency')
        .eq('ledger_id', ledger.id)
        .eq('account_type', 'creator_balance')
        .eq('is_active', true)
        .order('balance', { ascending: false })
        .limit(1000) // Prevent unbounded queries

      if (accountsError) {
        console.error('Failed to fetch accounts:', accountsError)
        return errorResponse('Failed to fetch balances', 500, req)
      }

      // SECURITY: Validate and properly handle balances without masking with Math.abs
      const balances = accounts?.map(acc => {
        const balance = Number(acc.balance)
        return {
          creator_id: acc.entity_id!,
          // Report actual balance - negative indicates debt
          available: Number.isFinite(balance) ? balance : 0,
          pending: 0,
          currency: acc.currency,
          // Flag if balance is in error state
          ...(balance < 0 ? { has_negative_balance: true } : {})
        }
      }) || []

      const response: BalanceResponse = {
        success: true,
        balances
      }

      // Include platform summary if requested
      if (includePlatform) {
        const { data: platformAccounts } = await supabase
          .from('accounts')
          .select('account_type, balance')
          .eq('ledger_id', ledger.id)
          .in('account_type', ['platform_revenue', 'creator_pool', 'cash'])

        const accountMap = platformAccounts?.reduce((map, acc) => {
          map[acc.account_type] = Number(acc.balance)
          return map
        }, {} as Record<string, number>) || {}

        // Calculate total paid out
        const { data: completedPayouts } = await supabase
          .from('payouts')
          .select('amount')
          .eq('ledger_id', ledger.id)
          .eq('status', 'completed')

        const totalPaidOut = completedPayouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

        response.platform_summary = {
          total_revenue: accountMap['platform_revenue'] || 0,
          total_owed_creators: balances.reduce((sum, b) => sum + b.available, 0),
          total_paid_out: totalPaidOut,
          cash_balance: accountMap['cash'] || 0
        }
      }

      return jsonResponse(response, 200, req)
    }
  }
)

Deno.serve(handler)
