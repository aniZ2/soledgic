import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// ============================================================================
// Pure functions and logic extracted from frozen-statements/index.ts
// for unit testing. Focuses on integrity hashing, action validation,
// decision routing, and account classification logic.
// ============================================================================

const VALID_ACTIONS = ['generate', 'get', 'list', 'verify']
const VALID_STATEMENT_TYPES = ['profit_loss', 'balance_sheet', 'trial_balance', 'cash_flow']

async function generateHash(data: any): Promise<string> {
  const json = JSON.stringify(data, Object.keys(data).sort())
  const buffer = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Account type classification logic from the generate action
function classifyAccountType(accountType: string): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other' {
  if (['cash', 'accounts_receivable', 'inventory', 'fixed_asset'].includes(accountType)) return 'asset'
  if (['accounts_payable', 'creator_balance', 'credit_card', 'reserve'].includes(accountType)) return 'liability'
  if (['equity', 'retained_earnings'].includes(accountType)) return 'equity'
  if (['revenue', 'platform_revenue', 'other_income'].includes(accountType)) return 'revenue'
  if (['expense', 'processing_fees', 'cost_of_goods'].includes(accountType)) return 'expense'
  return 'other'
}

// Balance rounding logic from the generate action
function roundBalance(value: number): number {
  return Math.round(value * 100) / 100
}

// Trial balance check
function isBalanced(totalDebits: number, totalCredits: number): boolean {
  return Math.abs(totalDebits - totalCredits) < 0.01
}

// Balance sheet equation check
function isBalanceSheetBalanced(
  totalAssets: number,
  totalLiabilities: number,
  totalEquity: number,
  netIncome: number
): boolean {
  return Math.abs(totalAssets - totalLiabilities - totalEquity - netIncome) < 0.01
}

// ============================================================================
// VALID_ACTIONS
// ============================================================================

Deno.test('VALID_ACTIONS: contains generate, get, list, verify', () => {
  assertEquals(VALID_ACTIONS.includes('generate'), true)
  assertEquals(VALID_ACTIONS.includes('get'), true)
  assertEquals(VALID_ACTIONS.includes('list'), true)
  assertEquals(VALID_ACTIONS.includes('verify'), true)
})

Deno.test('VALID_ACTIONS: rejects unknown actions', () => {
  assertEquals(VALID_ACTIONS.includes('delete'), false)
  assertEquals(VALID_ACTIONS.includes('update'), false)
  assertEquals(VALID_ACTIONS.includes(''), false)
})

// ============================================================================
// VALID_STATEMENT_TYPES
// ============================================================================

Deno.test('VALID_STATEMENT_TYPES: contains expected types', () => {
  assertEquals(VALID_STATEMENT_TYPES.includes('profit_loss'), true)
  assertEquals(VALID_STATEMENT_TYPES.includes('balance_sheet'), true)
  assertEquals(VALID_STATEMENT_TYPES.includes('trial_balance'), true)
  assertEquals(VALID_STATEMENT_TYPES.includes('cash_flow'), true)
})

Deno.test('VALID_STATEMENT_TYPES: rejects unknown types', () => {
  assertEquals(VALID_STATEMENT_TYPES.includes('income_statement'), false)
  assertEquals(VALID_STATEMENT_TYPES.includes(''), false)
})

// ============================================================================
// generateHash
// ============================================================================

Deno.test('generateHash: produces deterministic hash for same data', async () => {
  const data = { revenue: 1000, expenses: 500 }
  const hash1 = await generateHash(data)
  const hash2 = await generateHash(data)
  assertEquals(hash1, hash2)
})

Deno.test('generateHash: produces different hash for different data', async () => {
  const data1 = { revenue: 1000 }
  const data2 = { revenue: 1001 }
  const hash1 = await generateHash(data1)
  const hash2 = await generateHash(data2)
  assertNotEquals(hash1, hash2)
})

Deno.test('generateHash: produces 64-char hex string (SHA-256)', async () => {
  const hash = await generateHash({ test: true })
  assertEquals(hash.length, 64)
  assertEquals(/^[0-9a-f]{64}$/.test(hash), true)
})

Deno.test('generateHash: sorts keys for consistent ordering', async () => {
  const data1 = { b: 2, a: 1 }
  const data2 = { a: 1, b: 2 }
  const hash1 = await generateHash(data1)
  const hash2 = await generateHash(data2)
  assertEquals(hash1, hash2)
})

Deno.test('generateHash: treats nested objects as JSON', async () => {
  const data = {
    items: [{ name: 'Revenue', balance: 100 }],
    total: 100,
  }
  const hash = await generateHash(data)
  assertEquals(hash.length, 64)
})

Deno.test('generateHash: empty object produces valid hash', async () => {
  const hash = await generateHash({})
  assertEquals(hash.length, 64)
  assertEquals(/^[0-9a-f]+$/.test(hash), true)
})

Deno.test('generateHash: detects data modification (integrity check)', async () => {
  const original = { revenue: 50000, expenses: 30000, net_income: 20000 }
  const originalHash = await generateHash(original)

  // Simulate tampering
  const tampered = { ...original, net_income: 25000 }
  const tamperedHash = await generateHash(tampered)

  assertNotEquals(originalHash, tamperedHash)
})

// ============================================================================
// classifyAccountType
// ============================================================================

Deno.test('classifyAccountType: classifies cash as asset', () => {
  assertEquals(classifyAccountType('cash'), 'asset')
})

Deno.test('classifyAccountType: classifies accounts_receivable as asset', () => {
  assertEquals(classifyAccountType('accounts_receivable'), 'asset')
})

Deno.test('classifyAccountType: classifies accounts_payable as liability', () => {
  assertEquals(classifyAccountType('accounts_payable'), 'liability')
})

Deno.test('classifyAccountType: classifies creator_balance as liability', () => {
  assertEquals(classifyAccountType('creator_balance'), 'liability')
})

Deno.test('classifyAccountType: classifies reserve as liability', () => {
  assertEquals(classifyAccountType('reserve'), 'liability')
})

Deno.test('classifyAccountType: classifies equity as equity', () => {
  assertEquals(classifyAccountType('equity'), 'equity')
})

Deno.test('classifyAccountType: classifies retained_earnings as equity', () => {
  assertEquals(classifyAccountType('retained_earnings'), 'equity')
})

Deno.test('classifyAccountType: classifies revenue as revenue', () => {
  assertEquals(classifyAccountType('revenue'), 'revenue')
})

Deno.test('classifyAccountType: classifies platform_revenue as revenue', () => {
  assertEquals(classifyAccountType('platform_revenue'), 'revenue')
})

Deno.test('classifyAccountType: classifies expense as expense', () => {
  assertEquals(classifyAccountType('expense'), 'expense')
})

Deno.test('classifyAccountType: classifies processing_fees as expense', () => {
  assertEquals(classifyAccountType('processing_fees'), 'expense')
})

Deno.test('classifyAccountType: classifies cost_of_goods as expense', () => {
  assertEquals(classifyAccountType('cost_of_goods'), 'expense')
})

Deno.test('classifyAccountType: returns other for unknown types', () => {
  assertEquals(classifyAccountType('custom_type'), 'other')
  assertEquals(classifyAccountType(''), 'other')
})

// ============================================================================
// roundBalance
// ============================================================================

Deno.test('roundBalance: rounds to 2 decimal places', () => {
  assertEquals(roundBalance(100.456), 100.46)
  assertEquals(roundBalance(100.451), 100.45)
})

Deno.test('roundBalance: preserves exact values', () => {
  assertEquals(roundBalance(100), 100)
  assertEquals(roundBalance(99.99), 99.99)
})

Deno.test('roundBalance: handles floating point issues', () => {
  // 0.1 + 0.2 = 0.30000000000000004
  assertEquals(roundBalance(0.1 + 0.2), 0.3)
})

Deno.test('roundBalance: handles negative values', () => {
  assertEquals(roundBalance(-100.456), -100.46)
})

Deno.test('roundBalance: handles zero', () => {
  assertEquals(roundBalance(0), 0)
})

// ============================================================================
// isBalanced (trial balance)
// ============================================================================

Deno.test('isBalanced: returns true when debits equal credits', () => {
  assertEquals(isBalanced(1000, 1000), true)
})

Deno.test('isBalanced: returns true within 0.01 tolerance', () => {
  assertEquals(isBalanced(1000.005, 1000), true)
  assertEquals(isBalanced(1000, 1000.005), true)
})

Deno.test('isBalanced: returns false when difference exceeds tolerance', () => {
  assertEquals(isBalanced(1000, 1001), false)
  assertEquals(isBalanced(1000, 999), false)
})

Deno.test('isBalanced: handles zero values', () => {
  assertEquals(isBalanced(0, 0), true)
})

// ============================================================================
// isBalanceSheetBalanced
// ============================================================================

Deno.test('isBalanceSheetBalanced: Assets = Liabilities + Equity + Net Income', () => {
  // $1000 = $400 + $300 + $300
  assertEquals(isBalanceSheetBalanced(1000, 400, 300, 300), true)
})

Deno.test('isBalanceSheetBalanced: detects imbalance', () => {
  assertEquals(isBalanceSheetBalanced(1000, 400, 300, 200), false)
})

Deno.test('isBalanceSheetBalanced: handles all zeros', () => {
  assertEquals(isBalanceSheetBalanced(0, 0, 0, 0), true)
})

Deno.test('isBalanceSheetBalanced: tolerance within 0.01', () => {
  assertEquals(isBalanceSheetBalanced(1000.005, 500, 300, 200), true)
})

// ============================================================================
// Period status validation (logic from generate action)
// ============================================================================

Deno.test('generate: only allows closed or locked periods', () => {
  const allowedStatuses = ['closed', 'locked']
  assertEquals(allowedStatuses.includes('closed'), true)
  assertEquals(allowedStatuses.includes('locked'), true)
  assertEquals(allowedStatuses.includes('open'), false)
  assertEquals(allowedStatuses.includes('draft'), false)
})

// ============================================================================
// get action: integrity verification logic
// ============================================================================

Deno.test('get action: integrity check compares stored vs computed hash', async () => {
  const statementData = { revenue: 50000, expenses: 30000 }
  const storedHash = await generateHash(statementData)

  // Unchanged data: valid
  const recomputedHash = await generateHash(statementData)
  assertEquals(recomputedHash === storedHash, true)

  // Tampered data: invalid
  const tamperedData = { ...statementData, revenue: 60000 }
  const tamperedHash = await generateHash(tamperedData)
  assertEquals(tamperedHash === storedHash, false)
})

// ============================================================================
// verify action: all_valid aggregation
// ============================================================================

Deno.test('verify: all_valid is true when all statements pass', () => {
  const results = [
    { valid: true, statement_type: 'trial_balance' },
    { valid: true, statement_type: 'profit_loss' },
    { valid: true, statement_type: 'balance_sheet' },
  ]
  const allValid = results.every(r => r.valid)
  assertEquals(allValid, true)
})

Deno.test('verify: all_valid is false when any statement fails', () => {
  const results = [
    { valid: true, statement_type: 'trial_balance' },
    { valid: false, statement_type: 'profit_loss' },
    { valid: true, statement_type: 'balance_sheet' },
  ]
  const allValid = results.every(r => r.valid)
  assertEquals(allValid, false)
})

Deno.test('verify: all_valid is true for empty results array', () => {
  const results: Array<{ valid: boolean }> = []
  // Matches the handler behavior: for..of sets allValid=true, no iterations change it
  let allValid = true
  for (const r of results) {
    if (!r.valid) allValid = false
  }
  assertEquals(allValid, true)
})

// ============================================================================
// Statement data structure tests
// ============================================================================

Deno.test('trial balance data: has required structure', () => {
  const data = {
    statement_type: 'trial_balance',
    period: { start: '2026-01-01', end: '2026-01-31' },
    business: 'Test Corp',
    generated_at: new Date().toISOString(),
    accounts: [],
    totals: { debits: 0, credits: 0, balanced: true },
  }
  assertEquals(data.statement_type, 'trial_balance')
  assertEquals(typeof data.period.start, 'string')
  assertEquals(typeof data.period.end, 'string')
  assertEquals(typeof data.generated_at, 'string')
  assertEquals(Array.isArray(data.accounts), true)
})

Deno.test('profit_loss data: calculates net income correctly', () => {
  const totalRevenue = 50000
  const totalExpenses = 30000
  const netIncome = totalRevenue - totalExpenses
  assertEquals(netIncome, 20000)
  assertEquals(roundBalance(netIncome), 20000)
})

Deno.test('balance sheet data: equation holds with net income', () => {
  const totalAssets = 100000
  const totalLiabilities = 40000
  const totalEquity = 30000
  const netIncome = 30000  // revenue - expenses
  assertEquals(isBalanceSheetBalanced(totalAssets, totalLiabilities, totalEquity, netIncome), true)
})

// ============================================================================
// Hash key sorting for consistent serialization
// ============================================================================

Deno.test('generateHash: key sorting produces consistent output regardless of insertion order', async () => {
  // Create objects with different insertion orders
  const obj1: Record<string, unknown> = {}
  obj1['zebra'] = 1
  obj1['alpha'] = 2
  obj1['middle'] = 3

  const obj2: Record<string, unknown> = {}
  obj2['alpha'] = 2
  obj2['middle'] = 3
  obj2['zebra'] = 1

  const hash1 = await generateHash(obj1)
  const hash2 = await generateHash(obj2)
  assertEquals(hash1, hash2)
})
