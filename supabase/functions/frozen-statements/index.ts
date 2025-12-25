// Soledgic Edge Function: Frozen Statements
// POST /frozen-statements
// Generate and retrieve read-only financial statements for locked periods
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

type Action = 'generate' | 'get' | 'list' | 'verify'
type StatementType = 'profit_loss' | 'balance_sheet' | 'trial_balance' | 'cash_flow'

interface FrozenStatementRequest {
  action: Action
  period_id?: string
  statement_type?: StatementType
}

const VALID_ACTIONS = ['generate', 'get', 'list', 'verify']
const VALID_STATEMENT_TYPES = ['profit_loss', 'balance_sheet', 'trial_balance', 'cash_flow']

async function generateHash(data: any): Promise<string> {
  const json = JSON.stringify(data, Object.keys(data).sort())
  const buffer = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const handler = createHandler(
  { endpoint: 'frozen-statements', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: FrozenStatementRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(`Invalid action: must be one of ${VALID_ACTIONS.join(', ')}`, 400, req, requestId)
    }

    switch (body.action) {
      case 'generate': {
        const periodId = body.period_id ? validateId(body.period_id, 100) : null
        if (!periodId) {
          return errorResponse('Invalid or missing period_id', 400, req, requestId)
        }

        const { data: period } = await supabase
          .from('accounting_periods')
          .select('*')
          .eq('id', periodId)
          .eq('ledger_id', ledger.id)
          .single()

        if (!period) {
          return errorResponse('Period not found', 404, req, requestId)
        }

        if (period.status !== 'closed' && period.status !== 'locked') {
          return jsonResponse({ 
            success: false, 
            error: 'Can only generate frozen statements for closed/locked periods',
            current_status: period.status
          }, 400, req, requestId)
        }

        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, account_type')
          .eq('ledger_id', ledger.id)
          .eq('is_active', true)

        const accountBalances: any[] = []
        let totalDebits = 0, totalCredits = 0
        let totalAssets = 0, totalLiabilities = 0, totalEquity = 0
        let totalRevenue = 0, totalExpenses = 0

        for (const account of accounts || []) {
          const { data: entries } = await supabase
            .from('entries')
            .select('entry_type, amount, transactions!inner(created_at, status)')
            .eq('account_id', account.id)
            .not('transactions.status', 'in', '("voided","reversed")')
            .lte('transactions.created_at', period.period_end + 'T23:59:59')

          let debits = 0, credits = 0
          for (const e of entries || []) {
            if (e.entry_type === 'debit') debits += Number(e.amount)
            else credits += Number(e.amount)
          }

          const netBalance = debits - credits
          
          if (debits > 0 || credits > 0) {
            accountBalances.push({
              account_id: account.id,
              name: account.name,
              type: account.account_type,
              debits: Math.round(debits * 100) / 100,
              credits: Math.round(credits * 100) / 100,
              balance: Math.round(netBalance * 100) / 100
            })

            totalDebits += debits
            totalCredits += credits

            if (['cash', 'accounts_receivable', 'inventory', 'fixed_asset'].includes(account.account_type)) {
              totalAssets += Math.abs(netBalance)
            } else if (['accounts_payable', 'creator_balance', 'credit_card', 'reserve'].includes(account.account_type)) {
              totalLiabilities += Math.abs(netBalance)
            } else if (['equity', 'retained_earnings'].includes(account.account_type)) {
              totalEquity += netBalance
            } else if (['revenue', 'platform_revenue', 'other_income'].includes(account.account_type)) {
              totalRevenue += Math.abs(netBalance)
            } else if (['expense', 'processing_fees', 'cost_of_goods'].includes(account.account_type)) {
              totalExpenses += Math.abs(netBalance)
            }
          }
        }

        const netIncome = totalRevenue - totalExpenses
        const generatedAt = new Date().toISOString()

        const trialBalanceData = {
          statement_type: 'trial_balance',
          period: { start: period.period_start, end: period.period_end },
          business: ledger.business_name,
          generated_at: generatedAt,
          accounts: accountBalances,
          totals: { debits: Math.round(totalDebits * 100) / 100, credits: Math.round(totalCredits * 100) / 100, balanced: Math.abs(totalDebits - totalCredits) < 0.01 }
        }

        const profitLossData = {
          statement_type: 'profit_loss',
          period: { start: period.period_start, end: period.period_end },
          business: ledger.business_name,
          generated_at: generatedAt,
          revenue: { items: accountBalances.filter(a => ['revenue', 'platform_revenue', 'other_income'].includes(a.type)), total: Math.round(totalRevenue * 100) / 100 },
          expenses: { items: accountBalances.filter(a => ['expense', 'processing_fees', 'cost_of_goods'].includes(a.type)), total: Math.round(totalExpenses * 100) / 100 },
          net_income: Math.round(netIncome * 100) / 100
        }

        const balanceSheetData = {
          statement_type: 'balance_sheet',
          as_of: period.period_end,
          business: ledger.business_name,
          generated_at: generatedAt,
          assets: { items: accountBalances.filter(a => ['cash', 'accounts_receivable', 'inventory', 'fixed_asset'].includes(a.type)), total: Math.round(totalAssets * 100) / 100 },
          liabilities: { items: accountBalances.filter(a => ['accounts_payable', 'creator_balance', 'credit_card', 'reserve'].includes(a.type)), total: Math.round(totalLiabilities * 100) / 100 },
          equity: { retained_earnings: Math.round(netIncome * 100) / 100, total: Math.round((totalEquity + netIncome) * 100) / 100 },
          balanced: Math.abs(totalAssets - totalLiabilities - totalEquity - netIncome) < 0.01
        }

        const [trialBalanceHash, profitLossHash, balanceSheetHash] = await Promise.all([
          generateHash(trialBalanceData),
          generateHash(profitLossData),
          generateHash(balanceSheetData)
        ])

        await supabase.from('frozen_statements').upsert([
          { ledger_id: ledger.id, period_id: periodId, statement_type: 'trial_balance', statement_data: trialBalanceData, integrity_hash: trialBalanceHash, generated_at: generatedAt },
          { ledger_id: ledger.id, period_id: periodId, statement_type: 'profit_loss', statement_data: profitLossData, integrity_hash: profitLossHash, generated_at: generatedAt },
          { ledger_id: ledger.id, period_id: periodId, statement_type: 'balance_sheet', statement_data: balanceSheetData, integrity_hash: balanceSheetHash, generated_at: generatedAt }
        ], { onConflict: 'ledger_id,period_id,statement_type' })

        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'frozen_statements_generated',
          entity_type: 'accounting_period',
          entity_id: periodId,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_id: requestId,
          request_body: { hashes: { trial_balance: trialBalanceHash, profit_loss: profitLossHash, balance_sheet: balanceSheetHash } }
        })

        return jsonResponse({
          success: true,
          message: 'Frozen statements generated',
          period_id: periodId,
          statements: {
            trial_balance: { hash: trialBalanceHash, balanced: trialBalanceData.totals.balanced },
            profit_loss: { hash: profitLossHash, net_income: profitLossData.net_income },
            balance_sheet: { hash: balanceSheetHash, balanced: balanceSheetData.balanced }
          }
        }, 200, req, requestId)
      }

      case 'get': {
        const periodId = body.period_id ? validateId(body.period_id, 100) : null
        if (!periodId) return errorResponse('Invalid or missing period_id', 400, req, requestId)
        if (!body.statement_type || !VALID_STATEMENT_TYPES.includes(body.statement_type)) {
          return errorResponse(`Invalid statement_type: must be one of ${VALID_STATEMENT_TYPES.join(', ')}`, 400, req, requestId)
        }

        const { data: statement } = await supabase
          .from('frozen_statements')
          .select('*')
          .eq('ledger_id', ledger.id)
          .eq('period_id', periodId)
          .eq('statement_type', body.statement_type)
          .single()

        if (!statement) {
          return errorResponse('Statement not found', 404, req, requestId)
        }

        const currentHash = await generateHash(statement.statement_data)
        const integrityValid = currentHash === statement.integrity_hash

        return jsonResponse({
          success: true,
          statement: {
            type: statement.statement_type,
            period_id: statement.period_id,
            generated_at: statement.generated_at,
            integrity_hash: statement.integrity_hash,
            integrity_valid: integrityValid,
            data: statement.statement_data
          },
          read_only: true,
          warning: integrityValid ? null : 'INTEGRITY CHECK FAILED - Statement may have been tampered with'
        }, 200, req, requestId)
      }

      case 'list': {
        let query = supabase
          .from('frozen_statements')
          .select('id, period_id, statement_type, integrity_hash, generated_at')
          .eq('ledger_id', ledger.id)

        if (body.period_id) {
          const periodId = validateId(body.period_id, 100)
          if (periodId) query = query.eq('period_id', periodId)
        }

        const { data: statements } = await query.order('generated_at', { ascending: false })

        return jsonResponse({ success: true, count: statements?.length || 0, statements: statements || [] }, 200, req, requestId)
      }

      case 'verify': {
        const periodId = body.period_id ? validateId(body.period_id, 100) : null
        if (!periodId) return errorResponse('Invalid or missing period_id', 400, req, requestId)

        const { data: statements } = await supabase
          .from('frozen_statements')
          .select('*')
          .eq('ledger_id', ledger.id)
          .eq('period_id', periodId)

        const results: any[] = []
        let allValid = true

        for (const stmt of statements || []) {
          const currentHash = await generateHash(stmt.statement_data)
          const valid = currentHash === stmt.integrity_hash
          if (!valid) allValid = false
          results.push({ statement_type: stmt.statement_type, stored_hash: stmt.integrity_hash, computed_hash: currentHash, valid })
        }

        return jsonResponse({ success: true, period_id: periodId, all_valid: allValid, verification_results: results }, 200, req, requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
