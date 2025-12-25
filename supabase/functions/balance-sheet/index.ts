// Soledgic Edge Function: Balance Sheet Report
// GET /balance-sheet
// Generate Balance Sheet: Assets = Liabilities + Equity
// SECURITY HARDENED VERSION

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface AccountBalance {
  account_id: string
  account_name: string
  account_type: string
  balance: number
}

interface BalanceSheetSection {
  accounts: AccountBalance[]
  total: number
}

interface BalanceSheetResponse {
  success: boolean
  as_of_date: string
  assets: {
    current_assets: BalanceSheetSection
    fixed_assets: BalanceSheetSection
    total_assets: number
  }
  liabilities: {
    current_liabilities: BalanceSheetSection
    long_term_liabilities: BalanceSheetSection
    total_liabilities: number
  }
  equity: {
    owner_equity: BalanceSheetSection
    retained_earnings: number
    current_period_net_income: number
    total_equity: number
  }
  balance_check: {
    assets: number
    liabilities_plus_equity: number
    is_balanced: boolean
    difference: number
  }
}

// Account type classifications
const CURRENT_ASSET_TYPES = ['cash', 'accounts_receivable', 'inventory', 'prepaid_expense']
const FIXED_ASSET_TYPES = ['fixed_asset', 'property', 'equipment', 'accumulated_depreciation']
const CURRENT_LIABILITY_TYPES = ['accounts_payable', 'creator_balance', 'payee_balance', 'accrued_expense', 'tax_payable', 'unearned_revenue']
const LONG_TERM_LIABILITY_TYPES = ['long_term_debt', 'notes_payable', 'deferred_tax']
const EQUITY_TYPES = ['owner_equity', 'retained_earnings', 'common_stock', 'additional_paid_in_capital']

// Debit-normal accounts (positive balance means debit > credit)
const DEBIT_NORMAL_TYPES = ['cash', 'accounts_receivable', 'inventory', 'prepaid_expense', 'fixed_asset', 'property', 'equipment', 'expense']
// Credit-normal accounts (positive balance means credit > debit)
const CREDIT_NORMAL_TYPES = ['accounts_payable', 'creator_balance', 'payee_balance', 'accrued_expense', 'tax_payable', 'unearned_revenue', 'long_term_debt', 'notes_payable', 'owner_equity', 'retained_earnings', 'revenue', 'platform_revenue']

const handler = createHandler(
  { endpoint: 'balance-sheet', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const url = new URL(req.url)
    const asOfDateParam = url.searchParams.get('as_of_date')
    const asOfDate = asOfDateParam || new Date().toISOString().split('T')[0]

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD', 400, req, requestId)
    }

    // Get all accounts with their balances
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name, account_type, entity_type')
      .eq('ledger_id', ledger.id)

    if (accountsError) {
      console.error('Failed to fetch accounts:', accountsError)
      return errorResponse('Failed to fetch accounts', 500, req, requestId)
    }

    // Get all entries up to as_of_date
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select(`
        account_id,
        entry_type,
        amount,
        transaction:transactions!inner(created_at, status)
      `)
      .eq('transactions.ledger_id', ledger.id)
      .eq('transactions.status', 'completed')
      .lte('transactions.created_at', asOfDate + 'T23:59:59Z')

    if (entriesError) {
      console.error('Failed to fetch entries:', entriesError)
      return errorResponse('Failed to fetch entries', 500, req, requestId)
    }

    // Calculate balance for each account
    const accountBalances: Record<string, number> = {}
    
    for (const entry of entries || []) {
      const accountId = entry.account_id
      if (!accountBalances[accountId]) {
        accountBalances[accountId] = 0
      }
      
      // Debits increase, credits decrease for debit-normal accounts
      // Credits increase, debits decrease for credit-normal accounts
      if (entry.entry_type === 'debit') {
        accountBalances[accountId] += Number(entry.amount)
      } else {
        accountBalances[accountId] -= Number(entry.amount)
      }
    }

    // Organize accounts into balance sheet sections
    const currentAssets: AccountBalance[] = []
    const fixedAssets: AccountBalance[] = []
    const currentLiabilities: AccountBalance[] = []
    const longTermLiabilities: AccountBalance[] = []
    const ownerEquity: AccountBalance[] = []

    // Track revenue and expenses for current period net income
    let totalRevenue = 0
    let totalExpenses = 0

    for (const account of accounts || []) {
      let balance = accountBalances[account.id] || 0
      const accountType = account.account_type

      // For credit-normal accounts, flip the sign for display
      // (Balance sheet shows positive liabilities/equity as positive)
      if (CREDIT_NORMAL_TYPES.includes(accountType)) {
        balance = -balance
      }

      // Skip zero-balance accounts for cleaner report
      if (Math.abs(balance) < 0.005) continue

      const accountBalance: AccountBalance = {
        account_id: account.id,
        account_name: account.name,
        account_type: accountType,
        balance: Math.round(balance * 100) / 100
      }

      // Categorize account
      if (CURRENT_ASSET_TYPES.includes(accountType)) {
        currentAssets.push(accountBalance)
      } else if (FIXED_ASSET_TYPES.includes(accountType)) {
        // Accumulated depreciation is contra-asset (credit normal)
        if (accountType === 'accumulated_depreciation') {
          accountBalance.balance = -Math.abs(accountBalance.balance)
        }
        fixedAssets.push(accountBalance)
      } else if (CURRENT_LIABILITY_TYPES.includes(accountType)) {
        currentLiabilities.push(accountBalance)
      } else if (LONG_TERM_LIABILITY_TYPES.includes(accountType)) {
        longTermLiabilities.push(accountBalance)
      } else if (EQUITY_TYPES.includes(accountType)) {
        ownerEquity.push(accountBalance)
      } else if (accountType === 'revenue' || accountType === 'platform_revenue') {
        totalRevenue += balance
      } else if (accountType === 'expense') {
        // Expenses are debit-normal, balance is already positive
        totalExpenses += Math.abs(accountBalances[account.id] || 0)
      }
    }

    // Calculate current period net income (Revenue - Expenses)
    const currentPeriodNetIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100

    // Calculate section totals
    const totalCurrentAssets = currentAssets.reduce((sum, a) => sum + a.balance, 0)
    const totalFixedAssets = fixedAssets.reduce((sum, a) => sum + a.balance, 0)
    const totalAssets = totalCurrentAssets + totalFixedAssets

    const totalCurrentLiabilities = currentLiabilities.reduce((sum, a) => sum + a.balance, 0)
    const totalLongTermLiabilities = longTermLiabilities.reduce((sum, a) => sum + a.balance, 0)
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities

    const totalOwnerEquity = ownerEquity.reduce((sum, a) => sum + a.balance, 0)
    
    // Retained earnings: we'd need historical data, for now assume it's tracked in retained_earnings account
    const retainedEarningsAccount = ownerEquity.find(a => a.account_type === 'retained_earnings')
    const retainedEarnings = retainedEarningsAccount?.balance || 0

    // Total equity = Owner contributions + Retained earnings + Current period income
    const totalEquity = totalOwnerEquity + currentPeriodNetIncome

    // Balance check
    const liabilitiesPlusEquity = totalLiabilities + totalEquity
    const difference = Math.round((totalAssets - liabilitiesPlusEquity) * 100) / 100
    const isBalanced = Math.abs(difference) < 0.01

    // Sort accounts by balance (largest first)
    const sortByBalance = (a: AccountBalance, b: AccountBalance) => b.balance - a.balance

    currentAssets.sort(sortByBalance)
    fixedAssets.sort(sortByBalance)
    currentLiabilities.sort(sortByBalance)
    longTermLiabilities.sort(sortByBalance)
    ownerEquity.sort(sortByBalance)

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'balance_sheet_report',
      entity_type: 'report',
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      request_body: { as_of_date: asOfDate },
      response_status: 200
    })

    const response: BalanceSheetResponse = {
      success: true,
      as_of_date: asOfDate,
      assets: {
        current_assets: {
          accounts: currentAssets,
          total: Math.round(totalCurrentAssets * 100) / 100
        },
        fixed_assets: {
          accounts: fixedAssets,
          total: Math.round(totalFixedAssets * 100) / 100
        },
        total_assets: Math.round(totalAssets * 100) / 100
      },
      liabilities: {
        current_liabilities: {
          accounts: currentLiabilities,
          total: Math.round(totalCurrentLiabilities * 100) / 100
        },
        long_term_liabilities: {
          accounts: longTermLiabilities,
          total: Math.round(totalLongTermLiabilities * 100) / 100
        },
        total_liabilities: Math.round(totalLiabilities * 100) / 100
      },
      equity: {
        owner_equity: {
          accounts: ownerEquity.filter(a => a.account_type !== 'retained_earnings'),
          total: Math.round((totalOwnerEquity - retainedEarnings) * 100) / 100
        },
        retained_earnings: Math.round(retainedEarnings * 100) / 100,
        current_period_net_income: currentPeriodNetIncome,
        total_equity: Math.round(totalEquity * 100) / 100
      },
      balance_check: {
        assets: Math.round(totalAssets * 100) / 100,
        liabilities_plus_equity: Math.round(liabilitiesPlusEquity * 100) / 100,
        is_balanced: isBalanced,
        difference: difference
      }
    }

    return jsonResponse(response, 200, req, requestId)
  }
)

Deno.serve(handler)
