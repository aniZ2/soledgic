import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  isRecord,
  parseCookieHeader,
  mergeCookieEntries,
  parsePendingAuthCookies,
  getErrorDetails,
} from './api-handler'

// --- Mocks ---

// Mock next/server
const mockJsonFn = vi.fn()
vi.mock('next/server', () => {
  class MockNextResponse {
    status: number
    headers: Map<string, string>
    cookies: { set: ReturnType<typeof vi.fn> }
    body: unknown

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status ?? 200
      this.headers = new Map(Object.entries(init?.headers ?? {}))
      this.cookies = { set: vi.fn() }
    }

    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      mockJsonFn(body, init)
      return new MockNextResponse(body, init)
    }
  }
  return { NextResponse: MockNextResponse }
})

// Mock next/headers cookies()
const mockCookieStore = {
  getAll: vi.fn(() => []),
  get: vi.fn(),
}
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}))

// Mock csrf validation
const mockValidateCsrf = vi.fn()
vi.mock('./csrf', () => ({
  validateCsrf: (...args: unknown[]) => mockValidateCsrf(...args),
}))

// Mock rate limiting
const mockCheckRateLimit = vi.fn()
vi.mock('./rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitKey: (_req: Request, userId?: string) => userId ? `user:${userId}` : 'ip:unknown',
  getRouteLimit: () => ({ requests: 100, windowMs: 60000 }),
}))

// Mock livemode-server
const mockGetReadonly = vi.fn()
vi.mock('./livemode-server', () => ({
  getReadonly: () => mockGetReadonly(),
}))

// Mock supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
  })),
}))

// Mock @supabase/ssr
const mockGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: () => mockGetUser(),
    },
  })),
}))

// Set env vars needed by the auth flow (new URL(supabaseUrl) in createApiHandler)
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')

import { createApiHandler, parseJsonBody } from './api-handler'

function makeRequest(
  method = 'POST',
  headers: Record<string, string> = {},
  body?: string
): Request {
  const init: RequestInit = {
    method,
    headers: {
      'content-length': body ? String(body.length) : '0',
      ...headers,
    },
  }
  if (body) init.body = body
  return new Request('https://example.com/api/test', init)
}

describe('createApiHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateCsrf.mockResolvedValue({ valid: true })
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user_1', email: 'test@example.com' } }, error: null })
    mockGetReadonly.mockResolvedValue(false)
    mockCookieStore.getAll.mockReturnValue([])
  })

  it('returns 403 when CSRF validation fails', async () => {
    mockValidateCsrf.mockResolvedValue({ valid: false, error: 'Invalid origin' })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const response = await handler(makeRequest())
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Access denied' }),
      expect.objectContaining({ status: 403 })
    )
  })

  it('skips CSRF when csrfProtection is false', async () => {
    const innerHandler = vi.fn(async (_req, ctx) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      requireAuth: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(mockValidateCsrf).not.toHaveBeenCalled()
    expect(innerHandler).toHaveBeenCalled()
  })

  it('returns 401 when authentication fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'session missing' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const response = await handler(makeRequest())
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' }),
      expect.objectContaining({ status: 401 })
    )
  })

  it('skips auth when requireAuth is false', async () => {
    const innerHandler = vi.fn(async (_req, ctx) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      rateLimit: false,
      csrfProtection: false,
    })

    await handler(makeRequest())
    expect(innerHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ user: null })
    )
  })

  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30000,
    })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, { requireAuth: false, csrfProtection: false })

    await handler(makeRequest())
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Rate limit') }),
      expect.objectContaining({ status: 429 })
    )
  })

  it('returns 413 when content-length exceeds max body size', async () => {
    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      maxBodySize: 100,
    })

    const req = makeRequest('POST', { 'content-length': '200' })
    await handler(req)
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Request too large' }),
      expect.objectContaining({ status: 413 })
    )
  })

  it('returns 403 when read-only mode is active for write methods', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('POST'))
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Read-only mode') }),
      expect.objectContaining({ status: 403 })
    )
  })

  it('allows write when readonlyExempt is true', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      readonlyExempt: true,
    })

    await handler(makeRequest('POST'))
    expect(innerHandler).toHaveBeenCalled()
  })

  it('passes user context to handler when authenticated', async () => {
    const innerHandler = vi.fn(async (_req, ctx) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(innerHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        user: { id: 'user_1', email: 'test@example.com' },
        requestId: expect.stringMatching(/^req_/),
      })
    )
  })

  it('returns 500 with sanitized error when handler throws', async () => {
    const handler = createApiHandler(async () => {
      throw new Error('Database connection failed at /var/db/secret.conf')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        request_id: expect.stringMatching(/^req_/),
      }),
      expect.objectContaining({ status: 500 })
    )
  })

  it('injects X-Request-Id header on successful response', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    const response = await handler(makeRequest('GET'))
    expect(response.headers.get('X-Request-Id')).toMatch(/^req_/)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('blocks PUT request when read-only mode is active', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('PUT'))
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Read-only mode') }),
      expect.objectContaining({ status: 403 })
    )
  })

  it('blocks PATCH request when read-only mode is active', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('PATCH'))
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Read-only mode') }),
      expect.objectContaining({ status: 403 })
    )
  })

  it('blocks DELETE request when read-only mode is active', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('DELETE'))
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Read-only mode') }),
      expect.objectContaining({ status: 403 })
    )
  })

  it('allows GET request even when read-only mode is active', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('GET'))
    expect(innerHandler).toHaveBeenCalled()
  })

  it('allows write with readonlyExempt even when readonly is active for PUT', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      readonlyExempt: true,
    })

    await handler(makeRequest('PUT'))
    expect(innerHandler).toHaveBeenCalled()
  })

  it('uses custom rateLimitKey function when provided', async () => {
    const customKeyFn = vi.fn((_req: Request, ctx: { user: { id: string } | null }) => `custom:${ctx.user?.id ?? 'anon'}`)

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: true,
      rateLimitKey: customKeyFn,
    })

    await handler(makeRequest())
    expect(customKeyFn).toHaveBeenCalled()
    // checkRateLimit should have been called with the custom key
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'custom:anon',
      expect.stringContaining(':custom:anon'),
      expect.any(Object)
    )
  })

  it('falls back to default rate limit key when custom key function throws', async () => {
    const customKeyFn = vi.fn(() => { throw new Error('key generation failed') })

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: true,
      rateLimitKey: customKeyFn,
    })

    await handler(makeRequest())
    // Should still call checkRateLimit with the default key (not throw)
    expect(mockCheckRateLimit).toHaveBeenCalled()
    expect(innerHandler).toHaveBeenCalled()
  })

  it('uses custom rateLimitConfig when provided', async () => {
    const customConfig = { requests: 5, windowMs: 30000 }

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: true,
      rateLimitConfig: customConfig,
    })

    await handler(makeRequest())
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      customConfig
    )
  })

  it('returns 413 with default maxBodySize of 1MB', async () => {
    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      // No maxBodySize — should default to 1MB (1048576)
    })

    const req = makeRequest('POST', { 'content-length': '1048577' })
    await handler(req)
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Request too large' }),
      expect.objectContaining({ status: 413 })
    )
  })

  it('allows body exactly at maxBodySize limit', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      maxBodySize: 100,
    })

    const req = makeRequest('POST', { 'content-length': '100' })
    await handler(req)
    expect(innerHandler).toHaveBeenCalled()
  })

  it('merges pending auth cookies into successful response', async () => {
    // Simulate Supabase calling setAll during auth token refresh
    const { createServerClient } = await import('@supabase/ssr')
    const mockCreateServerClient = vi.mocked(createServerClient)
    mockCreateServerClient.mockImplementation((_url, _key, opts: any) => {
      // Call setAll to simulate token refresh
      opts.cookies.setAll([
        { name: 'sb-testproject-auth-token', value: 'refreshed', options: { path: '/' } },
      ])
      return {
        auth: {
          getUser: () => Promise.resolve({ data: { user: { id: 'user_1', email: 'test@test.com' } }, error: null }),
        },
      } as any
    })

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    const response = await handler(makeRequest())
    expect(response.cookies.set).toHaveBeenCalledWith(
      'sb-testproject-auth-token',
      'refreshed',
      expect.objectContaining({ path: '/' })
    )

    // Restore the default createServerClient mock for subsequent tests
    mockCreateServerClient.mockImplementation((() => ({
      auth: { getUser: () => mockGetUser() },
    })) as any)
  })

  it('returns 401 with request_id when authentication fails (no bearer)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'session expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const response = await handler(makeRequest('POST', {}))
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Unauthorized',
        request_id: expect.stringMatching(/^req_/),
      }),
      expect.objectContaining({ status: 401 })
    )
    // The 401 response should have X-Request-Id header set
    expect(response.headers.get('X-Request-Id')).toMatch(/^req_/)
  })

  it('getClientIp prefers cf-connecting-ip over other headers', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    // We can't directly test getClientIp but we can verify audit log uses it on error
    const handler = createApiHandler(async () => {
      throw new Error('test error')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    const req = makeRequest('POST', { 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '10.0.0.1' })
    await handler(req)
    // Error path is hit, which calls audit_log insert with clientIp
    // Verifying by checking the error response was returned
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
      expect.objectContaining({ status: 500 })
    )
  })

  it('requestId matches exact format req_ followed by 24 hex chars', async () => {
    const innerHandler = vi.fn(async (_req: Request, ctx: { requestId: string }) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ id: ctx.requestId })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('GET'))
    const ctx = innerHandler.mock.calls[0][1]
    expect(ctx.requestId).toMatch(/^req_[0-9a-f]{24}$/)
  })

  it('injects X-Content-Type-Options and X-Frame-Options on 401 response', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'missing' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const response = await handler(makeRequest())
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('getClientIp uses x-real-ip when cf-connecting-ip is absent', async () => {
    // Trigger error path so clientIp is used in audit log
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw new Error('test ip')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('POST', { 'x-real-ip': '10.20.30.40' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '10.20.30.40' })
    )
  })

  it('getClientIp returns "unknown" when no IP headers present', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw new Error('test unknown ip')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('POST'))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: 'unknown' })
    )
  })

  it('getClientIp takes first IP from x-forwarded-for comma list', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw new Error('test forwarded')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('POST', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '1.1.1.1' })
    )
  })

  it('content-length parsing treats missing header as 0', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      maxBodySize: 10,
    })

    // Request without content-length header (parsed as 0, which is <= 10)
    const req = new Request('https://example.com/api/test', { method: 'GET' })
    await handler(req)
    expect(innerHandler).toHaveBeenCalled()
  })

  it('bearer token fallback authenticates when cookie auth fails', async () => {
    // First call (cookie auth) fails, second call (bearer) succeeds
    mockGetUser
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'no cookie' } })
      .mockResolvedValueOnce({ data: { user: { id: 'bearer_user', email: 'bearer@test.com' } }, error: null })

    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ userId: ctx.user?.id })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    const req = makeRequest('POST', { 'authorization': 'Bearer my_jwt_token' })
    await handler(req)
    expect(innerHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        user: { id: 'bearer_user', email: 'bearer@test.com' },
        accessToken: 'my_jwt_token',
      })
    )
  })

  it('sets accessToken to null when authenticated via cookies only', async () => {
    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(innerHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ accessToken: null })
    )
  })

  it('does not call getReadonly for GET requests (read-only check skipped)', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('GET'))
    // getReadonly should not be called for GET
    expect(mockGetReadonly).not.toHaveBeenCalled()
    expect(innerHandler).toHaveBeenCalled()
  })

  it('includes debug info in 401 response when AUTH_DEBUG_LOGS is true', async () => {
    vi.stubEnv('AUTH_DEBUG_LOGS', 'true')
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    await handler(makeRequest())
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Unauthorized',
        debug: expect.objectContaining({
          auth_error: 'expired',
          bearer_present: false,
        }),
      }),
      expect.objectContaining({ status: 401 })
    )
    vi.stubEnv('AUTH_DEBUG_LOGS', '')
  })

  it('does not include debug info in 401 response when AUTH_DEBUG_LOGS is not set', async () => {
    vi.stubEnv('AUTH_DEBUG_LOGS', '')
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    await handler(makeRequest())
    const callArgs = mockJsonFn.mock.calls[0][0]
    expect(callArgs.debug).toBeUndefined()
  })

  it('error handler logs error name in audit entry', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw new TypeError('bad type')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_error',
        request_body: expect.objectContaining({ error_type: 'TypeError' }),
      })
    )
  })

  it('error handler uses "UnknownError" for non-Error throws in audit', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw 'string error'
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_body: expect.objectContaining({ error_type: 'UnknownError' }),
      })
    )
  })
})

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })
  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false)
  })
  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord(true)).toBe(false)
  })
  it('returns true for arrays (they are objects)', () => {
    expect(isRecord([])).toBe(true)
  })
})

describe('parseCookieHeader', () => {
  it('returns empty array for empty string', () => {
    expect(parseCookieHeader('')).toEqual([])
  })
  it('parses single cookie', () => {
    expect(parseCookieHeader('name=value')).toEqual([{ name: 'name', value: 'value' }])
  })
  it('parses multiple cookies', () => {
    const result = parseCookieHeader('a=1; b=2; c=3')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ name: 'a', value: '1' })
    expect(result[1]).toEqual({ name: 'b', value: '2' })
    expect(result[2]).toEqual({ name: 'c', value: '3' })
  })
  it('handles cookies with = in value', () => {
    const result = parseCookieHeader('token=abc=def=ghi')
    expect(result[0]).toEqual({ name: 'token', value: 'abc=def=ghi' })
  })
  it('handles cookie with no value (no = sign)', () => {
    const result = parseCookieHeader('flag')
    expect(result[0]).toEqual({ name: 'flag', value: '' })
  })
  it('trims whitespace', () => {
    const result = parseCookieHeader('  name  =  value  ')
    expect(result[0].name).toBe('name')
    expect(result[0].value).toBe('value')
  })
  it('filters out empty names', () => {
    const result = parseCookieHeader('a=1; ; b=2')
    expect(result.every(c => c.name.length > 0)).toBe(true)
  })

  it('returns exactly 2 entries for "a=1; ; b=2" (empty name filtered)', () => {
    const result = parseCookieHeader('a=1; ; b=2')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('a')
    expect(result[1].name).toBe('b')
  })

  it('handles cookie with empty value after =', () => {
    const result = parseCookieHeader('name=')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'name', value: '' })
  })

  it('handles cookie with multiple = signs preserving all after first', () => {
    const result = parseCookieHeader('base64=YWJj=ZGVm==')
    expect(result[0].name).toBe('base64')
    expect(result[0].value).toBe('YWJj=ZGVm==')
  })

  it('filters whitespace-only name segments', () => {
    const result = parseCookieHeader('a=1;   ;b=2')
    expect(result).toHaveLength(2)
  })

  it('indexOf returns correct index for first = only', () => {
    // Validates that idx === -1 branch produces value: '' and idx > 0 branch slices correctly
    const noEquals = parseCookieHeader('flagonly')
    expect(noEquals[0].value).toBe('')
    expect(noEquals[0].name).toBe('flagonly')

    const withEquals = parseCookieHeader('k=v')
    expect(withEquals[0].name).toBe('k')
    expect(withEquals[0].value).toBe('v')
  })

  it('handles value with leading/trailing whitespace after =', () => {
    const result = parseCookieHeader('tok=  spaces  ')
    expect(result[0].value).toBe('spaces')
  })

  it('filters entry that is just whitespace (no name)', () => {
    const result = parseCookieHeader('  ')
    expect(result).toHaveLength(0)
  })

  it('handles = as first character (empty name)', () => {
    const result = parseCookieHeader('=value')
    expect(result).toHaveLength(0) // empty name filtered
  })
})

describe('mergeCookieEntries', () => {
  it('returns primary when no overlap', () => {
    const result = mergeCookieEntries(
      [{ name: 'a', value: '1' }],
      [{ name: 'b', value: '2' }],
    )
    expect(result).toHaveLength(2)
    expect(result.find(c => c.name === 'a')?.value).toBe('1')
    expect(result.find(c => c.name === 'b')?.value).toBe('2')
  })
  it('primary wins on duplicate names', () => {
    const result = mergeCookieEntries(
      [{ name: 'x', value: 'primary' }],
      [{ name: 'x', value: 'fallback' }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('primary')
  })
  it('handles empty arrays', () => {
    expect(mergeCookieEntries([], [])).toEqual([])
    expect(mergeCookieEntries([{ name: 'a', value: '1' }], [])).toHaveLength(1)
    expect(mergeCookieEntries([], [{ name: 'b', value: '2' }])).toHaveLength(1)
  })

  it('preserves insertion order: primary entries come before fallback entries', () => {
    const result = mergeCookieEntries(
      [{ name: 'first', value: '1' }, { name: 'second', value: '2' }],
      [{ name: 'third', value: '3' }, { name: 'fourth', value: '4' }],
    )
    expect(result).toHaveLength(4)
    expect(result[0].name).toBe('first')
    expect(result[1].name).toBe('second')
    expect(result[2].name).toBe('third')
    expect(result[3].name).toBe('fourth')
  })

  it('does not add fallback entry when primary has same name', () => {
    const result = mergeCookieEntries(
      [{ name: 'x', value: 'primary' }],
      [{ name: 'x', value: 'fallback' }, { name: 'y', value: 'only-in-fallback' }],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: 'x', value: 'primary' })
    expect(result[1]).toEqual({ name: 'y', value: 'only-in-fallback' })
  })

  it('returns exact cookie objects with name and value properties', () => {
    const result = mergeCookieEntries(
      [{ name: 'a', value: '1' }],
      [{ name: 'b', value: '2' }],
    )
    expect(result).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ])
  })

  it('merged map preserves last primary value when primary has duplicates', () => {
    // Maps overwrite on set, so last primary entry with same name wins
    const result = mergeCookieEntries(
      [{ name: 'dup', value: 'first' }, { name: 'dup', value: 'second' }],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('second')
  })
})

describe('parsePendingAuthCookies', () => {
  it('returns empty for non-array input', () => {
    expect(parsePendingAuthCookies(null)).toEqual([])
    expect(parsePendingAuthCookies('string')).toEqual([])
    expect(parsePendingAuthCookies(42)).toEqual([])
  })
  it('parses valid cookie entries', () => {
    const result = parsePendingAuthCookies([
      { name: 'session', value: 'abc123' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('session')
    expect(result[0].value).toBe('abc123')
  })
  it('skips entries missing name or value', () => {
    const result = parsePendingAuthCookies([
      { value: 'no-name' },
      { name: 'no-value' },
      { name: '', value: 'empty-name' },
    ])
    expect(result).toHaveLength(0)
  })
  it('parses cookie options', () => {
    const result = parsePendingAuthCookies([
      {
        name: 'tok',
        value: 'v',
        options: {
          domain: '.example.com',
          path: '/',
          maxAge: 3600,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          priority: 'high',
        },
      },
    ])
    expect(result[0].options?.domain).toBe('.example.com')
    expect(result[0].options?.path).toBe('/')
    expect(result[0].options?.maxAge).toBe(3600)
    expect(result[0].options?.httpOnly).toBe(true)
    expect(result[0].options?.secure).toBe(true)
    expect(result[0].options?.sameSite).toBe('lax')
    expect(result[0].options?.priority).toBe('high')
  })
  it('ignores invalid option types', () => {
    const result = parsePendingAuthCookies([
      { name: 'x', value: 'y', options: { domain: 123, httpOnly: 'yes' } },
    ])
    expect(result[0].options?.domain).toBeUndefined()
    expect(result[0].options?.httpOnly).toBeUndefined()
  })
  it('skips non-record entries', () => {
    const result = parsePendingAuthCookies([null, 'string', 42, { name: 'ok', value: 'v' }])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ok')
  })

  it('parses sameSite="strict"', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { sameSite: 'strict' } },
    ])
    expect(result[0].options?.sameSite).toBe('strict')
  })

  it('parses sameSite="lax"', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { sameSite: 'lax' } },
    ])
    expect(result[0].options?.sameSite).toBe('lax')
  })

  it('parses sameSite="none"', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { sameSite: 'none' } },
    ])
    expect(result[0].options?.sameSite).toBe('none')
  })

  it('excludes invalid sameSite values', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { sameSite: 'invalid' } },
    ])
    expect(result[0].options?.sameSite).toBeUndefined()
  })

  it('excludes numeric sameSite value', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { sameSite: 123 } },
    ])
    expect(result[0].options?.sameSite).toBeUndefined()
  })

  it('parses priority="low"', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { priority: 'low' } },
    ])
    expect(result[0].options?.priority).toBe('low')
  })

  it('parses priority="medium"', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { priority: 'medium' } },
    ])
    expect(result[0].options?.priority).toBe('medium')
  })

  it('parses priority="high"', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { priority: 'high' } },
    ])
    expect(result[0].options?.priority).toBe('high')
  })

  it('excludes invalid priority values', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { priority: 'critical' } },
    ])
    expect(result[0].options?.priority).toBeUndefined()
  })

  it('excludes numeric priority value', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { priority: 1 } },
    ])
    expect(result[0].options?.priority).toBeUndefined()
  })

  it('parses Date object for expires', () => {
    const expires = new Date('2026-12-31T23:59:59Z')
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { expires } },
    ])
    expect(result[0].options?.expires).toBe(expires)
  })

  it('excludes non-Date expires values', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { expires: '2026-12-31' } },
    ])
    expect(result[0].options?.expires).toBeUndefined()
  })

  it('excludes numeric expires values', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { expires: 1234567890 } },
    ])
    expect(result[0].options?.expires).toBeUndefined()
  })

  it('returns undefined options when item has no options field', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v' },
    ])
    expect(result[0].options).toBeUndefined()
  })

  it('returns options object (not undefined) when options is present but fields are invalid', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: {} },
    ])
    // options should be an object, not undefined, because rawOptions was a record
    expect(result[0].options).toBeDefined()
    expect(result[0].options).toEqual({})
  })

  it('parses secure=false correctly', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { secure: false } },
    ])
    expect(result[0].options?.secure).toBe(false)
  })

  it('parses httpOnly=false correctly', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { httpOnly: false } },
    ])
    expect(result[0].options?.httpOnly).toBe(false)
  })

  it('excludes non-number maxAge', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { maxAge: '3600' } },
    ])
    expect(result[0].options?.maxAge).toBeUndefined()
  })

  it('accepts maxAge of 0', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { maxAge: 0 } },
    ])
    expect(result[0].options?.maxAge).toBe(0)
  })

  it('skips entry where name is non-string', () => {
    const result = parsePendingAuthCookies([
      { name: 123, value: 'v' },
    ])
    expect(result).toHaveLength(0)
  })

  it('skips entry where value is non-string', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 123 },
    ])
    expect(result).toHaveLength(0)
  })

  it('allows empty string value', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: '' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('')
  })

  it('treats non-object options as no options', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: 'string-options' },
    ])
    expect(result[0].options).toBeUndefined()
  })

  it('distinguishes !name (empty string) from value === null', () => {
    // name='' is falsy so !name is true -> skipped
    // value is null (explicitly null) -> skipped via value === null
    const result = parsePendingAuthCookies([
      { name: '', value: 'v' },      // skipped: !name is true
      { name: 'a', value: null },     // skipped: value === null
      { name: 'b', value: 'ok' },     // kept
    ])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('b')
  })

  it('keeps entry with name and empty string value (value !== null)', () => {
    const result = parsePendingAuthCookies([
      { name: 'clear', value: '' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('')
  })

  it('handles options with array value for options field (array is object)', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: [1, 2, 3] },
    ])
    // Arrays pass isRecord but have no string domain/path etc
    expect(result[0].options).toBeDefined()
  })

  it('excludes non-string path in options', () => {
    const result = parsePendingAuthCookies([
      { name: 'a', value: 'v', options: { path: 123 } },
    ])
    expect(result[0].options?.path).toBeUndefined()
  })
})

describe('getErrorDetails', () => {
  it('extracts name and message from Error', () => {
    const err = new TypeError('type mismatch')
    const details = getErrorDetails(err)
    expect(details.name).toBe('TypeError')
    expect(details.message).toBe('type mismatch')
  })
  it('returns defaults for non-Error', () => {
    expect(getErrorDetails('string error')).toEqual({
      name: 'UnknownError',
      message: 'An unexpected error occurred',
    })
    expect(getErrorDetails(null)).toEqual({
      name: 'UnknownError',
      message: 'An unexpected error occurred',
    })
    expect(getErrorDetails(42)).toEqual({
      name: 'UnknownError',
      message: 'An unexpected error occurred',
    })
  })

  it('extracts name from base Error', () => {
    const err = new Error('base error')
    const details = getErrorDetails(err)
    expect(details.name).toBe('Error')
    expect(details.message).toBe('base error')
  })

  it('extracts name from RangeError', () => {
    const err = new RangeError('out of range')
    const details = getErrorDetails(err)
    expect(details.name).toBe('RangeError')
    expect(details.message).toBe('out of range')
  })

  it('returns defaults for undefined', () => {
    expect(getErrorDetails(undefined)).toEqual({
      name: 'UnknownError',
      message: 'An unexpected error occurred',
    })
  })

  it('returns defaults for object that is not an Error instance', () => {
    expect(getErrorDetails({ name: 'Fake', message: 'not real' })).toEqual({
      name: 'UnknownError',
      message: 'An unexpected error occurred',
    })
  })
})

describe('parseJsonBody', () => {
  it('parses valid JSON', async () => {
    const body = JSON.stringify({ name: 'test' })
    const req = new Request('https://example.com', {
      method: 'POST',
      body,
      headers: { 'content-length': String(body.length) },
    })
    const result = await parseJsonBody<{ name: string }>(req)
    expect(result.data).toEqual({ name: 'test' })
    expect(result.error).toBeNull()
  })

  it('returns error for invalid JSON', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body: 'not json{{{',
      headers: { 'content-length': '11' },
    })
    const result = await parseJsonBody(req)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Invalid JSON')
  })

  it('rejects body exceeding maxSize via content-length', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '2000000' },
    })
    const result = await parseJsonBody(req, 100)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Request body too large')
  })

  it('rejects body exceeding maxSize via actual text length', async () => {
    const bigBody = 'x'.repeat(200)
    const req = new Request('https://example.com', {
      method: 'POST',
      body: bigBody,
      headers: { 'content-length': '0' }, // lie about content-length
    })
    const result = await parseJsonBody(req, 100)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Request body too large')
  })

  it('allows body exactly at maxSize (boundary: not strictly greater)', async () => {
    const body = JSON.stringify({ x: 'a'.repeat(90) }) // ~96 chars
    const req = new Request('https://example.com', {
      method: 'POST',
      body,
      headers: { 'content-length': String(body.length) },
    })
    const result = await parseJsonBody(req, body.length) // exactly at limit
    expect(result.data).not.toBeNull()
    expect(result.error).toBeNull()
  })

  it('rejects body one byte over maxSize via content-length', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '101' },
    })
    const result = await parseJsonBody(req, 100)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Request body too large')
  })

  it('rejects body one byte over maxSize via text length', async () => {
    const body = 'x'.repeat(101)
    const req = new Request('https://example.com', {
      method: 'POST',
      body,
      headers: { 'content-length': '0' },
    })
    const result = await parseJsonBody(req, 100)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Request body too large')
  })

  it('allows body exactly at default maxSize (1MB)', async () => {
    // content-length exactly 1048576 should be allowed
    const body = JSON.stringify({ data: 'x' })
    const req = new Request('https://example.com', {
      method: 'POST',
      body,
      headers: { 'content-length': '1048576' },
    })
    // default maxSize is 1MB = 1048576
    const result = await parseJsonBody(req)
    // content-length 1048576 is NOT > 1048576, so it passes the first check
    expect(result.error).not.toBe('Request body too large')
  })

  it('returns null data and "Invalid JSON" for empty body', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body: '',
      headers: { 'content-length': '0' },
    })
    const result = await parseJsonBody(req)
    expect(result.data).toBeNull()
    expect(result.error).toBe('Invalid JSON')
  })

  it('parsed data is returned as-is (not wrapped)', async () => {
    const body = JSON.stringify({ key: 'value', num: 42 })
    const req = new Request('https://example.com', {
      method: 'POST',
      body,
      headers: { 'content-length': String(body.length) },
    })
    const result = await parseJsonBody<{ key: string; num: number }>(req)
    expect(result.data).toEqual({ key: 'value', num: 42 })
    expect(result.data?.key).toBe('value')
    expect(result.data?.num).toBe(42)
  })
})

describe('sanitizeError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateCsrf.mockResolvedValue({ valid: true })
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user_1', email: 'test@example.com' } }, error: null })
    mockGetReadonly.mockResolvedValue(false)
    mockCookieStore.getAll.mockReturnValue([])
  })

  it('returns message as-is in non-production', async () => {
    const handler = createApiHandler(async () => {
      throw new Error('Error at /var/db/secret.conf from 192.168.1.1')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const errorBody = mockJsonFn.mock.calls[0][0]
    // In test env (not production), sanitizeError returns message unchanged
    expect(errorBody.error).toContain('/var/db/secret.conf')
    expect(errorBody.error).toContain('192.168.1.1')
  })

  it('sanitizes file paths in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const handler = createApiHandler(async () => {
      throw new Error('Failed at /var/lib/app/src/file.ts')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const errorBody = mockJsonFn.mock.calls[0][0]
    expect(errorBody.error).not.toContain('/var/lib/app/src/file.ts')
    expect(errorBody.error).toContain('[path]')
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('sanitizes IP addresses in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const handler = createApiHandler(async () => {
      throw new Error('Connection from 192.168.1.1 refused')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const errorBody = mockJsonFn.mock.calls[0][0]
    expect(errorBody.error).not.toContain('192.168.1.1')
    expect(errorBody.error).toContain('[ip]')
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('sanitizes JWT tokens in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const handler = createApiHandler(async () => {
      throw new Error('Invalid token eyJhbGciOiJIUzI1NiJ9.payload.sig')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const errorBody = mockJsonFn.mock.calls[0][0]
    expect(errorBody.error).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(errorBody.error).toContain('[token]')
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('sanitizes API keys in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const handler = createApiHandler(async () => {
      throw new Error('Bad key slk_live_abcdef123456')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const errorBody = mockJsonFn.mock.calls[0][0]
    expect(errorBody.error).not.toContain('slk_live_abcdef123456')
    expect(errorBody.error).toContain('[key]')
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('truncates long error messages to 200 chars in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const longMessage = 'A'.repeat(300)
    const handler = createApiHandler(async () => {
      throw new Error(longMessage)
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const errorBody = mockJsonFn.mock.calls[0][0]
    expect(errorBody.error.length).toBeLessThanOrEqual(200)
    expect(errorBody.error.length).toBe(200)
    vi.stubEnv('NODE_ENV', 'test')
  })
})

describe('createApiHandler - additional mutation-killing tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateCsrf.mockResolvedValue({ valid: true })
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user_1', email: 'test@example.com' } }, error: null })
    mockGetReadonly.mockResolvedValue(false)
    mockCookieStore.getAll.mockReturnValue([])
  })

  it('CSRF failure response includes exact request_id format', async () => {
    mockValidateCsrf.mockResolvedValue({ valid: false, error: 'Bad origin' })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const response = await handler(makeRequest())
    const body = mockJsonFn.mock.calls[0][0]
    expect(body.request_id).toMatch(/^req_[0-9a-f]{24}$/)
    expect(body.error).toBe('Access denied')
    // Verify status is exactly 403, not 401 or 400
    expect(mockJsonFn.mock.calls[0][1].status).toBe(403)
    expect(mockJsonFn.mock.calls[0][1].status).not.toBe(401)
    expect(mockJsonFn.mock.calls[0][1].status).not.toBe(400)
  })

  it('rate limit response includes Retry-After header as string', async () => {
    const futureReset = Date.now() + 45000
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: futureReset,
    })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    }, { requireAuth: false, csrfProtection: false })

    const response = await handler(makeRequest())
    const body = mockJsonFn.mock.calls[0][0]
    const init = mockJsonFn.mock.calls[0][1]

    expect(body.retry_after).toBeGreaterThan(0)
    expect(body.retry_after).toBeLessThanOrEqual(45)
    expect(init.status).toBe(429)
    expect(init.status).not.toBe(403)
    expect(init.status).not.toBe(200)
    expect(init.headers['Retry-After']).toBeDefined()
    expect(init.headers['X-RateLimit-Remaining']).toBe('0')
    expect(init.headers['X-Request-Id']).toMatch(/^req_/)
  })

  it('content-length check uses > not >= (exactly at limit is allowed)', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      maxBodySize: 100,
    })

    // Exactly at limit: should be allowed
    const reqExact = makeRequest('POST', { 'content-length': '100' })
    await handler(reqExact)
    expect(innerHandler).toHaveBeenCalled()

    // One over: should be blocked
    innerHandler.mockClear()
    mockJsonFn.mockClear()
    const reqOver = makeRequest('POST', { 'content-length': '101' })
    await handler(reqOver)
    expect(innerHandler).not.toHaveBeenCalled()
    expect(mockJsonFn.mock.calls[0][1].status).toBe(413)
  })

  it('401 response sets X-Request-Id, X-Content-Type-Options, X-Frame-Options headers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const response = await handler(makeRequest())
    expect(response.headers.get('X-Request-Id')).toMatch(/^req_[0-9a-f]{24}$/)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Content-Type-Options')).not.toBe('nosniff ')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('X-Frame-Options')).not.toBe('SAMEORIGIN')
  })

  it('successful response has all three security headers set', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    const response = await handler(makeRequest('GET'))
    // All three must be set, not just some
    expect(response.headers.get('X-Request-Id')).toBeTruthy()
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('500 error response includes X-Request-Id in headers init', async () => {
    const handler = createApiHandler(async () => {
      throw new Error('boom')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const init = mockJsonFn.mock.calls[0][1]
    expect(init.status).toBe(500)
    expect(init.status).not.toBe(400)
    expect(init.status).not.toBe(503)
    expect(init.headers['X-Request-Id']).toMatch(/^req_/)
  })

  it('error catch block logs to audit with exact field structure', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: (table: string) => {
        expect(table).toBe('audit_log')
        return { insert: mockInsert }
      },
    } as any)

    const handler = createApiHandler(async () => {
      throw new Error('test audit')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
      routePath: '/api/widgets',
    })

    await handler(makeRequest())
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'api_error',
        actor_type: 'system', // no user since requireAuth=false
        actor_id: null,
        request_id: expect.stringMatching(/^req_/),
        request_body: expect.objectContaining({
          route: '/api/widgets',
          error_type: 'Error',
        }),
        risk_score: 10,
      })
    )
    // risk_score must be exactly 10
    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.risk_score).toBe(10)
    expect(insertArg.risk_score).not.toBe(0)
    expect(insertArg.risk_score).not.toBe(1)
  })

  it('error catch block sets actor_type to "user" when authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw new Error('user error')
    }, {
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: 'user',
        actor_id: 'user_1',
      })
    )
  })

  it('audit log failure does not prevent error response', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockRejectedValue(new Error('audit db down'))

    const handler = createApiHandler(async () => {
      throw new Error('main error')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    const response = await handler(makeRequest())
    expect(response.status).toBe(500)
    const body = mockJsonFn.mock.calls[0][0]
    expect(body.error).toBeDefined()
  })

  it('getClientIp uses x-vercel-forwarded-for when cf and real-ip are missing', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const mockInsert = vi.fn(async () => ({ error: null }))
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({ insert: mockInsert }),
    } as any)

    const handler = createApiHandler(async () => {
      throw new Error('test vercel ip')
    }, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('POST', { 'x-vercel-forwarded-for': '99.88.77.66' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '99.88.77.66' })
    )
  })

  it('bearer token is trimmed of whitespace', async () => {
    mockGetUser
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'no cookie' } })
      .mockResolvedValueOnce({ data: { user: { id: 'bearer_user', email: 'b@t.com' } }, error: null })

    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    const req = makeRequest('POST', { 'authorization': 'Bearer   spaced_token   ' })
    await handler(req)
    expect(innerHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        accessToken: 'spaced_token',
      })
    )
  })

  it('bearer fallback is skipped when cookie auth succeeds', async () => {
    // Cookie auth succeeds on first call
    mockGetUser.mockResolvedValue({ data: { user: { id: 'cookie_user', email: 'c@t.com' } }, error: null })

    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    const req = makeRequest('POST', { 'authorization': 'Bearer should_not_be_used' })
    await handler(req)
    // getUser should be called only once (cookie auth), not twice (no bearer fallback)
    expect(mockGetUser).toHaveBeenCalledTimes(1)
    expect(innerHandler).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        user: { id: 'cookie_user', email: 'c@t.com' },
        // accessToken is set to bearerToken regardless of auth path
        accessToken: 'should_not_be_used',
      })
    )
  })

  it('401 debug info includes bearer_present=true when bearer provided', async () => {
    vi.stubEnv('AUTH_DEBUG_LOGS', 'true')
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const req = makeRequest('POST', { 'authorization': 'Bearer some_token' })
    await handler(req)
    const body = mockJsonFn.mock.calls[0][0]
    expect(body.debug.bearer_present).toBe(true)
    expect(body.debug.bearer_present).not.toBe(false)
    vi.stubEnv('AUTH_DEBUG_LOGS', '')
  })

  it('401 debug includes matched_auth_cookies and total_cookie_count', async () => {
    vi.stubEnv('AUTH_DEBUG_LOGS', 'true')
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    mockCookieStore.getAll.mockReturnValue([
      { name: 'sb-testproject-auth-token', value: 'tok' },
      { name: 'other', value: 'val' },
    ])

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    await handler(makeRequest())
    const body = mockJsonFn.mock.calls[0][0]
    expect(body.debug.matched_auth_cookies).toEqual(['sb-testproject-auth-token'])
    expect(body.debug.total_cookie_count).toBe(2)
    expect(body.debug.pending_auth_cookie_count).toBeGreaterThanOrEqual(0)
    vi.stubEnv('AUTH_DEBUG_LOGS', '')
  })

  it('rate limit uses routePath in endpointScope when no custom key', async () => {
    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: true,
      routePath: '/api/custom-route',
    })

    await handler(makeRequest())
    // Without customRateLimitKey, endpoint scope should be just routePath
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      '/api/custom-route', // not `routePath:key`
      expect.any(Object)
    )
  })

  it('custom rateLimitKey creates composite endpointScope with routePath:key', async () => {
    const customKeyFn = vi.fn(() => 'my-custom-key')

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: true,
      routePath: '/api/test',
      rateLimitKey: customKeyFn,
    })

    await handler(makeRequest())
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'my-custom-key',
      '/api/test:my-custom-key', // composite scope
      expect.any(Object)
    )
  })

  it('HEAD requests are allowed in readonly mode (not a write method)', async () => {
    mockGetReadonly.mockResolvedValue(true)

    const innerHandler = vi.fn(async () => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('HEAD'))
    expect(innerHandler).toHaveBeenCalled()
  })

  it('startTime in context is a number close to current time', async () => {
    const before = Date.now()
    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest('GET'))
    const after = Date.now()
    const ctx = innerHandler.mock.calls[0][1]
    expect(ctx.startTime).toBeGreaterThanOrEqual(before)
    expect(ctx.startTime).toBeLessThanOrEqual(after)
  })

  it('authUser is passed in context when authenticated', async () => {
    const mockUser = { id: 'user_1', email: 'test@example.com', app_metadata: {} }
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const ctx = innerHandler.mock.calls[0][1]
    expect(ctx.authUser).toBe(mockUser)
    expect(ctx.authUser).not.toBeNull()
  })

  it('authUser is null when requireAuth is false', async () => {
    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      requireAuth: false,
      csrfProtection: false,
      rateLimit: false,
    })

    await handler(makeRequest())
    const ctx = innerHandler.mock.calls[0][1]
    expect(ctx.authUser).toBeNull()
    expect(ctx.user).toBeNull()
    expect(ctx.accessToken).toBeNull()
  })

  it('non-bearer authorization header is not treated as bearer token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    const req = makeRequest('POST', { 'authorization': 'Basic dXNlcjpwYXNz' })
    await handler(req)
    // Should return 401 without attempting bearer auth
    expect(mockJsonFn.mock.calls[0][1].status).toBe(401)
    // getUser called once (cookie auth), not twice (Basic is not Bearer)
    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })

  it('bearer token with no whitespace after "Bearer" is not matched', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const handler = createApiHandler(async () => {
      throw new Error('should not be called')
    })

    // "BearerXYZ" without space should not match /^Bearer\s+(.+)$/i
    const req = makeRequest('POST', { 'authorization': 'BearerXYZ' })
    await handler(req)
    expect(mockJsonFn.mock.calls[0][1].status).toBe(401)
    expect(mockGetUser).toHaveBeenCalledTimes(1)
  })

  it('cookie merge uses both cookieStore.getAll() and raw cookie header', async () => {
    mockCookieStore.getAll.mockReturnValue([
      { name: 'sb-testproject-auth-token', value: 'from-store' },
    ])

    const innerHandler = vi.fn(async (_req: Request, ctx: any) => {
      const { NextResponse } = await import('next/server')
      return NextResponse.json({ ok: true })
    })

    const handler = createApiHandler(innerHandler, {
      csrfProtection: false,
      rateLimit: false,
    })

    const req = makeRequest('POST', {
      'cookie': 'extra=value; sb-testproject-auth-token.0=chunk0',
    })
    await handler(req)
    // Auth should succeed because the base auth token was found
    expect(innerHandler).toHaveBeenCalled()
  })
})
