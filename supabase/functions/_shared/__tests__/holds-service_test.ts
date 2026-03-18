import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  getHeldFundsSummaryResponse,
  listHeldFundsResponse,
  releaseHeldFundsResponse,
} from '../holds-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_holds_test'

// ==========================================================================
// getHeldFundsSummaryResponse — primary escrow summary RPC path
// ==========================================================================

Deno.test('summary: returns aggregated totals from get_escrow_summary RPC', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'get_escrow_summary') {
        return Promise.resolve({
          data: [
            { venture_id: 'v1', total_held: 100.50, total_ready: 60.25, total_pending_release: 10, entry_count: 5 },
            { venture_id: 'v2', total_held: 200, total_ready: 0, total_pending_release: 50, entry_count: 3 },
          ],
          error: null,
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  const result = await getHeldFundsSummaryResponse(req, supabase, ledger, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  assertEquals(body.source, 'get_escrow_summary')
  assertEquals(body.summary.total_held, 300.5)
  assertEquals(body.summary.total_ready, 60.25)
  assertEquals(body.summary.total_pending_release, 60)
  assertEquals(body.summary.venture_count, 2)
  assertEquals(body.summary.ventures.length, 2)
  assertEquals(body.summary.ventures[0].venture_id, 'v1')
  assertEquals(body.summary.ventures[0].entry_count, 5)
})

Deno.test('summary: falls back to get_held_funds_summary when escrow RPC missing', async () => {
  let calledRpcs: string[] = []

  const supabase = {
    rpc(fn: string) {
      calledRpcs.push(fn)
      if (fn === 'get_escrow_summary') {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function get_escrow_summary' },
        })
      }
      if (fn === 'get_held_funds_summary') {
        return Promise.resolve({
          data: [
            { venture_id: 'v1', venture_name: 'Venture One', total_held: 75, ready_for_release: 25, entry_count: 2 },
          ],
          error: null,
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  const result = await getHeldFundsSummaryResponse(req, supabase, ledger, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  assertEquals(body.source, 'get_held_funds_summary')
  assertEquals(body.summary.total_held, 75)
  assertEquals(body.summary.total_ready, 25)
  assertEquals(body.summary.ventures[0].venture_name, 'Venture One')
  assertEquals(calledRpcs.includes('get_escrow_summary'), true)
  assertEquals(calledRpcs.includes('get_held_funds_summary'), true)
})

Deno.test('summary: returns 500 when both summary RPCs fail with real error', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'get_escrow_summary') {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function' },
        })
      }
      if (fn === 'get_held_funds_summary') {
        return Promise.resolve({
          data: null,
          error: { code: '42501', message: 'permission denied for table entries' },
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  const result = await getHeldFundsSummaryResponse(req, supabase, ledger, requestId)

  assertEquals(result.status, 500)
  assertEquals(result.body.error_code, 'holds_summary_fetch_failed')
})

Deno.test('summary: handles empty RPC result gracefully', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'get_escrow_summary') {
        return Promise.resolve({ data: [], error: null })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  const result = await getHeldFundsSummaryResponse(req, supabase, ledger, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  assertEquals(body.summary.total_held, 0)
  assertEquals(body.summary.total_ready, 0)
  assertEquals(body.summary.total_pending_release, 0)
  assertEquals(body.summary.venture_count, 0)
  assertEquals(body.summary.ventures.length, 0)
})

Deno.test('summary: coerces non-numeric RPC values to zero', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'get_escrow_summary') {
        return Promise.resolve({
          data: [
            { venture_id: 'v1', total_held: 'not_a_number', total_ready: null, total_pending_release: undefined, entry_count: 'abc' },
          ],
          error: null,
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  const result = await getHeldFundsSummaryResponse(req, supabase, ledger, requestId)

  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.summary.total_held, 0)
  assertEquals(body.summary.total_ready, 0)
  assertEquals(body.summary.total_pending_release, 0)
  assertEquals(body.summary.ventures[0].entry_count, 0)
})

// ==========================================================================
// listHeldFundsResponse — limit normalization (exercises internal normalizeLimit)
// ==========================================================================

Deno.test('list: normalizes extreme limit values', async () => {
  let capturedLimit: number | null = null

  const supabase = {
    rpc(fn: string, args: any) {
      if (fn === 'get_held_funds_dashboard') {
        capturedLimit = args.p_limit
        return Promise.resolve({ data: [], error: null })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  // Limit of 99999 should be clamped to 1000 (max for listHeldFundsResponse)
  const result = await listHeldFundsResponse(req, supabase, ledger, {
    limit: 99999,
  }, requestId)

  assertEquals(result.status, 200)
  assertEquals(capturedLimit, 1000)
})

Deno.test('list: returns 500 when RPC fails with non-missing error', async () => {
  const supabase = {
    rpc(fn: string) {
      if (fn === 'get_held_funds_dashboard') {
        return Promise.resolve({
          data: null,
          error: { code: '42501', message: 'permission denied' },
        })
      }
      throw new Error(`Unexpected RPC: ${fn}`)
    },
  } as any

  const result = await listHeldFundsResponse(req, supabase, ledger, {}, requestId)

  assertEquals(result.status, 500)
  assertEquals(result.body.error_code, 'holds_fetch_failed')
})

// ==========================================================================
// releaseHeldFundsResponse — entry not in held status (no hold_source row)
// ==========================================================================

Deno.test('release: proceeds when entry has no hold_source (entry not found by hold_status query)', async () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440099'
  const supabase = {
    from(table: string) {
      if (table === 'entries') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            // Entry exists but hold_status is not 'held' — query returns null
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        insert() { return Promise.resolve({ error: null }) },
      }
      return chain
    },
    rpc() {
      // requestRelease RPC — returns a valid UUID release ID
      return Promise.resolve({
        data: '660e8400-e29b-41d4-a716-446655440001',
        error: null,
      })
    },
  } as any

  // When hold_status query returns null (no matching held entry), the authority
  // check is skipped and it proceeds to requestRelease. With execute_transfer=false
  // it should succeed without needing a provider.
  const result = await releaseHeldFundsResponse(
    req, supabase, ledger, { entry_id: validUuid, execute_transfer: false }, requestId, undefined, 'platform_api',
  )

  // Should NOT be 403 — authority check skipped when holdEntry is null
  assertEquals(result.status !== 403, true, `Expected non-403 but got ${result.status}`)
  // Should succeed since the RPC returned a valid UUID
  assertEquals(result.status, 200)
  const body = result.body as any
  assertEquals(body.success, true)
  assertEquals(body.release.executed, false)
})
