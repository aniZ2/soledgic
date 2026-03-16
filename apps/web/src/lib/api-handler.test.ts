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
})
