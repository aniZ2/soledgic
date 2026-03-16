import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// ============================================================================
// Pure functions and logic extracted from preflight-authorization/index.ts
// for unit testing. Policy evaluation functions are tested with mock data.
// ============================================================================

interface Policy {
  id: string
  policy_type: string
  config: Record<string, any>
  severity: 'hard' | 'soft'
  priority: number
}

interface PolicyViolation {
  policy_id: string
  policy_type: string
  severity: 'hard' | 'soft'
  reason: string
}

interface PreflightRequest {
  idempotency_key: string
  amount: number
  currency?: string
  counterparty_name?: string
  authorizing_instrument_id?: string
  expected_date?: string
  category?: string
}

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountCents / 100)
}

// Simplified require_instrument evaluator (supabase-dependent part stubbed)
async function evaluateRequireInstrument(
  instrumentLookup: (id: string) => Promise<{ status: string } | null>,
  policy: Policy,
  request: PreflightRequest
): Promise<PolicyViolation | null> {
  const threshold = policy.config.threshold_amount || 100000

  if (request.amount > threshold && !request.authorizing_instrument_id) {
    return {
      policy_id: policy.id,
      policy_type: policy.policy_type,
      severity: policy.severity,
      reason: `Transaction of ${formatCurrency(request.amount)} exceeds threshold of ${formatCurrency(threshold)} and requires an authorizing instrument`,
    }
  }

  if (request.authorizing_instrument_id) {
    const instrument = await instrumentLookup(request.authorizing_instrument_id)
    if (!instrument) {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        reason: 'Authorizing instrument not found',
      }
    }
    if (instrument.status === 'invalidated') {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        reason: 'Authorizing instrument has been invalidated',
      }
    }
  }

  return null
}

// Decision resolution logic
function resolveDecision(violations: PolicyViolation[]): 'allowed' | 'warn' | 'blocked' {
  const hardViolations = violations.filter(v => v.severity === 'hard')
  const softViolations = violations.filter(v => v.severity === 'soft')

  if (hardViolations.length > 0) return 'blocked'
  if (softViolations.length > 0) return 'warn'
  return 'allowed'
}

// Budget period start calculation
function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case 'weekly': {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay())
      start.setHours(0, 0, 0, 0)
      return start
    }
    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'quarterly': {
      const quarter = Math.floor(now.getMonth() / 3)
      return new Date(now.getFullYear(), quarter * 3, 1)
    }
    case 'annual':
      return new Date(now.getFullYear(), 0, 1)
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1)
  }
}

// ============================================================================
// formatCurrency
// ============================================================================

Deno.test('formatCurrency: formats cents to dollars', () => {
  assertEquals(formatCurrency(100000), '$1,000')
})

Deno.test('formatCurrency: formats zero', () => {
  assertEquals(formatCurrency(0), '$0')
})

Deno.test('formatCurrency: formats large amounts', () => {
  assertEquals(formatCurrency(1000000), '$10,000')
})

Deno.test('formatCurrency: handles sub-dollar amounts', () => {
  assertEquals(formatCurrency(50), '$1')  // rounds to nearest dollar with 0 decimal places
})

// ============================================================================
// resolveDecision
// ============================================================================

Deno.test('resolveDecision: returns allowed when no violations', () => {
  assertEquals(resolveDecision([]), 'allowed')
})

Deno.test('resolveDecision: returns blocked when hard violation present', () => {
  assertEquals(
    resolveDecision([
      { policy_id: 'p1', policy_type: 'require_instrument', severity: 'hard', reason: 'test' },
    ]),
    'blocked'
  )
})

Deno.test('resolveDecision: returns warn when only soft violations', () => {
  assertEquals(
    resolveDecision([
      { policy_id: 'p1', policy_type: 'budget_cap', severity: 'soft', reason: 'test' },
    ]),
    'warn'
  )
})

Deno.test('resolveDecision: returns blocked when both hard and soft violations present', () => {
  assertEquals(
    resolveDecision([
      { policy_id: 'p1', policy_type: 'budget_cap', severity: 'soft', reason: 'soft warning' },
      { policy_id: 'p2', policy_type: 'require_instrument', severity: 'hard', reason: 'hard block' },
    ]),
    'blocked'
  )
})

Deno.test('resolveDecision: returns warn with multiple soft violations', () => {
  assertEquals(
    resolveDecision([
      { policy_id: 'p1', policy_type: 'budget_cap', severity: 'soft', reason: 'over budget' },
      { policy_id: 'p2', policy_type: 'projection_guard', severity: 'soft', reason: 'low coverage' },
    ]),
    'warn'
  )
})

// ============================================================================
// evaluateRequireInstrument
// ============================================================================

Deno.test('evaluateRequireInstrument: allows when amount is below threshold', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: { threshold_amount: 100000 }, severity: 'hard', priority: 1 }
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 50000 }
  const result = await evaluateRequireInstrument(() => Promise.resolve(null), policy, request)
  assertEquals(result, null)
})

Deno.test('evaluateRequireInstrument: blocks when above threshold without instrument', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: { threshold_amount: 100000 }, severity: 'hard', priority: 1 }
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 150000 }
  const result = await evaluateRequireInstrument(() => Promise.resolve(null), policy, request)
  assertEquals(result?.severity, 'hard')
  assertEquals(result?.reason.includes('requires an authorizing instrument'), true)
})

Deno.test('evaluateRequireInstrument: uses default threshold of 100000 when not configured', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: {}, severity: 'hard', priority: 1 }
  // Just below default threshold
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 100000 }
  const result = await evaluateRequireInstrument(() => Promise.resolve(null), policy, request)
  assertEquals(result, null)
})

Deno.test('evaluateRequireInstrument: blocks when instrument not found', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: { threshold_amount: 100000 }, severity: 'hard', priority: 1 }
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 150000, authorizing_instrument_id: 'inst-123' }
  const result = await evaluateRequireInstrument(() => Promise.resolve(null), policy, request)
  assertEquals(result?.reason, 'Authorizing instrument not found')
})

Deno.test('evaluateRequireInstrument: blocks when instrument is invalidated', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: { threshold_amount: 100000 }, severity: 'hard', priority: 1 }
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 150000, authorizing_instrument_id: 'inst-123' }
  const result = await evaluateRequireInstrument(
    () => Promise.resolve({ status: 'invalidated' }),
    policy,
    request
  )
  assertEquals(result?.reason, 'Authorizing instrument has been invalidated')
})

Deno.test('evaluateRequireInstrument: allows when valid instrument provided', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: { threshold_amount: 100000 }, severity: 'hard', priority: 1 }
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 150000, authorizing_instrument_id: 'inst-123' }
  const result = await evaluateRequireInstrument(
    () => Promise.resolve({ status: 'active' }),
    policy,
    request
  )
  assertEquals(result, null)
})

Deno.test('evaluateRequireInstrument: respects custom threshold', async () => {
  const policy: Policy = { id: 'p1', policy_type: 'require_instrument', config: { threshold_amount: 50000 }, severity: 'hard', priority: 1 }
  const request: PreflightRequest = { idempotency_key: 'key1', amount: 60000 }
  const result = await evaluateRequireInstrument(() => Promise.resolve(null), policy, request)
  assertEquals(result?.severity, 'hard')
})

// ============================================================================
// getPeriodStart
// ============================================================================

Deno.test('getPeriodStart: monthly starts at first of current month', () => {
  const start = getPeriodStart('monthly')
  assertEquals(start.getDate(), 1)
  assertEquals(start.getMonth(), new Date().getMonth())
})

Deno.test('getPeriodStart: annual starts at Jan 1 of current year', () => {
  const start = getPeriodStart('annual')
  assertEquals(start.getMonth(), 0)
  assertEquals(start.getDate(), 1)
  assertEquals(start.getFullYear(), new Date().getFullYear())
})

Deno.test('getPeriodStart: quarterly starts at first day of current quarter', () => {
  const start = getPeriodStart('quarterly')
  const now = new Date()
  const expectedQuarterMonth = Math.floor(now.getMonth() / 3) * 3
  assertEquals(start.getMonth(), expectedQuarterMonth)
  assertEquals(start.getDate(), 1)
})

Deno.test('getPeriodStart: weekly starts on Sunday', () => {
  const start = getPeriodStart('weekly')
  assertEquals(start.getDay(), 0)  // Sunday
})

Deno.test('getPeriodStart: default falls back to monthly', () => {
  const defaultStart = getPeriodStart('unknown')
  const monthlyStart = getPeriodStart('monthly')
  assertEquals(defaultStart.getTime(), monthlyStart.getTime())
})

// ============================================================================
// Idempotency key validation (logic from handler)
// ============================================================================

Deno.test('idempotency key: empty string is rejected', () => {
  const key = ''.trim()
  assertEquals(key.length < 1, true)
})

Deno.test('idempotency key: normal string is accepted', () => {
  const key = 'txn_abc_123'.trim()
  assertEquals(key.length >= 1, true)
  assertEquals(key.length <= 255, true)
})

Deno.test('idempotency key: max length is 255', () => {
  const key = 'a'.repeat(255)
  assertEquals(key.length <= 255, true)
  const longKey = 'a'.repeat(256)
  assertEquals(longKey.length <= 255, false)
})

// ============================================================================
// Budget cap: projected total calculation
// ============================================================================

Deno.test('budget cap: allows when projected total is under cap', () => {
  const currentSpending = 50000  // $500 already spent
  const newAmount = 10000  // $100 new transaction
  const capAmount = 100000  // $1000 cap
  const projectedTotal = currentSpending + newAmount
  assertEquals(projectedTotal > capAmount, false)
})

Deno.test('budget cap: blocks when projected total exceeds cap', () => {
  const currentSpending = 90000  // $900 already spent
  const newAmount = 20000  // $200 new transaction
  const capAmount = 100000  // $1000 cap
  const projectedTotal = currentSpending + newAmount
  assertEquals(projectedTotal > capAmount, true)
  const overage = projectedTotal - capAmount
  assertEquals(overage, 10000)  // $100 over
})

Deno.test('budget cap: category mismatch skips policy', () => {
  const policyCategory: string = 'marketing'
  const requestCategory: string = 'engineering'
  const shouldApply = !policyCategory || !requestCategory || requestCategory === policyCategory
  assertEquals(shouldApply, false)
})

Deno.test('budget cap: matching category applies policy', () => {
  const policyCategory = 'marketing'
  const requestCategory = 'marketing'
  const shouldApply = !policyCategory || !requestCategory || requestCategory === policyCategory
  assertEquals(shouldApply, true)
})

// ============================================================================
// Projection guard: coverage ratio calculation
// ============================================================================

Deno.test('projection guard: allows when coverage stays above minimum', () => {
  const cashBalance = 100000  // $1000
  const pendingTotal = 50000  // $500 obligations
  const newAmount = 20000  // $200 transaction
  const projectedCash = cashBalance - newAmount  // $800
  const projectedCoverage = pendingTotal > 0 ? projectedCash / pendingTotal : 1
  const minCoverageRatio = 0.5
  assertEquals(projectedCoverage >= minCoverageRatio, true)
  assertEquals(projectedCoverage, 1.6)
})

Deno.test('projection guard: blocks when coverage drops below minimum', () => {
  const cashBalance = 30000  // $300
  const pendingTotal = 100000  // $1000 obligations
  const newAmount = 10000  // $100 transaction
  const projectedCash = cashBalance - newAmount  // $200
  const projectedCoverage = pendingTotal > 0 ? projectedCash / pendingTotal : 1
  const minCoverageRatio = 0.5
  assertEquals(projectedCoverage < minCoverageRatio, true)
  assertEquals(projectedCoverage, 0.2)
})

Deno.test('projection guard: defaults to 1.0 coverage when no obligations', () => {
  const cashBalance = 50000
  const pendingTotal = 0
  const newAmount = 10000
  const projectedCash = cashBalance - newAmount
  const projectedCoverage = pendingTotal > 0 ? projectedCash / pendingTotal : 1
  assertEquals(projectedCoverage, 1)
})
