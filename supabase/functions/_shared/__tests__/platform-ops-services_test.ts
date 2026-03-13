import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { getComplianceOverviewResponse, listComplianceAccessPatternsResponse } from '../compliance-service.ts'
import { createFraudPolicyResponse } from '../fraud-service.ts'
import { createReconciliationSnapshotResponse } from '../reconciliations-service.ts'
import { listTaxDocumentsResponse } from '../tax-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

Deno.test('createFraudPolicyResponse: validates budget cap config', async () => {
  const result = await createFraudPolicyResponse(req, {} as any, ledger, {
    policy_type: 'budget_cap',
    config: {},
  }, requestId)

  assertEquals(result.status, 400)
  assertEquals((result.body as any).error_code, 'invalid_policy_config')
})

Deno.test('createReconciliationSnapshotResponse: requires scope', async () => {
  const result = await createReconciliationSnapshotResponse(req, {} as any, ledger, {}, requestId)

  assertEquals(result.status, 400)
  assertEquals((result.body as any).error_code, 'missing_snapshot_scope')
})

Deno.test('getComplianceOverviewResponse: summarizes audit signals', async () => {
  let callCount = 0
  const supabase = {
    from(table: string) {
      if (table !== 'audit_log') {
        throw new Error(`Unexpected table access: ${table}`)
      }

      callCount += 1

      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        gte() {
          return this
        },
        order() {
          return this
        },
        limit() {
          if (callCount === 1) {
            return Promise.resolve({
              data: [
                { action: 'payout_failed', created_at: '2026-03-12T12:00:00Z', ip_address: '1.1.1.1', actor_id: 'user_1', risk_score: 95 },
                { action: 'record_refund', created_at: '2026-03-12T13:00:00Z', ip_address: '1.1.1.1', actor_id: 'user_1', risk_score: 10 },
                { action: 'dispute_opened', created_at: '2026-03-12T14:00:00Z', ip_address: '2.2.2.2', actor_id: 'user_2', risk_score: 75 },
              ],
              error: null,
            })
          }

          return Promise.resolve({
            data: [
              { action: 'auth_failed', created_at: '2026-03-13T12:00:00Z', ip_address: '3.3.3.3', actor_id: 'user_3', risk_score: 20 },
            ],
            error: null,
          })
        },
      }
    },
  } as any

  const result = await getComplianceOverviewResponse(req, supabase, ledger, {}, requestId)
  const body = result.body as any

  assertEquals(result.status, 200)
  assertEquals(body.overview.total_events, 3)
  assertEquals(body.overview.high_risk_events, 2)
  assertEquals(body.overview.critical_risk_events, 1)
  assertEquals(body.overview.failed_auth_events, 1)
  assertEquals(body.overview.payouts_failed, 1)
  assertEquals(body.overview.refunds_recorded, 1)
  assertEquals(body.overview.dispute_events, 1)
})

Deno.test('listComplianceAccessPatternsResponse: groups access patterns by ip and hour', async () => {
  const supabase = {
    from(table: string) {
      if (table !== 'audit_log') {
        throw new Error(`Unexpected table access: ${table}`)
      }

      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        gte() {
          return this
        },
        order() {
          return this
        },
        limit() {
          return Promise.resolve({
            data: [
              { action: 'auth_failed', created_at: '2026-03-13T12:10:00Z', ip_address: '1.1.1.1', actor_id: 'user_1', risk_score: 10 },
              { action: 'auth_failed', created_at: '2026-03-13T12:15:00Z', ip_address: '1.1.1.1', actor_id: 'user_1', risk_score: 20 },
              { action: 'payout_failed', created_at: '2026-03-13T12:20:00Z', ip_address: '1.1.1.1', actor_id: 'user_1', risk_score: 85 },
            ],
            error: null,
          })
        },
      }
    },
  } as any

  const result = await listComplianceAccessPatternsResponse(req, supabase, ledger, {}, requestId)
  const body = result.body as any

  assertEquals(result.status, 200)
  assertEquals(body.count, 1)
  assertEquals(body.patterns[0].ip_address, '1.1.1.1')
  assertEquals(body.patterns[0].request_count, 3)
  assertEquals(body.patterns[0].failed_auths, 2)
  assertEquals(body.patterns[0].max_risk_score, 85)
})

Deno.test('listTaxDocumentsResponse: summarizes generated document counts', async () => {
  const supabase = {
    from(table: string) {
      if (table !== 'tax_documents') {
        throw new Error(`Unexpected table access: ${table}`)
      }

      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        order() {
          return Promise.resolve({
            data: [
              { id: 'doc_1', gross_amount: 1000, status: 'calculated' },
              { id: 'doc_2', gross_amount: 2500, status: 'filed' },
            ],
            error: null,
          })
        },
      }
    },
  } as any

  const result = await listTaxDocumentsResponse(req, supabase, ledger, { tax_year: 2025 }, requestId)
  const body = result.body as any

  assertEquals(result.status, 200)
  assertEquals(body.tax_year, 2025)
  assertEquals(body.summary.total_documents, 2)
  assertEquals(body.summary.total_amount, 3500)
  assertEquals(body.summary.by_status.calculated, 1)
  assertEquals(body.summary.by_status.filed, 1)
})
