// Soledgic Edge Function: Get Balances
// POST /get-balances
// Returns account balances, creator balances, or financial summary
// SECURITY HARDENED VERSION v2 - Uses createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Action = 'all_accounts' | 'creator_balances' | 'summary' | 'single_account' | 'single_creator'

interface BalancesRequest {
  action: Action
  account_id?: string
  creator_id?: string
  as_of_date?: string
}

async function getActiveEntries(supabase: SupabaseClient, accountId: string) {
  const { data: entries } = await supabase
    .from('entries')
    .select('entry_type, amount, transaction_id, transactions!inner(status)')
    .eq('account_id', accountId)
    .not('transactions.status', 'in', '("voided","reversed")')
  return entries || []
}

function calculateBalance(entries: any[]): number {
  let balance = 0
  for (const e of entries) {
    balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
  }
  return Math.round(balance * 100) / 100
}

const handler = createHandler(
  { endpoint: 'get-balances', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: BalancesRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    const action = body?.action || (body?.creator_id ? 'single_creator' : 'summary')

    switch (action) {
      case 'all_accounts': {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, account_type, entity_id, entity_type')
          .eq('ledger_id', ledger.id)
          .eq('is_active', true)

        const balances = []
        for (const account of accounts || []) {
          const entries = await getActiveEntries(supabase, account.id)
          const balance = calculateBalance(entries)
          balances.push({
            account_id: account.id,
            name: account.name,
            account_type: account.account_type,
            entity_id: account.entity_id,
            balance
          })
        }

        return jsonResponse({ success: true, data: balances }, 200, req)
      }

      case 'creator_balances': {
        const { data: creators } = await supabase
          .from('accounts')
          .select('id, name, entity_id, metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')
          .eq('is_active', true)

        const balances = []
        for (const creator of creators || []) {
          const entries = await getActiveEntries(supabase, creator.id)
          const ledgerBalance = calculateBalance(entries)

          const { data: heldFunds } = await supabase
            .from('held_funds')
            .select('held_amount, released_amount')
            .eq('ledger_id', ledger.id)
            .eq('creator_id', creator.entity_id)
            .in('status', ['held', 'partial'])

          let totalHeld = 0
          for (const hf of heldFunds || []) {
            totalHeld += Number(hf.held_amount) - Number(hf.released_amount)
          }

          balances.push({
            creator_id: creator.entity_id,
            name: creator.name,
            tier: creator.metadata?.tier_name || 'starter',
            ledger_balance: ledgerBalance,
            held_amount: Math.round(totalHeld * 100) / 100,
            available_balance: Math.round((ledgerBalance - totalHeld) * 100) / 100
          })
        }

        return jsonResponse({ success: true, data: balances }, 200, req)
      }

      case 'single_creator': {
        const creatorId = body?.creator_id ? validateId(body.creator_id, 100) : null
        if (!creatorId) {
          return errorResponse('Invalid or missing creator_id', 400, req)
        }

        const { data: creator } = await supabase
          .from('accounts')
          .select('id, name, entity_id, metadata')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')
          .eq('entity_id', creatorId)
          .single()

        if (!creator) {
          return errorResponse('Creator not found', 404, req)
        }

        const entries = await getActiveEntries(supabase, creator.id)
        const ledgerBalance = calculateBalance(entries)

        const { data: heldFunds } = await supabase
          .from('held_funds')
          .select('held_amount, released_amount, hold_reason, release_eligible_at, status')
          .eq('ledger_id', ledger.id)
          .eq('creator_id', creatorId)

        let totalHeld = 0
        const holds = []
        for (const hf of heldFunds || []) {
          if (hf.status === 'held' || hf.status === 'partial') {
            const held = Number(hf.held_amount) - Number(hf.released_amount)
            totalHeld += held
            holds.push({
              amount: held,
              reason: hf.hold_reason,
              release_date: hf.release_eligible_at,
              status: hf.status
            })
          }
        }

        return jsonResponse({
          success: true,
          data: {
            creator_id: creatorId,
            name: creator.name,
            tier: creator.metadata?.tier_name || 'starter',
            custom_split: creator.metadata?.custom_split_percent,
            ledger_balance: ledgerBalance,
            held_amount: Math.round(totalHeld * 100) / 100,
            available_balance: Math.round((ledgerBalance - totalHeld) * 100) / 100,
            holds
          }
        }, 200, req)
      }

      case 'summary': {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, account_type')
          .eq('ledger_id', ledger.id)
          .eq('is_active', true)

        let totalAssets = 0, totalLiabilities = 0, totalRevenue = 0, totalExpenses = 0

        for (const account of accounts || []) {
          const entries = await getActiveEntries(supabase, account.id)
          const balance = calculateBalance(entries)

          if (['cash', 'accounts_receivable', 'inventory', 'fixed_asset'].includes(account.account_type)) {
            totalAssets += Math.abs(balance)
          } else if (['accounts_payable', 'creator_balance', 'creator_pool', 'credit_card', 'tax_reserve', 'refund_reserve', 'reserve'].includes(account.account_type)) {
            totalLiabilities += Math.abs(balance)
          } else if (['revenue', 'platform_revenue', 'other_income'].includes(account.account_type)) {
            totalRevenue += Math.abs(balance)
          } else if (['expense', 'processing_fees', 'cost_of_goods'].includes(account.account_type)) {
            totalExpenses += Math.abs(balance)
          }
        }

        return jsonResponse({
          success: true,
          data: {
            total_assets: Math.round(totalAssets * 100) / 100,
            total_liabilities: Math.round(totalLiabilities * 100) / 100,
            total_revenue: Math.round(totalRevenue * 100) / 100,
            total_expenses: Math.round(totalExpenses * 100) / 100,
            net_income: Math.round((totalRevenue - totalExpenses) * 100) / 100,
            net_worth: Math.round((totalAssets - totalLiabilities) * 100) / 100
          }
        }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400, req)
    }
  }
)

Deno.serve(handler)
