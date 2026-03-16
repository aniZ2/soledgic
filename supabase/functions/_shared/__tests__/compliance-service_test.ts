import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  getComplianceOverviewResponse,
  listComplianceAccessPatternsResponse,
  listComplianceFinancialActivityResponse,
  listComplianceSecuritySummaryResponse,
} from '../compliance-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// Helper: build mock supabase with audit_log rows
// ==========================================================================

function buildMockSupabase(rows: Array<{
  action: string | null
  created_at: string | null
  ip_address: string | null
  actor_id: string | null
  risk_score: number | null
}>) {
  return {
    from(table: string) {
      if (table === 'audit_log') {
        return {
          select() { return this },
          eq() { return this },
          gte() { return this },
          order() { return this },
          limit() {
            return Promise.resolve({ data: rows, error: null })
          },
        }
      }
      return {
        select() { return this },
        eq() { return this },
        gte() { return this },
        order() { return this },
        limit() {
          return Promise.resolve({ data: [], error: null })
        },
      }
    },
  } as any
}

// ==========================================================================
// getComplianceOverviewResponse — clampLimit and counting logic
// ==========================================================================

Deno.test('compliance overview: returns correct counts for empty audit log', async () => {
  const supabase = buildMockSupabase([])
  const result = await getComplianceOverviewResponse(req, supabase, ledger, {}, requestId)

  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  const overview = result.body.overview as Record<string, unknown>
  assertEquals(overview.total_events, 0)
  assertEquals(overview.unique_ips, 0)
  assertEquals(overview.unique_actors, 0)
  assertEquals(overview.high_risk_events, 0)
  assertEquals(overview.critical_risk_events, 0)
  assertEquals(overview.failed_auth_events, 0)
  assertEquals(overview.refunds_recorded, 0)
  assertEquals(overview.dispute_events, 0)
})

Deno.test('compliance overview: classifies risk scores correctly', async () => {
  const rows = [
    { action: 'sale', created_at: '2026-03-01T10:00:00Z', ip_address: '1.1.1.1', actor_id: 'user1', risk_score: 50 },
    { action: 'sale', created_at: '2026-03-01T11:00:00Z', ip_address: '1.1.1.2', actor_id: 'user2', risk_score: 75 },
    { action: 'sale', created_at: '2026-03-01T12:00:00Z', ip_address: '1.1.1.3', actor_id: 'user3', risk_score: 95 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await getComplianceOverviewResponse(req, supabase, ledger, {}, requestId)

  assertEquals(result.status, 200)
  const overview = result.body.overview as Record<string, unknown>
  assertEquals(overview.total_events, 3)
  assertEquals(overview.unique_ips, 3)
  assertEquals(overview.unique_actors, 3)
  assertEquals(overview.high_risk_events, 2)   // >= 70: scores 75 and 95
  assertEquals(overview.critical_risk_events, 1) // >= 90: score 95
})

Deno.test('compliance overview: classifies action types correctly', async () => {
  const rows = [
    { action: 'refund', created_at: '2026-03-01T10:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'record_refund', created_at: '2026-03-01T10:01:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'sale_refunded', created_at: '2026-03-01T10:02:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'dispute_opened', created_at: '2026-03-01T10:03:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'dispute_closed', created_at: '2026-03-01T10:04:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'auth_failed', created_at: '2026-03-01T10:05:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'payout_failed', created_at: '2026-03-01T10:06:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await getComplianceOverviewResponse(req, supabase, ledger, {}, requestId)

  const overview = result.body.overview as Record<string, unknown>
  assertEquals(overview.refunds_recorded, 3)
  assertEquals(overview.dispute_events, 2)
  assertEquals(overview.failed_auth_events, 1)
  assertEquals(overview.payouts_failed, 1)
})

Deno.test('compliance overview: respects custom window options', async () => {
  const supabase = buildMockSupabase([])
  const result = await getComplianceOverviewResponse(req, supabase, ledger, { days: 7, hours: 48 }, requestId)

  const overview = result.body.overview as Record<string, unknown>
  assertEquals(overview.window_days, 7)
  assertEquals(overview.access_window_hours, 48)
})

Deno.test('compliance overview: clamps out-of-range window options', async () => {
  const supabase = buildMockSupabase([])
  const result = await getComplianceOverviewResponse(req, supabase, ledger, { days: 9999, hours: 9999 }, requestId)

  const overview = result.body.overview as Record<string, unknown>
  assertEquals(overview.window_days, 365)        // capped at 365
  assertEquals(overview.access_window_hours, 168) // capped at 168
})

// ==========================================================================
// listComplianceAccessPatternsResponse — grouping and filtering
// ==========================================================================

Deno.test('compliance access patterns: groups by IP and hour', async () => {
  const rows = [
    { action: 'login', created_at: '2026-03-15T10:30:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'sale', created_at: '2026-03-15T10:45:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
    { action: 'payout', created_at: '2026-03-15T10:50:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 10 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await listComplianceAccessPatternsResponse(req, supabase, ledger, {}, requestId)

  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)
  const patterns = result.body.patterns as Array<Record<string, unknown>>
  // All 3 from same IP and same hour => 1 pattern with request_count=3
  assertEquals(patterns.length, 1)
  assertEquals(patterns[0].request_count, 3)
  assertEquals(patterns[0].unique_actions, 3)
  assertEquals(patterns[0].ip_address, '1.1.1.1')
  assertEquals(patterns[0].hour, '2026-03-15T10:00:00Z')
})

Deno.test('compliance access patterns: filters out low-activity patterns', async () => {
  const rows = [
    { action: 'login', created_at: '2026-03-15T10:30:00Z', ip_address: '2.2.2.2', actor_id: 'u2', risk_score: 10 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await listComplianceAccessPatternsResponse(req, supabase, ledger, {}, requestId)

  // Only 1 request, no auth_failed, risk < 70 => filtered out
  const patterns = result.body.patterns as Array<Record<string, unknown>>
  assertEquals(patterns.length, 0)
})

Deno.test('compliance access patterns: includes auth_failed even with low count', async () => {
  const rows = [
    { action: 'auth_failed', created_at: '2026-03-15T10:30:00Z', ip_address: '3.3.3.3', actor_id: 'u3', risk_score: 10 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await listComplianceAccessPatternsResponse(req, supabase, ledger, {}, requestId)

  const patterns = result.body.patterns as Array<Record<string, unknown>>
  assertEquals(patterns.length, 1)
  assertEquals(patterns[0].failed_auths, 1)
})

// ==========================================================================
// listComplianceFinancialActivityResponse — daily aggregation
// ==========================================================================

Deno.test('compliance financial activity: groups by date and action type', async () => {
  const rows = [
    { action: 'payout_initiated', created_at: '2026-03-10T10:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 0 },
    { action: 'payout_completed', created_at: '2026-03-10T12:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 0 },
    { action: 'sale', created_at: '2026-03-10T14:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 0 },
    { action: 'record_sale', created_at: '2026-03-11T10:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 0 },
    { action: 'refund', created_at: '2026-03-11T11:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 0 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await listComplianceFinancialActivityResponse(req, supabase, ledger, {}, requestId)

  assertEquals(result.status, 200)
  const activity = result.body.activity as Array<Record<string, unknown>>
  assertEquals(activity.length, 2)

  // First date (2026-03-10) - sorted ascending
  const day1 = activity[0]
  assertEquals(day1.date, '2026-03-10')
  assertEquals(day1.payouts_initiated, 1)
  assertEquals(day1.payouts_completed, 1)
  assertEquals(day1.sales_recorded, 1)

  // Second date (2026-03-11)
  const day2 = activity[1]
  assertEquals(day2.date, '2026-03-11')
  assertEquals(day2.sales_recorded, 1)
  assertEquals(day2.refunds_recorded, 1)
})

// ==========================================================================
// listComplianceSecuritySummaryResponse — grouped by date+action
// ==========================================================================

Deno.test('compliance security summary: computes avg and max risk scores', async () => {
  const rows = [
    { action: 'login', created_at: '2026-03-10T10:00:00Z', ip_address: '1.1.1.1', actor_id: 'u1', risk_score: 60 },
    { action: 'login', created_at: '2026-03-10T11:00:00Z', ip_address: '1.1.1.2', actor_id: 'u2', risk_score: 80 },
    { action: 'login', created_at: '2026-03-10T12:00:00Z', ip_address: '1.1.1.3', actor_id: 'u3', risk_score: 100 },
  ]
  const supabase = buildMockSupabase(rows)
  const result = await listComplianceSecuritySummaryResponse(req, supabase, ledger, {}, requestId)

  assertEquals(result.status, 200)
  const summary = result.body.summary as Array<Record<string, unknown>>
  assertEquals(summary.length, 1)
  assertEquals(summary[0].action, 'login')
  assertEquals(summary[0].event_count, 3)
  assertEquals(summary[0].unique_ips, 3)
  assertEquals(summary[0].unique_actors, 3)
  assertEquals(summary[0].avg_risk_score, 80)   // Math.round((60+80+100)/3) = 80
  assertEquals(summary[0].max_risk_score, 100)
  assertEquals(summary[0].high_risk_count, 2)    // >= 70: 80, 100
  assertEquals(summary[0].critical_risk_count, 1) // >= 90: 100
})

// ==========================================================================
// Error handling — supabase query failure
// ==========================================================================

Deno.test('compliance overview: returns 500 on supabase error', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        gte() { return this },
        order() { return this },
        limit() {
          return Promise.resolve({ data: null, error: { message: 'db error' } })
        },
      }
    },
  } as any

  const result = await getComplianceOverviewResponse(req, supabase, ledger, {}, requestId)
  assertEquals(result.status, 500)
  assertEquals(result.body.success, false)
})
