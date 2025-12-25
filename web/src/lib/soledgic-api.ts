// Soledge API client for calling Edge Functions

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface ApiOptions {
  apiKey: string
  idempotencyKey?: string
}

async function callFunction<T>(
  functionName: string,
  options: ApiOptions,
  body?: Record<string, any>,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${functionName}`)
  
  if (method === 'GET' && body) {
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    })
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'x-api-key': options.apiKey,
    'Content-Type': 'application/json',
  }

  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`)
  }

  return data
}

// ============================================================================
// LEDGER OPERATIONS
// ============================================================================

export async function createLedger(apiKey: string, data: {
  platform_name: string
  owner_email: string
  settings?: {
    default_platform_fee_percent?: number
    tax_withholding_percent?: number
    min_payout_amount?: number
    payout_schedule?: string
  }
}) {
  return callFunction('create-ledger', { apiKey }, data)
}

export async function listLedgers(apiKey: string) {
  return callFunction('list-ledgers', { apiKey }, undefined, 'GET')
}

// ============================================================================
// TRANSACTIONS
// ============================================================================

export async function recordSale(apiKey: string, data: {
  amount: number
  creator_id?: string
  reference_id: string
  description?: string
  metadata?: Record<string, any>
}, idempotencyKey?: string) {
  return callFunction('record-sale', { apiKey, idempotencyKey }, data)
}

export async function recordExpense(apiKey: string, data: {
  amount: number
  category_code: string
  merchant_name: string
  business_purpose: string
  expense_date?: string
  reference_id: string
  receipt_id?: string
  metadata?: Record<string, any>
}, idempotencyKey?: string) {
  return callFunction('record-expense', { apiKey, idempotencyKey }, data)
}

export async function recordRefund(apiKey: string, data: {
  original_transaction_id: string
  amount: number
  reason: string
  reference_id: string
}, idempotencyKey?: string) {
  return callFunction('record-refund', { apiKey, idempotencyKey }, data)
}

export async function recordAdjustment(apiKey: string, data: {
  transaction_id?: string
  adjustment_type: 'correction' | 'write_off' | 'reclassification'
  entries: Array<{
    account_id: string
    debit?: number
    credit?: number
  }>
  reason: string
  reference_id: string
}, idempotencyKey?: string) {
  return callFunction('record-adjustment', { apiKey, idempotencyKey }, data)
}

export async function recordTransfer(apiKey: string, data: {
  from_account_id: string
  to_account_id: string
  amount: number
  description: string
  reference_id: string
}, idempotencyKey?: string) {
  return callFunction('record-transfer', { apiKey, idempotencyKey }, data)
}

export async function reverseTransaction(apiKey: string, data: {
  transaction_id: string
  reason: string
  reference_id: string
}, idempotencyKey?: string) {
  return callFunction('reverse-transaction', { apiKey, idempotencyKey }, data)
}

export async function getTransactions(apiKey: string, params?: {
  type?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}) {
  return callFunction('get-transactions', { apiKey }, params, 'GET')
}

// ============================================================================
// PAYOUTS
// ============================================================================

export async function processPayout(apiKey: string, data: {
  creator_id: string
  amount?: number
  method: 'bank_transfer' | 'check' | 'paypal' | 'other'
  reference_id: string
  notes?: string
}, idempotencyKey?: string) {
  return callFunction('process-payout', { apiKey, idempotencyKey }, data)
}

// ============================================================================
// REPORTS
// ============================================================================

export async function getTrialBalance(apiKey: string, params?: {
  as_of_date?: string
}) {
  return callFunction('trial-balance', { apiKey }, params, 'GET')
}

export async function getProfitLoss(apiKey: string, params: {
  year: number
  breakdown?: 'monthly' | 'quarterly' | 'annual'
}) {
  return callFunction('profit-loss', { apiKey }, params, 'GET')
}

export async function getBalance(apiKey: string, params?: {
  account_id?: string
  entity_id?: string
}) {
  return callFunction('get-balance', { apiKey }, params, 'GET')
}

export async function getRunway(apiKey: string) {
  return callFunction('get-runway', { apiKey }, undefined, 'GET')
}

export async function exportReport(apiKey: string, data: {
  report_type: 'profit_loss' | 'trial_balance' | 'transactions' | 'expenses' | '1099_summary'
  format: 'csv' | 'json' | 'pdf'
  year?: number
  start_date?: string
  end_date?: string
}) {
  return callFunction('export-report', { apiKey }, data)
}

// ============================================================================
// ACCOUNTING PERIODS
// ============================================================================

export async function closePeriod(apiKey: string, data: {
  period_end: string
  notes?: string
}) {
  return callFunction('close-period', { apiKey }, data)
}

// ============================================================================
// BANK & RECONCILIATION
// ============================================================================

export async function manageBankAccounts(apiKey: string, data: {
  action: 'create' | 'update' | 'list' | 'delete'
  bank_account_id?: string
  bank_name?: string
  account_name?: string
  account_type?: string
  account_last_four?: string
  routing_number?: string
}) {
  return callFunction('manage-bank-accounts', { apiKey }, data)
}

export async function importBankStatement(apiKey: string, data: {
  bank_account_id: string
  statement_month: string
  lines: Array<{
    date: string
    description: string
    amount: number
    type: 'debit' | 'credit'
    reference?: string
  }>
}) {
  return callFunction('import-bank-statement', { apiKey }, data)
}

export async function reconcile(apiKey: string, data: {
  action: 'start' | 'match' | 'unmatch' | 'complete' | 'status'
  bank_account_id?: string
  period_start?: string
  period_end?: string
  session_id?: string
  bank_line_id?: string
  transaction_id?: string
  ending_balance?: number
}) {
  return callFunction('reconcile', { apiKey }, data)
}

// ============================================================================
// OPENING BALANCES
// ============================================================================

export async function recordOpeningBalance(apiKey: string, data: {
  as_of_date: string
  balances: Array<{
    account_type: string
    entity_id?: string
    balance: number
  }>
  notes?: string
}) {
  return callFunction('record-opening-balance', { apiKey }, data)
}

// ============================================================================
// CONTRACTORS
// ============================================================================

export async function manageContractors(apiKey: string, data: {
  action: 'create' | 'update' | 'list' | 'get' | 'deactivate'
  contractor_id?: string
  name?: string
  email?: string
  business_name?: string
  tax_id_last_four?: string
  address?: Record<string, string>
  w9_received?: boolean
  payment_method?: string
  notes?: string
}) {
  return callFunction('manage-contractors', { apiKey }, data)
}

// ============================================================================
// BUDGETS
// ============================================================================

export async function manageBudgets(apiKey: string, data: {
  action: 'create' | 'update' | 'list' | 'get' | 'delete' | 'status'
  budget_id?: string
  name?: string
  category_code?: string
  amount?: number
  period_type?: 'monthly' | 'quarterly' | 'annual'
  start_date?: string
  end_date?: string
  rollover?: boolean
}) {
  return callFunction('manage-budgets', { apiKey }, data)
}

// ============================================================================
// RECURRING EXPENSES
// ============================================================================

export async function manageRecurring(apiKey: string, data: {
  action: 'create' | 'update' | 'list' | 'delete' | 'pause' | 'resume'
  template_id?: string
  name?: string
  amount?: number
  category_code?: string
  merchant_name?: string
  frequency?: 'weekly' | 'monthly' | 'quarterly' | 'annual'
  next_date?: string
  auto_record?: boolean
}) {
  return callFunction('manage-recurring', { apiKey }, data)
}

// ============================================================================
// RECEIPTS
// ============================================================================

export async function uploadReceipt(apiKey: string, data: {
  file_name: string
  file_type: string
  file_data: string // base64
  expense_id?: string
  metadata?: Record<string, any>
}) {
  return callFunction('upload-receipt', { apiKey }, data)
}
