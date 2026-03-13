import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  LedgerContext,
  sanitizeForAudit,
  validateDate,
  validateInteger,
  validateString,
  validateUUID,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

type FraudPolicyType = 'require_instrument' | 'budget_cap' | 'projection_guard'
type FraudPolicySeverity = 'hard' | 'soft'

export interface FraudEvaluationInput {
  idempotency_key?: string
  amount?: number
  currency?: string
  counterparty_name?: string
  authorizing_instrument_id?: string
  expected_date?: string
  category?: string
}

export interface FraudPolicyInput {
  policy_type?: FraudPolicyType
  config?: Record<string, unknown>
  severity?: FraudPolicySeverity
  priority?: number
}

interface FraudPolicy {
  id: string
  policy_type: FraudPolicyType
  config: Record<string, unknown>
  severity: FraudPolicySeverity
  priority: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface FraudFactor {
  policy_id: string
  policy_type: FraudPolicyType
  severity: FraudPolicySeverity
  indicator: string
}

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100)
}

function normalizeFraudPolicy(policy: FraudPolicy) {
  return {
    id: policy.id,
    type: policy.policy_type,
    severity: policy.severity,
    priority: policy.priority,
    is_active: policy.is_active,
    config: policy.config || {},
    created_at: policy.created_at || null,
    updated_at: policy.updated_at || null,
  }
}

function normalizeFraudEvaluation(evaluation: any) {
  return {
    id: evaluation.id,
    signal: evaluation.signal,
    risk_factors: Array.isArray(evaluation.risk_factors) ? evaluation.risk_factors : [],
    valid_until: evaluation.valid_until,
    created_at: evaluation.created_at,
    acknowledged_at: evaluation.acknowledged_at || null,
  }
}

async function evaluateRequireInstrument(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: FraudPolicy,
  request: Required<FraudEvaluationInput>,
): Promise<FraudFactor | null> {
  const threshold = Number(policy.config.threshold_amount || 100000)

  if (request.amount > threshold && !request.authorizing_instrument_id) {
    return {
      policy_id: policy.id,
      policy_type: policy.policy_type,
      severity: policy.severity,
      indicator: `Transaction of ${formatCurrency(request.amount)} exceeds ${formatCurrency(threshold)} threshold without an authorizing instrument`,
    }
  }

  if (request.authorizing_instrument_id) {
    const { data: instrument, error } = await supabase
      .from('authorizing_instruments')
      .select('id, status')
      .eq('id', request.authorizing_instrument_id)
      .eq('ledger_id', ledgerId)
      .maybeSingle()

    if (error || !instrument?.id) {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        indicator: 'Referenced authorizing instrument not found',
      }
    }

    if (instrument.status === 'invalidated') {
      return {
        policy_id: policy.id,
        policy_type: policy.policy_type,
        severity: policy.severity,
        indicator: 'Referenced authorizing instrument has been invalidated',
      }
    }
  }

  return null
}

async function evaluateBudgetCap(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: FraudPolicy,
  request: Required<FraudEvaluationInput>,
): Promise<FraudFactor | null> {
  const capAmount = Number(policy.config.cap_amount || 0)
  const period = String(policy.config.period || 'monthly')
  const category = policy.config.category ? String(policy.config.category) : null

  if (!capAmount) return null
  if (category && request.category && request.category !== category) return null

  const now = new Date()
  let periodStart: Date

  switch (period) {
    case 'weekly':
      periodStart = new Date(now)
      periodStart.setDate(now.getDate() - now.getDay())
      periodStart.setHours(0, 0, 0, 0)
      break
    case 'quarterly': {
      const quarter = Math.floor(now.getMonth() / 3)
      periodStart = new Date(now.getFullYear(), quarter * 3, 1)
      break
    }
    case 'annual':
      periodStart = new Date(now.getFullYear(), 0, 1)
      break
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      break
  }

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('id, entries!inner(amount, account:accounts!inner(account_type))')
    .eq('ledger_id', ledgerId)
    .gte('transaction_date', periodStart.toISOString().split('T')[0])

  if (error) {
    console.error('evaluateBudgetCap query error:', error)
    return null
  }

  let currentSpending = 0
  for (const transaction of transactions || []) {
    for (const entry of (transaction as any).entries || []) {
      if (entry.account?.account_type === 'expense' && entry.amount > 0) {
        currentSpending += Number(entry.amount) * 100
      }
    }
  }

  const projectedTotal = currentSpending + request.amount
  if (projectedTotal <= capAmount) return null

  const overage = projectedTotal - capAmount
  return {
    policy_id: policy.id,
    policy_type: policy.policy_type,
    severity: policy.severity,
    indicator: `${period.charAt(0).toUpperCase() + period.slice(1)} budget cap of ${formatCurrency(capAmount)} would be exceeded by ${formatCurrency(overage)}${category ? ` for category "${category}"` : ''}`,
  }
}

async function evaluateProjectionGuard(
  supabase: SupabaseClient,
  ledgerId: string,
  policy: FraudPolicy,
  request: Required<FraudEvaluationInput>,
): Promise<FraudFactor | null> {
  const minCoverageRatio = Number(policy.config.min_coverage_ratio || 0.5)

  const { data: cashAccount, error: cashError } = await supabase
    .from('accounts')
    .select('balance')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'cash')
    .maybeSingle()

  if (cashError) {
    console.error('evaluateProjectionGuard cash query error:', cashError)
    return null
  }

  const { data: pendingObligations, error: obligationsError } = await supabase
    .from('projected_transactions')
    .select('amount')
    .eq('ledger_id', ledgerId)
    .eq('status', 'pending')

  if (obligationsError) {
    console.error('evaluateProjectionGuard obligations query error:', obligationsError)
    return null
  }

  const cashBalance = Number(cashAccount?.balance || 0) * 100
  const pendingTotal = (pendingObligations || []).reduce((sum, item) => sum + Number(item.amount) * 100, 0)
  const projectedCash = cashBalance - request.amount
  const projectedCoverage = pendingTotal > 0 ? projectedCash / pendingTotal : 1

  if (projectedCoverage >= minCoverageRatio) return null

  return {
    policy_id: policy.id,
    policy_type: policy.policy_type,
    severity: policy.severity,
    indicator: `Liquidity pressure: coverage ratio would drop to ${Math.round(projectedCoverage * 100)}% (threshold: ${Math.round(minCoverageRatio * 100)}%). Cash after: ${formatCurrency(projectedCash)}, Pending obligations: ${formatCurrency(pendingTotal)}`,
  }
}

async function createFraudEvaluation(
  supabase: SupabaseClient,
  ledgerId: string,
  request: Required<FraudEvaluationInput>,
  signal: 'within_policy' | 'elevated_risk' | 'high_risk',
  riskFactors: FraudFactor[],
): Promise<any> {
  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + 2)

  const { data, error } = await supabase
    .from('risk_evaluations')
    .insert({
      ledger_id: ledgerId,
      idempotency_key: request.idempotency_key,
      proposed_transaction: {
        amount: request.amount,
        currency: request.currency,
        counterparty_name: request.counterparty_name || null,
        authorizing_instrument_id: request.authorizing_instrument_id || null,
        expected_date: request.expected_date || null,
        category: request.category || null,
      },
      signal,
      risk_factors: riskFactors,
      valid_until: validUntil.toISOString(),
    })
    .select('id, signal, risk_factors, valid_until, created_at, acknowledged_at')
    .single()

  if (error || !data?.id) {
    throw new Error(`Failed to persist fraud evaluation: ${error?.message || 'unknown error'}`)
  }

  return data
}

export async function createFraudEvaluationResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: FraudEvaluationInput,
  requestId: string,
): Promise<ResourceResult> {
  const idempotencyKey = validateString(body.idempotency_key, 255)
  if (!idempotencyKey) {
    return resourceError('idempotency_key is required', 400, {}, 'invalid_idempotency_key')
  }

  const amount = validateInteger(body.amount, 1, Number.MAX_SAFE_INTEGER)
  if (amount === null) {
    return resourceError('amount must be a positive integer in cents', 400, {}, 'invalid_amount')
  }

  const currency = validateString(body.currency || 'USD', 8) || 'USD'
  const counterpartyName = body.counterparty_name ? validateString(body.counterparty_name, 255) : null
  const authorizingInstrumentId = body.authorizing_instrument_id
    ? validateUUID(body.authorizing_instrument_id)
    : null
  if (body.authorizing_instrument_id && !authorizingInstrumentId) {
    return resourceError(
      'authorizing_instrument_id must be a UUID',
      400,
      {},
      'invalid_authorizing_instrument_id',
    )
  }

  const expectedDate = body.expected_date ? validateDate(body.expected_date) : null
  if (body.expected_date && !expectedDate) {
    return resourceError('expected_date must be a valid ISO date', 400, {}, 'invalid_expected_date')
  }

  const category = body.category ? validateString(body.category, 100) : null

  const normalizedRequest: Required<FraudEvaluationInput> = {
    idempotency_key: idempotencyKey,
    amount,
    currency: currency.toUpperCase(),
    counterparty_name: counterpartyName || '',
    authorizing_instrument_id: authorizingInstrumentId || '',
    expected_date: expectedDate ? expectedDate.slice(0, 10) : '',
    category: category || '',
  }

  const { data: existingEvaluation } = await supabase
    .from('risk_evaluations')
    .select('id, signal, risk_factors, valid_until, created_at, acknowledged_at')
    .eq('ledger_id', ledger.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existingEvaluation?.id && new Date(existingEvaluation.valid_until) > new Date()) {
    return resourceOk({
      success: true,
      cached: true,
      evaluation: normalizeFraudEvaluation(existingEvaluation),
    })
  }

  if (existingEvaluation?.id) {
    await supabase.from('risk_evaluations').delete().eq('id', existingEvaluation.id)
  }

  const { data: policies, error: policiesError } = await supabase
    .from('risk_policies')
    .select('id, policy_type, config, severity, priority, is_active, created_at, updated_at')
    .eq('ledger_id', ledger.id)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (policiesError) {
    console.error('createFraudEvaluationResponse policies error:', policiesError)
    return resourceError('Failed to load fraud policies', 500, {}, 'fraud_policy_load_failed')
  }

  const normalizedPolicies = (policies || []) as FraudPolicy[]
  const riskFactors: FraudFactor[] = []

  for (const policy of normalizedPolicies) {
    try {
      let factor: FraudFactor | null = null
      switch (policy.policy_type) {
        case 'require_instrument':
          factor = await evaluateRequireInstrument(supabase, ledger.id, policy, normalizedRequest)
          break
        case 'budget_cap':
          factor = await evaluateBudgetCap(supabase, ledger.id, policy, normalizedRequest)
          break
        case 'projection_guard':
          factor = await evaluateProjectionGuard(supabase, ledger.id, policy, normalizedRequest)
          break
      }
      if (factor) riskFactors.push(factor)
    } catch (error) {
      console.error(`Fraud policy evaluation failed for ${policy.policy_type}:`, error)
    }
  }

  const hardFactors = riskFactors.filter((factor) => factor.severity === 'hard')
  const softFactors = riskFactors.filter((factor) => factor.severity === 'soft')
  const signal = hardFactors.length > 0
    ? 'high_risk'
    : softFactors.length > 0
      ? 'elevated_risk'
      : 'within_policy'

  let evaluation: any
  try {
    evaluation = await createFraudEvaluation(supabase, ledger.id, normalizedRequest, signal, riskFactors)
  } catch (error) {
    console.error('createFraudEvaluationResponse create error:', error)
    return resourceError('Failed to create fraud evaluation', 500, {}, 'fraud_evaluation_create_failed')
  }

  if (signal === 'high_risk') {
    void supabase.from('security_alerts').insert({
      severity: 'warning',
      alert_type: 'high_risk_evaluation',
      title: 'High risk fraud evaluation',
      description: `Fraud evaluation ${evaluation.id} returned high_risk for ${formatCurrency(amount)}`,
      metadata: {
        ledger_id: ledger.id,
        evaluation_id: evaluation.id,
        risk_factors: riskFactors,
      },
    }).then(() => {}, () => {})
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'fraud_evaluation',
    entity_type: 'risk_evaluation',
    entity_id: evaluation.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      idempotency_key: idempotencyKey,
      amount,
      signal,
      risk_factors_count: riskFactors.length,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    cached: false,
    evaluation: normalizeFraudEvaluation(evaluation),
  }, 201)
}

export async function getFraudEvaluationResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  evaluationIdRaw: string,
  _requestId: string,
): Promise<ResourceResult> {
  const evaluationId = validateUUID(evaluationIdRaw)
  if (!evaluationId) {
    return resourceError('evaluation_id must be a UUID', 400, {}, 'invalid_evaluation_id')
  }

  const { data: evaluation, error } = await supabase
    .from('risk_evaluations')
    .select('id, signal, risk_factors, valid_until, created_at, acknowledged_at')
    .eq('ledger_id', ledger.id)
    .eq('id', evaluationId)
    .maybeSingle()

  if (error) {
    console.error('getFraudEvaluationResponse error:', error)
    return resourceError('Failed to load fraud evaluation', 500, {}, 'fraud_evaluation_lookup_failed')
  }

  if (!evaluation?.id) {
    return resourceError('Fraud evaluation not found', 404, {}, 'fraud_evaluation_not_found')
  }

  return resourceOk({
    success: true,
    evaluation: normalizeFraudEvaluation(evaluation),
  })
}

export async function listFraudPoliciesResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  _requestId: string,
): Promise<ResourceResult> {
  const { data: policies, error } = await supabase
    .from('risk_policies')
    .select('id, policy_type, config, severity, priority, is_active, created_at, updated_at')
    .eq('ledger_id', ledger.id)
    .order('priority', { ascending: true })

  if (error) {
    console.error('listFraudPoliciesResponse error:', error)
    return resourceError('Failed to list fraud policies', 500, {}, 'fraud_policy_list_failed')
  }

  return resourceOk({
    success: true,
    policies: (policies || []).map((policy) => normalizeFraudPolicy(policy as FraudPolicy)),
  })
}

export async function createFraudPolicyResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: FraudPolicyInput,
  requestId: string,
): Promise<ResourceResult> {
  const policyType = body.policy_type
  if (!policyType || !['require_instrument', 'budget_cap', 'projection_guard'].includes(policyType)) {
    return resourceError(
      'policy_type is required',
      400,
      {},
      'invalid_policy_type',
    )
  }

  const severity = body.severity || 'hard'
  if (!['hard', 'soft'].includes(severity)) {
    return resourceError('severity must be hard or soft', 400, {}, 'invalid_policy_severity')
  }

  const priority = body.priority === undefined
    ? 100
    : validateInteger(body.priority, 1, 100000)
  if (priority === null) {
    return resourceError('priority must be a positive integer', 400, {}, 'invalid_policy_priority')
  }

  const config = body.config || {}

  if (policyType === 'require_instrument') {
    const thresholdAmount = config.threshold_amount
    if (thresholdAmount !== undefined && validateInteger(thresholdAmount, 1, Number.MAX_SAFE_INTEGER) === null) {
      return resourceError(
        'config.threshold_amount must be a positive integer in cents',
        400,
        {},
        'invalid_policy_config',
      )
    }
  }

  if (policyType === 'budget_cap') {
    if (validateInteger(config.cap_amount, 1, Number.MAX_SAFE_INTEGER) === null) {
      return resourceError('config.cap_amount is required', 400, {}, 'invalid_policy_config')
    }
  }

  if (policyType === 'projection_guard') {
    const ratio = Number(config.min_coverage_ratio)
    if (config.min_coverage_ratio !== undefined && (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)) {
      return resourceError(
        'config.min_coverage_ratio must be between 0 and 1',
        400,
        {},
        'invalid_policy_config',
      )
    }
  }

  const { data: policy, error } = await supabase
    .from('risk_policies')
    .insert({
      ledger_id: ledger.id,
      policy_type: policyType,
      config,
      severity,
      priority,
      is_active: true,
    })
    .select('id, policy_type, config, severity, priority, is_active, created_at, updated_at')
    .single()

  if (error || !policy?.id) {
    console.error('createFraudPolicyResponse error:', error)
    return resourceError('Failed to create fraud policy', 500, {}, 'fraud_policy_create_failed')
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'create_fraud_policy',
    entity_type: 'risk_policy',
    entity_id: policy.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      policy_type: policyType,
      severity,
      priority,
    }),
  }, requestId)

  return resourceOk({
    success: true,
    policy: normalizeFraudPolicy(policy as FraudPolicy),
  }, 201)
}

export async function deleteFraudPolicyResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  policyIdRaw: string,
  requestId: string,
): Promise<ResourceResult> {
  const policyId = validateUUID(policyIdRaw)
  if (!policyId) {
    return resourceError('policy_id must be a UUID', 400, {}, 'invalid_policy_id')
  }

  const { data: deletedPolicies, error } = await supabase
    .from('risk_policies')
    .delete()
    .eq('id', policyId)
    .eq('ledger_id', ledger.id)
    .select('id')

  if (error) {
    console.error('deleteFraudPolicyResponse error:', error)
    return resourceError('Failed to delete fraud policy', 500, {}, 'fraud_policy_delete_failed')
  }

  if (!deletedPolicies?.length) {
    return resourceError('Fraud policy not found', 404, {}, 'fraud_policy_not_found')
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'delete_fraud_policy',
    entity_type: 'risk_policy',
    entity_id: policyId,
    actor_type: 'api',
    request_body: sanitizeForAudit({ policy_id: policyId }),
  }, requestId)

  return resourceOk({
    success: true,
    deleted: true,
    policy_id: policyId,
  })
}
