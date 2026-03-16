import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  createFraudEvaluationResponse,
  getFraudEvaluationResponse,
  createFraudPolicyResponse,
} from '../fraud-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// Input validation — createFraudEvaluationResponse
// ==========================================================================

Deno.test('fraud evaluation: requires idempotency_key', async () => {
  const supabase = {} as any
  const result = await createFraudEvaluationResponse(req, supabase, ledger, {
    amount: 1000,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_idempotency_key')
})

Deno.test('fraud evaluation: requires positive amount', async () => {
  const supabase = {} as any
  const result = await createFraudEvaluationResponse(req, supabase, ledger, {
    idempotency_key: 'key_1',
    amount: -100,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('fraud evaluation: requires amount to be an integer', async () => {
  const supabase = {} as any
  const result = await createFraudEvaluationResponse(req, supabase, ledger, {
    idempotency_key: 'key_1',
    amount: 0,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_amount')
})

Deno.test('fraud evaluation: validates authorizing_instrument_id as UUID', async () => {
  const supabase = {} as any
  const result = await createFraudEvaluationResponse(req, supabase, ledger, {
    idempotency_key: 'key_1',
    amount: 1000,
    authorizing_instrument_id: 'not-a-uuid',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_authorizing_instrument_id')
})

Deno.test('fraud evaluation: validates expected_date format', async () => {
  const supabase = {} as any
  const result = await createFraudEvaluationResponse(req, supabase, ledger, {
    idempotency_key: 'key_1',
    amount: 1000,
    expected_date: 'not-a-date',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_expected_date')
})

// ==========================================================================
// Idempotency — returns cached evaluation when still valid
// ==========================================================================

Deno.test('fraud evaluation: returns cached evaluation when valid_until is in the future', async () => {
  const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const supabase = {
    from(table: string) {
      if (table === 'risk_evaluations') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({
              data: {
                id: 'eval_cached',
                signal: 'within_policy',
                risk_factors: [],
                valid_until: futureDate,
                created_at: '2026-03-01T10:00:00Z',
                acknowledged_at: null,
              },
              error: null,
            })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await createFraudEvaluationResponse(req, supabase, ledger, {
    idempotency_key: 'key_cached',
    amount: 5000,
    currency: 'USD',
  }, requestId)

  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  assertEquals(result.body.cached, true)
  assertEquals((result.body.evaluation as any).id, 'eval_cached')
  assertEquals((result.body.evaluation as any).signal, 'within_policy')
})

// ==========================================================================
// getFraudEvaluationResponse — validation
// ==========================================================================

Deno.test('get fraud evaluation: rejects invalid UUID', async () => {
  const supabase = {} as any
  const result = await getFraudEvaluationResponse(req, supabase, ledger, 'not-a-uuid', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_evaluation_id')
})

Deno.test('get fraud evaluation: returns 404 when not found', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  const result = await getFraudEvaluationResponse(
    req, supabase, ledger,
    '550e8400-e29b-41d4-a716-446655440099',
    requestId,
  )
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'fraud_evaluation_not_found')
})

// ==========================================================================
// createFraudPolicyResponse — validation
// ==========================================================================

Deno.test('create fraud policy: rejects invalid policy_type', async () => {
  const supabase = {} as any
  const result = await createFraudPolicyResponse(req, supabase, ledger, {
    policy_type: 'invalid_type' as any,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_policy_type')
})

Deno.test('create fraud policy: rejects missing policy_type', async () => {
  const supabase = {} as any
  const result = await createFraudPolicyResponse(req, supabase, ledger, {}, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_policy_type')
})

Deno.test('create fraud policy: rejects invalid severity', async () => {
  const supabase = {} as any
  const result = await createFraudPolicyResponse(req, supabase, ledger, {
    policy_type: 'budget_cap',
    severity: 'medium' as any,
    config: { cap_amount: 100000 },
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_policy_severity')
})

Deno.test('create fraud policy: budget_cap requires cap_amount', async () => {
  const supabase = {} as any
  const result = await createFraudPolicyResponse(req, supabase, ledger, {
    policy_type: 'budget_cap',
    config: {},
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_policy_config')
})

Deno.test('create fraud policy: projection_guard validates min_coverage_ratio range', async () => {
  const supabase = {} as any
  const result = await createFraudPolicyResponse(req, supabase, ledger, {
    policy_type: 'projection_guard',
    config: { min_coverage_ratio: 1.5 },
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_policy_config')
})

Deno.test('create fraud policy: require_instrument validates threshold_amount', async () => {
  const supabase = {} as any
  const result = await createFraudPolicyResponse(req, supabase, ledger, {
    policy_type: 'require_instrument',
    config: { threshold_amount: -5 },
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_policy_config')
})
