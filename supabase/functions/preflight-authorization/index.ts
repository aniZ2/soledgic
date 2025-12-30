// Soledgic Edge Function: Preflight Authorization
// POST /preflight-authorization
//
// Ledger-native policy engine that evaluates whether a proposed transaction
// is permitted BEFORE execution.
//
// This system:
// - Decides whether a transaction SHOULD be allowed
// - Proves authorization BEFORE execution
// - Blocks or warns BEFORE risk materializes
//
// This system does NOT:
// - Move money
// - Reserve balances
// - Lock accounts
// - Execute transfers

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateUUID,
  validateString,
  validateInteger,
  validateDate,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PreflightRequest {
  idempotency_key: string
  amount: number  // In cents
  currency?: string
  counterparty_name?: string
  authorizing_instrument_id?: string
  expected_date?: string
  category?: string
}

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

interface AuthorizationDecision {
  id: string
  decision: 'allowed' | 'warn' | 'blocked'
  violated_policies: PolicyViolation[]
  expires_at: string
  created_at: string
}

// ============================================================================
// POLICY EVALUATORS
// ============================================================================

// Policy: require_instrument
// Blocks transactions above threshold without an authorizing instrument
async function evaluateRequireInstrument(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: Policy,
  request: PreflightRequest
): Promise<PolicyViolation | null> {
  const threshold = policy.config.threshold_amount || 100000  // Default $1000

  if (request.amount > threshold && !request.authorizing_instrument_id) {
    return {
      policy_id: policy.id,
      policy_type: policy.policy_type,
      severity: policy.severity,
      reason: `Transaction of ${formatCurrency(request.amount)} exceeds threshold of ${formatCurrency(threshold)} and requires an authorizing instrument`
    }
  }

  // If instrument provided, verify it exists and is valid
  if (request.authorizing_instrument_id) {
    const { data: instrument, error } = await supabase
      .from('authorizing_instruments')
      .select('id, status')
      .eq('id', request.authorizing_instrument_id)
      .eq('ledger_id', ledgerId)
      .single()

    if (error || !instrument) {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        reason: 'Authorizing instrument not found'
      }
    }

    if (instrument.status === 'invalidated') {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        reason: 'Authorizing instrument has been invalidated'
      }
    }
  }

  return null
}

// Policy: budget_cap
// Warns or blocks when spending exceeds budget caps
async function evaluateBudgetCap(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: Policy,
  request: PreflightRequest
): Promise<PolicyViolation | null> {
  const capAmount = policy.config.cap_amount
  const period = policy.config.period || 'monthly'
  const category = policy.config.category  // Optional category filter

  if (!capAmount) return null

  // If category is specified, only apply to matching transactions
  if (category && request.category && request.category !== category) {
    return null
  }

  // Calculate period start date
  const now = new Date()
  let periodStart: Date

  switch (period) {
    case 'weekly':
      periodStart = new Date(now)
      periodStart.setDate(now.getDate() - now.getDay())
      periodStart.setHours(0, 0, 0, 0)
      break
    case 'monthly':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarterly':
      const quarter = Math.floor(now.getMonth() / 3)
      periodStart = new Date(now.getFullYear(), quarter * 3, 1)
      break
    case 'annual':
      periodStart = new Date(now.getFullYear(), 0, 1)
      break
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  // Query existing spending in period
  let query = supabase
    .from('transactions')
    .select('id, entries!inner(amount, account:accounts!inner(account_type))')
    .eq('ledger_id', ledgerId)
    .gte('transaction_date', periodStart.toISOString().split('T')[0])

  const { data: transactions, error } = await query

  if (error) {
    console.error('Failed to query budget spending:', error)
    return null  // Don't block on query failure
  }

  // Sum expense amounts (debits to expense accounts)
  let currentSpending = 0
  for (const tx of transactions || []) {
    for (const entry of tx.entries || []) {
      if (entry.account?.account_type === 'expense' && entry.amount > 0) {
        currentSpending += Number(entry.amount) * 100  // Convert to cents
      }
    }
  }

  const projectedTotal = currentSpending + request.amount

  if (projectedTotal > capAmount) {
    const overage = projectedTotal - capAmount
    return {
      policy_id: policy.id,
      policy_type: policy.policy_type,
      severity: policy.severity,
      reason: `${period.charAt(0).toUpperCase() + period.slice(1)} budget cap of ${formatCurrency(capAmount)} would be exceeded by ${formatCurrency(overage)}${category ? ` for category "${category}"` : ''}`
    }
  }

  return null
}

// Policy: projection_guard
// Blocks if transaction would cause breach risk
async function evaluateProjectionGuard(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: Policy,
  request: PreflightRequest
): Promise<PolicyViolation | null> {
  const minCoverageRatio = policy.config.min_coverage_ratio || 0.5

  // Get current cash balance
  const { data: cashAccount, error: cashError } = await supabase
    .from('accounts')
    .select('balance')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'cash')
    .single()

  if (cashError) {
    console.error('Failed to query cash balance:', cashError)
    return null  // Don't block on query failure
  }

  const cashBalance = Number(cashAccount?.balance || 0) * 100  // Convert to cents

  // Get total pending obligations from shadow ledger
  const { data: pendingObligations, error: obError } = await supabase
    .from('projected_transactions')
    .select('amount')
    .eq('ledger_id', ledgerId)
    .eq('status', 'pending')

  if (obError) {
    console.error('Failed to query obligations:', obError)
    return null
  }

  const pendingTotal = (pendingObligations || []).reduce(
    (sum, p) => sum + Number(p.amount) * 100, 0
  )

  // Calculate projected coverage after this transaction
  const projectedCash = cashBalance - request.amount
  const projectedCoverage = pendingTotal > 0 ? projectedCash / pendingTotal : 1

  if (projectedCoverage < minCoverageRatio) {
    return {
      policy_id: policy.id,
      policy_type: policy.policy_type,
      severity: policy.severity,
      reason: `Transaction would reduce coverage ratio to ${Math.round(projectedCoverage * 100)}% (minimum: ${Math.round(minCoverageRatio * 100)}%). Cash after: ${formatCurrency(projectedCash)}, Pending obligations: ${formatCurrency(pendingTotal)}`
    }
  }

  return null
}

// Format currency for display
function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amountCents / 100)
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const handler = createHandler(
  { endpoint: 'preflight-authorization', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: PreflightRequest,
    context: { requestId: string }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    // Validate required fields
    const idempotencyKey = validateString(body.idempotency_key, 1, 255)
    if (!idempotencyKey) {
      return errorResponse('idempotency_key is required (1-255 characters)', 400, req, context.requestId)
    }

    const amount = validateInteger(body.amount, 1, 100000000000)  // Max $1B
    if (amount === null) {
      return errorResponse('amount is required (positive integer in cents)', 400, req, context.requestId)
    }

    // Validate optional instrument ID
    let instrumentId: string | null = null
    if (body.authorizing_instrument_id) {
      instrumentId = validateUUID(body.authorizing_instrument_id)
      if (!instrumentId) {
        return errorResponse('Invalid authorizing_instrument_id: must be valid UUID', 400, req, context.requestId)
      }
    }

    // ========================================================================
    // STEP 0: IDEMPOTENCY CHECK
    // ========================================================================

    const { data: existingDecision, error: idempError } = await supabase
      .from('authorization_decisions')
      .select('*')
      .eq('ledger_id', ledger.id)
      .eq('idempotency_key', idempotencyKey)
      .single()

    if (existingDecision && !idempError) {
      // Check if decision is still valid (not expired)
      if (new Date(existingDecision.expires_at) > new Date()) {
        // Return existing decision without re-evaluation
        return jsonResponse({
          success: true,
          cached: true,
          decision: {
            id: existingDecision.id,
            decision: existingDecision.decision,
            violated_policies: existingDecision.violated_policies,
            expires_at: existingDecision.expires_at,
            created_at: existingDecision.created_at
          }
        }, 200, req, context.requestId)
      }
      // Expired decision - we'll create a new one (delete old first)
      await supabase
        .from('authorization_decisions')
        .delete()
        .eq('id', existingDecision.id)
    }

    // ========================================================================
    // STEP 1: LOAD LEDGER CONTEXT
    // ========================================================================

    // Get active policies ordered by priority
    const { data: policies, error: policyError } = await supabase
      .from('authorization_policies')
      .select('id, policy_type, config, severity, priority')
      .eq('ledger_id', ledger.id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (policyError) {
      console.error(`[${context.requestId}] Failed to load policies:`, policyError.message)
      return errorResponse('Failed to load authorization policies', 500, req, context.requestId)
    }

    // If no policies configured, allow by default
    if (!policies || policies.length === 0) {
      const decision = await createDecision(supabase, ledger.id, idempotencyKey, body, 'allowed', [])
      return jsonResponse({
        success: true,
        cached: false,
        decision,
        message: 'No authorization policies configured - allowed by default'
      }, 200, req, context.requestId)
    }

    // ========================================================================
    // STEP 2: EVALUATE POLICIES (BY PRIORITY)
    // ========================================================================

    const violations: PolicyViolation[] = []

    for (const policy of policies as Policy[]) {
      let violation: PolicyViolation | null = null

      switch (policy.policy_type) {
        case 'require_instrument':
          violation = await evaluateRequireInstrument(supabase, ledger.id, policy, body)
          break
        case 'budget_cap':
          violation = await evaluateBudgetCap(supabase, ledger.id, policy, body)
          break
        case 'projection_guard':
          violation = await evaluateProjectionGuard(supabase, ledger.id, policy, body)
          break
        default:
          console.warn(`[${context.requestId}] Unknown policy type: ${policy.policy_type}`)
      }

      if (violation) {
        violations.push(violation)
      }
    }

    // ========================================================================
    // STEP 3: DECISION RESOLUTION
    // ========================================================================

    let decision: 'allowed' | 'warn' | 'blocked'

    const hardViolations = violations.filter(v => v.severity === 'hard')
    const softViolations = violations.filter(v => v.severity === 'soft')

    if (hardViolations.length > 0) {
      decision = 'blocked'
    } else if (softViolations.length > 0) {
      decision = 'warn'
    } else {
      decision = 'allowed'
    }

    // ========================================================================
    // STEP 4: PERSIST DECISION
    // ========================================================================

    const authDecision = await createDecision(
      supabase,
      ledger.id,
      idempotencyKey,
      body,
      decision,
      violations
    )

    // Log blocked decisions as security events
    if (decision === 'blocked') {
      await supabase.from('security_events').insert({
        ledger_id: ledger.id,
        event_type: 'authorization_blocked',
        severity: 'medium',
        details: {
          decision_id: authDecision.id,
          violations: violations,
          proposed_amount: body.amount
        },
        ip_address: getClientIp(req)
      }).catch(() => {})  // Non-critical
    }

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'preflight_authorization',
      entity_type: 'authorization_decision',
      entity_id: authDecision.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: {
        idempotency_key: idempotencyKey,
        amount: body.amount,
        decision: decision,
        violations_count: violations.length
      }
    }).catch(() => {})  // Non-critical

    return jsonResponse({
      success: true,
      cached: false,
      decision: authDecision
    }, 200, req, context.requestId)
  }
)

// Helper to create and persist a decision
async function createDecision(
  supabase: SupabaseClient,
  ledgerId: string,
  idempotencyKey: string,
  request: PreflightRequest,
  decision: 'allowed' | 'warn' | 'blocked',
  violations: PolicyViolation[]
): Promise<AuthorizationDecision> {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 2)  // 2 hour TTL

  const { data, error } = await supabase
    .from('authorization_decisions')
    .insert({
      ledger_id: ledgerId,
      idempotency_key: idempotencyKey,
      proposed_transaction: {
        amount: request.amount,
        currency: request.currency || 'USD',
        counterparty_name: request.counterparty_name,
        authorizing_instrument_id: request.authorizing_instrument_id,
        expected_date: request.expected_date,
        category: request.category
      },
      decision: decision,
      violated_policies: violations,
      expires_at: expiresAt.toISOString()
    })
    .select('id, decision, violated_policies, expires_at, created_at')
    .single()

  if (error) {
    throw new Error(`Failed to persist decision: ${error.message}`)
  }

  return data as AuthorizationDecision
}

Deno.serve(handler)
