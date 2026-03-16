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
  it('returns exact match for known routes', () => {
    expect(getRouteLimit('/api/auth')).toEqual(ROUTE_LIMITS['/api/auth'])
  })

  it('returns prefix match for sub-routes', () => {
    expect(getRouteLimit('/api/auth/login')).toEqual(ROUTE_LIMITS['/api/auth'])
  })

  it('returns default config for unknown routes', () => {
    expect(getRouteLimit('/api/some-unknown-route')).toEqual(ROUTE_LIMITS['default'])
  })
})

describe('checkRateLimit (in-memory fallback)', () => {
  // The mocked service module throws, so getServiceClient() returns null.
  // NODE_ENV is 'test' (not 'production'), so the in-memory fallback is used.

  beforeEach(() => {
    // Clear the in-memory store between tests by exhausting previous entries
    // There's no exported reset, so we use unique keys per test group.
  })

  it('allows the first request within the window', async () => {
    const result = await checkRateLimit(
      'test-user-first',
      '/api/test-first',
      { requests: 5, windowMs: 60000 }
    )
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000)
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

  it('blocks requests after limit is exceeded', async () => {
    const key = 'test-user-block'
    const endpoint = '/api/test-block'
    const config = { requests: 2, windowMs: 60000 }

    await checkRateLimit(key, endpoint, config)
    await checkRateLimit(key, endpoint, config)
    const r3 = await checkRateLimit(key, endpoint, config)

    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
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
})
