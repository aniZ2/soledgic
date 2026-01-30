// Soledgic Edge Function: Risk Evaluation
// POST /risk-evaluation
//
// Signal Engine: Analyzes risk state BEFORE transaction execution.
//
// Philosophy:
// "Soledgic never says 'do' or 'don't.' It says 'this is where you are standing.'"
//
// This system:
// - Analyzes proposed transactions against policy rules
// - Generates risk signals (not decisions)
// - Flags concerns (not blocks actions)
//
// This system does NOT:
// - Authorize or deny transactions
// - Make judgments on behalf of users
// - Block anything (users can acknowledge and proceed)

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateUUID,
  validateString,
  validateInteger,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RiskEvaluationRequest {
  idempotency_key: string
  amount: number  // In cents
  currency?: string
  counterparty_name?: string
  authorizing_instrument_id?: string
  expected_date?: string
  category?: string
}

interface RiskPolicy {
  id: string
  policy_type: string
  config: Record<string, any>
  severity: 'hard' | 'soft'
  priority: number
}

interface RiskFactor {
  policy_id: string
  policy_type: string
  severity: 'hard' | 'soft'
  indicator: string  // Changed from 'reason' to 'indicator'
}

interface RiskEvaluation {
  id: string
  signal: 'within_policy' | 'elevated_risk' | 'high_risk'
  risk_factors: RiskFactor[]
  valid_until: string
  created_at: string
}

// ============================================================================
// POLICY EVALUATORS (Signal Generators, not Decision Makers)
// ============================================================================

// Policy: require_instrument
// Flags transactions above threshold without an authorizing instrument
async function evaluateRequireInstrument(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: RiskPolicy,
  request: RiskEvaluationRequest
): Promise<RiskFactor | null> {
  const threshold = policy.config.threshold_amount || 100000  // Default $1000

  if (request.amount > threshold && !request.authorizing_instrument_id) {
    return {
      policy_id: policy.id,
      policy_type: policy.policy_type,
      severity: policy.severity,
      indicator: `Transaction of ${formatCurrency(request.amount)} exceeds ${formatCurrency(threshold)} threshold without authorizing instrument`
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
        indicator: 'Referenced authorizing instrument not found'
      }
    }

    if (instrument.status === 'invalidated') {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        indicator: 'Referenced authorizing instrument has been invalidated'
      }
    }
  }

  return null
}

// Policy: budget_cap
// Flags when spending exceeds budget caps
async function evaluateBudgetCap(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: RiskPolicy,
  request: RiskEvaluationRequest
): Promise<RiskFactor | null> {
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
  const query = supabase
    .from('transactions')
    .select('id, entries!inner(amount, account:accounts!inner(account_type))')
    .eq('ledger_id', ledgerId)
    .gte('transaction_date', periodStart.toISOString().split('T')[0])

  const { data: transactions, error } = await query

  if (error) {
    console.error('Failed to query budget spending:', error)
    return null  // Don't flag on query failure
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
      indicator: `${period.charAt(0).toUpperCase() + period.slice(1)} budget cap of ${formatCurrency(capAmount)} would be exceeded by ${formatCurrency(overage)}${category ? ` for category "${category}"` : ''}`
    }
  }

  return null
}

// Policy: projection_guard
// Flags if transaction would cause liquidity pressure
async function evaluateProjectionGuard(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: RiskPolicy,
  request: RiskEvaluationRequest
): Promise<RiskFactor | null> {
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
    return null  // Don't flag on query failure
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
      indicator: `Liquidity pressure: coverage ratio would drop to ${Math.round(projectedCoverage * 100)}% (threshold: ${Math.round(minCoverageRatio * 100)}%). Cash after: ${formatCurrency(projectedCash)}, Pending obligations: ${formatCurrency(pendingTotal)}`
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
  { endpoint: 'risk-evaluation', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: RiskEvaluationRequest,
    context: { requestId: string; startTime: number }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    // Validate required fields
    const idempotencyKey = validateString(body.idempotency_key, 255)
    if (!idempotencyKey || idempotencyKey.length < 1) {
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

    const { data: existingEvaluation, error: idempError } = await supabase
      .from('risk_evaluations')
      .select('*')
      .eq('ledger_id', ledger.id)
      .eq('idempotency_key', idempotencyKey)
      .single()

    if (existingEvaluation && !idempError) {
      // Check if evaluation is still valid (not expired)
      if (new Date(existingEvaluation.valid_until) > new Date()) {
        // Return existing evaluation without re-analysis
        return jsonResponse({
          success: true,
          cached: true,
          evaluation: {
            id: existingEvaluation.id,
            signal: existingEvaluation.signal,
            risk_factors: existingEvaluation.risk_factors,
            valid_until: existingEvaluation.valid_until,
            created_at: existingEvaluation.created_at,
            acknowledged_at: existingEvaluation.acknowledged_at
          }
        }, 200, req, context.requestId)
      }
      // Expired evaluation - we'll create a new one (delete old first)
      await supabase
        .from('risk_evaluations')
        .delete()
        .eq('id', existingEvaluation.id)
    }

    // ========================================================================
    // STEP 1: LOAD LEDGER CONTEXT
    // ========================================================================

    // Get active policies ordered by priority
    const { data: policies, error: policyError } = await supabase
      .from('risk_policies')
      .select('id, policy_type, config, severity, priority')
      .eq('ledger_id', ledger.id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (policyError) {
      console.error(`[${context.requestId}] Failed to load policies:`, policyError.message)
      return errorResponse('Failed to load risk policies', 500, req, context.requestId)
    }

    // If no policies configured, signal within_policy by default
    if (!policies || policies.length === 0) {
      const evaluation = await createEvaluation(supabase, ledger.id, idempotencyKey, body, 'within_policy', [])
      return jsonResponse({
        success: true,
        cached: false,
        evaluation,
        message: 'No risk policies configured - within_policy by default'
      }, 200, req, context.requestId)
    }

    // ========================================================================
    // STEP 2: EVALUATE POLICIES (GENERATE RISK SIGNALS)
    // ========================================================================

    const riskFactors: RiskFactor[] = []

    for (const policy of policies as RiskPolicy[]) {
      let factor: RiskFactor | null = null

      try {
        switch (policy.policy_type) {
          case 'require_instrument':
            factor = await evaluateRequireInstrument(supabase, ledger.id, policy, body)
            break
          case 'budget_cap':
            factor = await evaluateBudgetCap(supabase, ledger.id, policy, body)
            break
          case 'projection_guard':
            factor = await evaluateProjectionGuard(supabase, ledger.id, policy, body)
            break
          default:
            console.warn(`[${context.requestId}] Unknown policy type: ${policy.policy_type}`)
        }
      } catch (evalError: any) {
        console.error(`[${context.requestId}] Policy evaluation error for ${policy.policy_type}:`, evalError.message)
        // Continue with other policies - don't fail the entire evaluation
      }

      if (factor) {
        riskFactors.push(factor)
      }
    }

    // ========================================================================
    // STEP 3: SIGNAL DETERMINATION
    // ========================================================================
    // Signal is purely informational - it does not block anything

    let signal: 'within_policy' | 'elevated_risk' | 'high_risk'

    const hardFactors = riskFactors.filter(f => f.severity === 'hard')
    const softFactors = riskFactors.filter(f => f.severity === 'soft')

    if (hardFactors.length > 0) {
      signal = 'high_risk'
    } else if (softFactors.length > 0) {
      signal = 'elevated_risk'
    } else {
      signal = 'within_policy'
    }

    // ========================================================================
    // STEP 4: PERSIST EVALUATION
    // ========================================================================

    const evaluation = await createEvaluation(
      supabase,
      ledger.id,
      idempotencyKey,
      body,
      signal,
      riskFactors
    )

    // Log high_risk evaluations as security alerts (for awareness, not blocking)
    if (signal === 'high_risk') {
      // Fire and forget - don't await, don't block on failure
      supabase.from('security_alerts').insert({
        severity: 'warning',
        alert_type: 'high_risk_evaluation',
        title: 'High risk transaction evaluation',
        description: `Risk evaluation ${evaluation.id} returned high_risk signal for proposed transaction of ${formatCurrency(body.amount)}`,
        metadata: {
          ledger_id: ledger.id,
          evaluation_id: evaluation.id,
          risk_factors: riskFactors,
          proposed_amount: body.amount,
          ip_address: getClientIp(req)
        }
      }).then(() => {}).catch(() => {})  // Non-critical
    }

    // Audit log - fire and forget
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'risk_evaluation',
      entity_type: 'risk_evaluation',
      entity_id: evaluation.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: {
        idempotency_key: idempotencyKey,
        amount: body.amount,
        signal: signal,
        risk_factors_count: riskFactors.length
      }
    }).then(() => {}).catch(() => {})  // Non-critical

    return jsonResponse({
      success: true,
      cached: false,
      evaluation
    }, 200, req, context.requestId)
  }
)

// Helper to create and persist an evaluation
async function createEvaluation(
  supabase: SupabaseClient,
  ledgerId: string,
  idempotencyKey: string,
  request: RiskEvaluationRequest,
  signal: 'within_policy' | 'elevated_risk' | 'high_risk',
  riskFactors: RiskFactor[]
): Promise<RiskEvaluation> {
  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + 2)  // 2 hour TTL

  const { data, error } = await supabase
    .from('risk_evaluations')
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
      signal: signal,
      risk_factors: riskFactors,
      valid_until: validUntil.toISOString()
    })
    .select('id, signal, risk_factors, valid_until, created_at')
    .single()

  if (error) {
    throw new Error(`Failed to persist evaluation: ${error.message}`)
  }

  return data as RiskEvaluation
}

Deno.serve(handler)
