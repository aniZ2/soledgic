import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the supabase service module before importing the module under test
vi.mock('@/lib/supabase/service', () => ({
  getServerSupabaseUrl: () => { throw new Error('no env') },
  getServerServiceKey: () => { throw new Error('no env') },
}))

// Mock @supabase/ssr so the service client is never created
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { checkRateLimit, getRateLimitKey, getRouteLimit, ROUTE_LIMITS } from './rate-limit'
import { createServerClient } from '@supabase/ssr'

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/test', {
    headers,
  })
}

describe('getRateLimitKey', () => {
  it('returns user key when userId is provided', () => {
    const req = makeRequest()
    expect(getRateLimitKey(req, 'user_123')).toBe('user:user_123')
  })

  it('returns ip key from cf-connecting-ip header', () => {
    const req = makeRequest({ 'cf-connecting-ip': '1.2.3.4' })
    expect(getRateLimitKey(req)).toBe('ip:1.2.3.4')
  })

  it('returns ip key from x-real-ip when cf header is missing', () => {
    const req = makeRequest({ 'x-real-ip': '5.6.7.8' })
    expect(getRateLimitKey(req)).toBe('ip:5.6.7.8')
  })

  it('returns ip key from x-vercel-forwarded-for', () => {
    const req = makeRequest({ 'x-vercel-forwarded-for': '10.0.0.1' })
    expect(getRateLimitKey(req)).toBe('ip:10.0.0.1')
  })

  it('returns ip key from x-forwarded-for (first entry)', () => {
    const req = makeRequest({ 'x-forwarded-for': '9.8.7.6, 1.2.3.4' })
    expect(getRateLimitKey(req)).toBe('ip:9.8.7.6')
  })

  it('prefers cf-connecting-ip over x-forwarded-for', () => {
    const req = makeRequest({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
    })
    expect(getRateLimitKey(req)).toBe('ip:1.1.1.1')
  })

  it('returns ip:unknown when no IP headers are present', () => {
    const req = makeRequest()
    expect(getRateLimitKey(req)).toBe('ip:unknown')
  })

  it('prefers user ID over IP headers', () => {
    const req = makeRequest({ 'cf-connecting-ip': '1.1.1.1' })
    expect(getRateLimitKey(req, 'user_abc')).toBe('user:user_abc')
  })
})

describe('getRouteLimit', () => {
  it('returns exact match for known routes with correct values', () => {
    const authLimit = getRouteLimit('/api/auth')
    expect(authLimit.requests).toBe(10)
    expect(authLimit.windowMs).toBe(60000)
  })

  it('returns prefix match for sub-routes', () => {
    const authLogin = getRouteLimit('/api/auth/login')
    expect(authLogin.requests).toBe(10) // inherits from /api/auth
  })

  it('returns default config for unknown routes', () => {
    const unknown = getRouteLimit('/api/some-unknown-route')
    expect(unknown.requests).toBe(100)
    expect(unknown.windowMs).toBe(60000)
  })

  it('has different limits for different route groups', () => {
    expect(getRouteLimit('/api/auth').requests).toBeLessThan(getRouteLimit('/api/ledgers').requests)
    expect(getRouteLimit('/api/team').requests).toBe(30)
    expect(getRouteLimit('/api/organizations').requests).toBe(50)
  })
})

describe('checkRateLimit (in-memory fallback)', () => {
  // The mocked service module throws, so getServiceClient() returns null.
  // NODE_ENV is 'test' (not 'production'), so the in-memory fallback is used.

  beforeEach(() => {
    // Clear the in-memory store between tests by exhausting previous entries
    // There's no exported reset, so we use unique keys per test group.
  })

  it('allows the first request and returns exact remaining count', async () => {
    const before = Date.now()
    const result = await checkRateLimit(
      'test-user-first',
      '/api/test-first',
      { requests: 5, windowMs: 60000 }
    )
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4) // exactly requests - 1
    expect(result.remaining).not.toBe(5) // not requests itself
    expect(result.remaining).not.toBe(3) // not requests - 2
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000 - 10)
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60000 + 10)
  })

  it('decrements remaining count on each request', async () => {
    const key = 'test-user-decrement'
    const endpoint = '/api/test-decrement'
    const config = { requests: 3, windowMs: 60000 }

    const r1 = await checkRateLimit(key, endpoint, config)
    expect(r1.remaining).toBe(2)

    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.remaining).toBe(1)

    const r3 = await checkRateLimit(key, endpoint, config)
    expect(r3.remaining).toBe(0)
  })

  it('allows exactly N requests then blocks', async () => {
    const key = 'test-user-block'
    const endpoint = '/api/test-block'
    const config = { requests: 2, windowMs: 60000 }

    const r1 = await checkRateLimit(key, endpoint, config)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(1)

    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(0)

    const r3 = await checkRateLimit(key, endpoint, config)
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
    expect(r3.resetAt).toBeGreaterThan(Date.now() - 1000)
  })

  it('blocked response preserves resetAt from the window', async () => {
    const key = 'test-user-reset-persist'
    const endpoint = '/api/test-reset-persist'
    const config = { requests: 1, windowMs: 60000 }

    const r1 = await checkRateLimit(key, endpoint, config)
    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.allowed).toBe(false)
    // resetAt should match the original window, not be recalculated
    expect(r2.resetAt).toBe(r1.resetAt)
  })

  it('resets after window expires', async () => {
    const key = 'test-user-expire'
    const endpoint = '/api/test-expire'
    const config = { requests: 1, windowMs: 10 } // 10ms window

    await checkRateLimit(key, endpoint, config)

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 20))

    const result = await checkRateLimit(key, endpoint, config)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0) // requests(1) - count(1) = 0
  })

  it('scopes rate limits by endpoint', async () => {
    const key = 'test-user-scope'
    const config = { requests: 1, windowMs: 60000 }

    const r1 = await checkRateLimit(key, '/api/endpoint-a', config)
    expect(r1.allowed).toBe(true)

    // Same key, different endpoint — should be allowed
    const r2 = await checkRateLimit(key, '/api/endpoint-b', config)
    expect(r2.allowed).toBe(true)

    // Same key, same endpoint — should be blocked
    const r3 = await checkRateLimit(key, '/api/endpoint-a', config)
    expect(r3.allowed).toBe(false)
  })

  it('handles requests=1 edge case (single request allowed)', async () => {
    const key = 'test-user-single'
    const endpoint = '/api/test-single'
    const config = { requests: 1, windowMs: 60000 }

    const r1 = await checkRateLimit(key, endpoint, config)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(0) // requests(1) - count(1) = 0

    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.allowed).toBe(false)
    expect(r2.remaining).toBe(0)
  })

  it('uses default config when none provided (100 requests, 60000ms)', async () => {
    const key = 'test-user-default-config'
    const endpoint = '/api/test-default-config'

    // Call without explicit config — should use defaults
    const r1 = await checkRateLimit(key, endpoint)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(99) // default 100 - 1
  })

  it('blocked entry count exceeds requests (count > config.requests)', async () => {
    const key = 'test-user-exceed'
    const endpoint = '/api/test-exceed'
    const config = { requests: 1, windowMs: 60000 }

    await checkRateLimit(key, endpoint, config) // count=1
    const r2 = await checkRateLimit(key, endpoint, config) // count=2, > 1
    expect(r2.allowed).toBe(false)
    expect(r2.remaining).toBe(0)

    // Third request still blocked
    const r3 = await checkRateLimit(key, endpoint, config) // count=3, > 1
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
  })

  it('boundary: count === requests is still allowed, count > requests is blocked', async () => {
    const key = 'test-boundary-eq'
    const endpoint = '/api/test-boundary-eq'
    const config = { requests: 3, windowMs: 60000 }

    // count=1, allowed (1 <= 3)
    const r1 = await checkRateLimit(key, endpoint, config)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)

    // count=2, allowed (2 <= 3)
    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)

    // count=3, allowed (3 <= 3, NOT > 3)
    const r3 = await checkRateLimit(key, endpoint, config)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)

    // count=4, blocked (4 > 3)
    const r4 = await checkRateLimit(key, endpoint, config)
    expect(r4.allowed).toBe(false)
    expect(r4.remaining).toBe(0)
  })

  it('remaining is exactly config.requests - entry.count', async () => {
    const key = 'test-exact-remaining'
    const endpoint = '/api/test-exact-remaining'
    const config = { requests: 5, windowMs: 60000 }

    const r1 = await checkRateLimit(key, endpoint, config) // count=1
    expect(r1.remaining).toBe(4) // 5 - 1

    const r2 = await checkRateLimit(key, endpoint, config) // count=2
    expect(r2.remaining).toBe(3) // 5 - 2

    const r3 = await checkRateLimit(key, endpoint, config) // count=3
    expect(r3.remaining).toBe(2) // 5 - 3
  })

  it('resetAt on blocked response comes from original window, not recalculated', async () => {
    const key = 'test-reset-stable'
    const endpoint = '/api/test-reset-stable'
    const config = { requests: 1, windowMs: 60000 }

    const r1 = await checkRateLimit(key, endpoint, config)
    const originalResetAt = r1.resetAt

    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.resetAt).toBe(originalResetAt)

    const r3 = await checkRateLimit(key, endpoint, config)
    expect(r3.resetAt).toBe(originalResetAt)
  })

  it('new entry after expiration gets fresh resetAt', async () => {
    const key = 'test-fresh-reset'
    const endpoint = '/api/test-fresh-reset'
    const config = { requests: 1, windowMs: 10 }

    const r1 = await checkRateLimit(key, endpoint, config)

    await new Promise((resolve) => setTimeout(resolve, 20))

    const r2 = await checkRateLimit(key, endpoint, config)
    expect(r2.allowed).toBe(true)
    // resetAt should be different (fresh window)
    expect(r2.resetAt).toBeGreaterThan(r1.resetAt)
  })

  it('store key is endpoint:key format', async () => {
    // Test isolation: same key, different endpoints should be independent
    const config = { requests: 1, windowMs: 60000 }

    const r1 = await checkRateLimit('shared-key-x', '/ep-alpha', config)
    expect(r1.allowed).toBe(true)

    const r2 = await checkRateLimit('shared-key-x', '/ep-beta', config)
    expect(r2.allowed).toBe(true) // different endpoint, independent bucket
  })
})

describe('ROUTE_LIMITS values', () => {
  it('has correct values for /api/auth', () => {
    expect(ROUTE_LIMITS['/api/auth']).toEqual({ requests: 10, windowMs: 60000 })
  })

  it('has correct values for /api/ledgers', () => {
    expect(ROUTE_LIMITS['/api/ledgers']).toEqual({ requests: 100, windowMs: 60000 })
  })

  it('has correct values for /api/organizations', () => {
    expect(ROUTE_LIMITS['/api/organizations']).toEqual({ requests: 50, windowMs: 60000 })
  })

  it('has correct values for /api/team', () => {
    expect(ROUTE_LIMITS['/api/team']).toEqual({ requests: 30, windowMs: 60000 })
  })

  it('has correct values for default', () => {
    expect(ROUTE_LIMITS['default']).toEqual({ requests: 100, windowMs: 60000 })
  })
})

describe('getRouteLimit with all route prefixes', () => {
  it('returns /api/auth config for /api/auth/callback', () => {
    expect(getRouteLimit('/api/auth/callback').requests).toBe(10)
  })

  it('returns /api/ledgers config for /api/ledgers/123', () => {
    expect(getRouteLimit('/api/ledgers/123').requests).toBe(100)
  })

  it('returns /api/organizations config for /api/organizations/create', () => {
    expect(getRouteLimit('/api/organizations/create').requests).toBe(50)
  })

  it('returns /api/team config for /api/team/members', () => {
    expect(getRouteLimit('/api/team/members').requests).toBe(30)
  })

  it('returns default for completely unmatched route', () => {
    expect(getRouteLimit('/other/path').requests).toBe(100)
    expect(getRouteLimit('/other/path').windowMs).toBe(60000)
  })

  it('returns exact match over prefix match', () => {
    // /api/auth is an exact match — should return it directly
    const result = getRouteLimit('/api/auth')
    expect(result.requests).toBe(10)
  })
})

describe('checkRateLimit (Supabase RPC path)', () => {
  // To test the RPC path, we need a fresh module import with a working service client.
  // We use dynamic import + module reset to get an isolated instance.

  let mockRpc: ReturnType<typeof vi.fn>
  let checkRateLimitWithRpc: typeof checkRateLimit

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRpc = vi.fn()

    // Reset the cached service client by re-importing the module
    vi.resetModules()

    // Re-mock with working service functions
    vi.doMock('@/lib/supabase/service', () => ({
      getServerSupabaseUrl: () => 'https://test.supabase.co',
      getServerServiceKey: () => 'service-key',
    }))

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn(() => ({
        rpc: mockRpc,
      })),
    }))

    const mod = await import('./rate-limit')
    checkRateLimitWithRpc = mod.checkRateLimit
  })

  it('returns allowed=true when RPC returns allowed:true and blocked:false', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 5, reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
    expect(result.resetAt).toBe(new Date('2026-06-01T00:00:00Z').getTime())
  })

  it('returns allowed=false when RPC returns blocked:true', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 0, reset_at: '2026-06-01T00:00:00Z', blocked: true }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('returns allowed=false when RPC returns allowed:false', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('falls back to in-memory when RPC returns error in non-production', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC failed' },
    })

    const result = await checkRateLimitWithRpc('rpc-error-key', '/api/rpc-error', { requests: 10, windowMs: 60000 })
    // Should fall through to in-memory and allow the first request
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
  })

  it('fail-closed in production when RPC returns error', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC failed' },
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('fail-closed in production when RPC returns malformed data', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockRpc.mockResolvedValue({
      data: [{ unexpected: 'shape' }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('fail-closed in production when RPC throws an exception', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockRpc.mockRejectedValue(new Error('network error'))

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('falls back to in-memory when RPC throws in non-production', async () => {
    mockRpc.mockRejectedValue(new Error('network error'))

    const result = await checkRateLimitWithRpc('rpc-throw-key', '/api/rpc-throw', { requests: 5, windowMs: 60000 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('passes correct parameters to RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 9, reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    await checkRateLimitWithRpc('user:123', '/api/widgets', { requests: 50, windowMs: 120000 })
    expect(mockRpc).toHaveBeenCalledWith('check_rate_limit_secure', {
      p_key: 'user:123',
      p_endpoint: '/api/widgets',
      p_max_requests: 50,
      p_window_seconds: 120, // Math.ceil(120000 / 1000)
      p_fail_closed: false,
    })
  })

  it('windowSeconds is at least 1 even for very small windowMs', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 9, reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 100 })
    expect(mockRpc).toHaveBeenCalledWith('check_rate_limit_secure', expect.objectContaining({
      p_window_seconds: 1,
    }))
  })

  it('uses Math.max(0, remaining) so remaining is never negative', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: -5, reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.remaining).toBe(0)
    expect(result.remaining).not.toBe(-5)
  })

  it('sets remaining to 0 when not allowed (blocked)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: false, remaining: 5, reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('uses fallback resetAt when RPC reset_at is not a valid date', async () => {
    const before = Date.now()
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 5, reset_at: 'invalid-date', blocked: false }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000 - 10)
  })

  it('handles empty data array by falling through to in-memory in non-production', async () => {
    mockRpc.mockResolvedValue({
      data: [],
      error: null,
    })

    const result = await checkRateLimitWithRpc('empty-data-key', '/api/empty-data', { requests: 10, windowMs: 60000 })
    // row is null, no error, not prod -> falls through to in-memory
    expect(result.allowed).toBe(true)
  })

  it('handles data that is not an array by falling through', async () => {
    mockRpc.mockResolvedValue({
      data: { allowed: true },
      error: null,
    })

    const result = await checkRateLimitWithRpc('non-array-key', '/api/non-array', { requests: 10, windowMs: 60000 })
    // Array.isArray(data) is false, so row is null -> falls through
    expect(result.allowed).toBe(true)
  })

  it('remaining defaults to 0 when row.remaining is not a number', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 'five', reset_at: '2026-06-01T00:00:00Z', blocked: false }],
      error: null,
    })

    const result = await checkRateLimitWithRpc('user:1', '/api/test', { requests: 10, windowMs: 60000 })
    expect(result.remaining).toBe(0)
  })
})
