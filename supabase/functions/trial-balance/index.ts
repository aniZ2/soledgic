// Soledgic Edge Function: Trial Balance
// GET /trial-balance
// Returns trial balance and integrity check - the heartbeat monitor
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface TrialBalanceResponse {
  success: boolean
  ledger_id?: string
  as_of?: string
  accounts?: Array<{
    account_id: string
    account_type: string
    entity_id: string | null
    name: string
    balance: number
    balance_type: 'debit' | 'credit'
  }>
  totals?: {
    total_debits: number
    total_credits: number
    difference: number
    is_balanced: boolean
  }
  integrity?: {
    is_balanced: boolean
    account_count: number
    transaction_count: number
    entry_count: number
    last_transaction_at: string | null
  }
  snapshot_id?: string
  error?: string
}

const handler = createHandler(
  { endpoint: 'trial-balance', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // Only allow GET
    if (req.method !== 'GET' && req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const url = new URL(req.url)
    const createSnapshot = url.searchParams.get('snapshot') === 'true'
    const asOfDate = url.searchParams.get('as_of') || new Date().toISOString().split('T')[0]

    // Get all accounts with balances
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, account_type, entity_id, name, balance, currency')
      .eq('ledger_id', ledger.id)
      .eq('is_active', true)
      .order('account_type')
      .order('name')

    if (accountsError) {
      console.error('Failed to fetch accounts:', accountsError)
      return errorResponse('Failed to fetch accounts', 500, req, requestId)
    }

    // Calculate totals
    let totalDebits = 0
    let totalCredits = 0

    const formattedAccounts = accounts?.map(acc => {
      const balance = Number(acc.balance)
      const isDebit = balance >= 0
      
      if (isDebit) {
        totalDebits += balance
      } else {
        totalCredits += Math.abs(balance)
      }

      return {
        account_id: acc.id,
        account_type: acc.account_type,
        entity_id: acc.entity_id,
        name: acc.name,
        balance: Math.abs(balance),
        balance_type: isDebit ? 'debit' : 'credit' as const
      }
    }) || []

    // Round to avoid floating point issues
    totalDebits = Math.round(totalDebits * 100) / 100
    totalCredits = Math.round(totalCredits * 100) / 100
    const difference = Math.round((totalDebits - totalCredits) * 100) / 100
    const isBalanced = Math.abs(difference) < 0.01

    // Get integrity stats
    const { count: transactionCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)

    const { data: lastTx } = await supabase
      .from('transactions')
      .select('created_at')
      .eq('ledger_id', ledger.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Create snapshot if requested
    let snapshotId = undefined
    if (createSnapshot) {
      const { data: snapshot } = await supabase
        .rpc('create_trial_balance_snapshot', {
          p_ledger_id: ledger.id,
          p_snapshot_type: 'on_demand'
        })
      if (snapshot) snapshotId = snapshot
    }

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'trial_balance',
      entity_type: 'ledger',
      entity_id: ledger.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      response_status: 200
    })

    const response: TrialBalanceResponse = {
      success: true,
      ledger_id: ledger.id,
      as_of: asOfDate,
      accounts: formattedAccounts,
      totals: {
        total_debits: totalDebits,
        total_credits: totalCredits,
        difference,
        is_balanced: isBalanced
      },
      integrity: {
        is_balanced: isBalanced,
        account_count: accounts?.length || 0,
        transaction_count: transactionCount || 0,
        entry_count: 0,
        last_transaction_at: lastTx?.created_at || null
      },
      snapshot_id: snapshotId
    }

    return jsonResponse(response, 200, req, requestId)
  }
)

Deno.serve(handler)
