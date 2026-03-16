import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockGetUser = vi.fn()
let capturedSetAll: ((cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void) | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: { cookies: { setAll: Function } }) => {
    capturedSetAll = opts.cookies.setAll as typeof capturedSetAll
    return {
      auth: {
        getUser: () => mockGetUser(),
      },
    }
  }),
}))

// Mock NextResponse
const mockNextResponseCookiesSet = vi.fn()
vi.mock('next/server', () => {
  class MockNextResponse {
    headers: Map<string, string>
    cookies: { set: ReturnType<typeof vi.fn> }

    constructor() {
      this.headers = new Map()
      this.cookies = { set: mockNextResponseCookiesSet }
    }

    static next(_opts?: unknown) {
      return new MockNextResponse()
    }
  }
  return { NextResponse: MockNextResponse }
})

import { updateSession } from './middleware'

// Set required env vars
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproject.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')

function makeNextRequest(
  method: string,
  cookies: Array<{ name: string; value: string }> = [],
  path = '/'
) {
  const cookieMap = new Map(cookies.map(c => [c.name, c]))

  return {
    method,
    nextUrl: { pathname: path },
    cookies: {
      getAll: () => cookies,
      get: (name: string) => cookieMap.get(name),
      set: vi.fn(),
    },
    headers: new Headers(),
  } as unknown as import('next/server').NextRequest
}

describe('updateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSetAll = null
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
  })

  it('skips refresh for POST requests (non-idempotent)', async () => {
    const req = makeNextRequest('POST', [
      { name: 'sb-testproject-auth-token', value: 'some-token' },
    ])
    const result = await updateSession(req)
    // Should return the original response without calling getUser
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('skips refresh when no auth cookies are present', async () => {
    const req = makeNextRequest('GET', [
      { name: 'some-other-cookie', value: 'value' },
    ])
    const result = await updateSession(req)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('calls getUser when auth cookies exist on GET requests', async () => {
    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'token-value' },
    ])
    await updateSession(req)
    expect(mockGetUser).toHaveBeenCalled()
  })

  it('calls getUser for chunked auth cookies', async () => {
    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token.0', value: 'chunk-0' },
      { name: 'sb-testproject-auth-token.1', value: 'chunk-1' },
    ])
    await updateSession(req)
    expect(mockGetUser).toHaveBeenCalled()
  })

  it('does not propagate cookie changes when getUser fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token expired' },
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'expired-token' },
    ])
    const result = await updateSession(req)
    // The original response is returned (no cookie mutations)
    expect(mockNextResponseCookiesSet).not.toHaveBeenCalled()
  })

  it('does not propagate cookie changes on "auth session missing" error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing!' },
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'stale' },
    ])
    await updateSession(req)
    expect(mockNextResponseCookiesSet).not.toHaveBeenCalled()
  })

  it('propagates cookie changes when getUser succeeds and setAll is called', async () => {
    mockGetUser.mockImplementation(() => {
      // Simulate Supabase calling setAll during token refresh
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token', value: 'refreshed-token', options: { httpOnly: true } },
        ])
      }
      return { data: { user: { id: 'user_1' } }, error: null }
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'old-token' },
    ])
    await updateSession(req)
    expect(mockNextResponseCookiesSet).toHaveBeenCalledWith(
      'sb-testproject-auth-token',
      'refreshed-token',
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('allows HEAD requests like GET', async () => {
    const req = makeNextRequest('HEAD', [
      { name: 'sb-testproject-auth-token', value: 'token' },
    ])
    await updateSession(req)
    expect(mockGetUser).toHaveBeenCalled()
  })

  it('skips PATCH requests', async () => {
    const req = makeNextRequest('PATCH', [
      { name: 'sb-testproject-auth-token', value: 'token' },
    ])
    await updateSession(req)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('ignores auth cookies from other Supabase projects', async () => {
    const req = makeNextRequest('GET', [
      { name: 'sb-otherproject-auth-token', value: 'foreign-token' },
    ])
    await updateSession(req)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('skips DELETE requests', async () => {
    const req = makeNextRequest('DELETE', [
      { name: 'sb-testproject-auth-token', value: 'token' },
    ])
    await updateSession(req)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('skips PUT requests', async () => {
    const req = makeNextRequest('PUT', [
      { name: 'sb-testproject-auth-token', value: 'token' },
    ])
    await updateSession(req)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns originalResponse (not supabaseResponse) when setAll not called and user is null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'token' },
    ])
    const result = await updateSession(req)
    // No cookies should have been set on the response
    expect(mockNextResponseCookiesSet).not.toHaveBeenCalled()
  })

  it('returns supabaseResponse when setAll is called but user is null (signed-out with cookie updates)', async () => {
    mockGetUser.mockImplementation(() => {
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token', value: '', options: { maxAge: 0 } },
        ])
      }
      return { data: { user: null }, error: null }
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'old-token' },
    ])
    const result = await updateSession(req)
    // Cookie mutations should have been applied
    expect(mockNextResponseCookiesSet).toHaveBeenCalledWith(
      'sb-testproject-auth-token',
      '',
      expect.any(Object)
    )
  })

  it('defaults httpOnly to false when options.httpOnly is undefined', async () => {
    mockGetUser.mockImplementation(() => {
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token', value: 'new-token', options: { path: '/' } },
        ])
      }
      return { data: { user: { id: 'user_1' } }, error: null }
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'old-token' },
    ])
    await updateSession(req)
    expect(mockNextResponseCookiesSet).toHaveBeenCalledWith(
      'sb-testproject-auth-token',
      'new-token',
      expect.objectContaining({ httpOnly: false, path: '/' })
    )
  })

  it('propagates httpOnly=false when explicitly set to false', async () => {
    mockGetUser.mockImplementation(() => {
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token', value: 'tok', options: { httpOnly: false } },
        ])
      }
      return { data: { user: { id: 'user_1' } }, error: null }
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'old-token' },
    ])
    await updateSession(req)
    expect(mockNextResponseCookiesSet).toHaveBeenCalledWith(
      'sb-testproject-auth-token',
      'tok',
      expect.objectContaining({ httpOnly: false })
    )
  })

  it('propagates multiple cookie chunks from setAll', async () => {
    mockGetUser.mockImplementation(() => {
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token.0', value: 'chunk0', options: { httpOnly: true } },
          { name: 'sb-testproject-auth-token.1', value: 'chunk1', options: { httpOnly: true } },
        ])
      }
      return { data: { user: { id: 'user_1' } }, error: null }
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token.0', value: 'old0' },
      { name: 'sb-testproject-auth-token.1', value: 'old1' },
    ])
    await updateSession(req)
    expect(mockNextResponseCookiesSet).toHaveBeenCalledTimes(2)
    expect(mockNextResponseCookiesSet).toHaveBeenCalledWith(
      'sb-testproject-auth-token.0',
      'chunk0',
      expect.objectContaining({ httpOnly: true })
    )
    expect(mockNextResponseCookiesSet).toHaveBeenCalledWith(
      'sb-testproject-auth-token.1',
      'chunk1',
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('sets request cookies before creating supabase response', async () => {
    const setCalls: string[] = []
    const reqCookieSet = vi.fn((name: string) => { setCalls.push(`req:${name}`) })

    mockGetUser.mockImplementation(() => {
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token', value: 'refreshed', options: {} },
        ])
      }
      return { data: { user: { id: 'user_1' } }, error: null }
    })

    const cookies = [{ name: 'sb-testproject-auth-token', value: 'old' }]
    const cookieMap = new Map(cookies.map(c => [c.name, c]))
    const req = {
      method: 'GET',
      nextUrl: { pathname: '/' },
      cookies: {
        getAll: () => cookies,
        get: (name: string) => cookieMap.get(name),
        set: reqCookieSet,
      },
      headers: new Headers(),
    } as unknown as import('next/server').NextRequest

    await updateSession(req)
    // request.cookies.set should have been called to update the request
    expect(reqCookieSet).toHaveBeenCalledWith('sb-testproject-auth-token', 'refreshed')
  })

  it('does not log for auth session missing errors', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AUTH_DEBUG_LOGS', 'true')

    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing' },
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'stale' },
    ])
    await updateSession(req)

    // console.warn should NOT have been called because the error contains 'auth session missing'
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('logs non-session-missing errors when AUTH_DEBUG_LOGS is true', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AUTH_DEBUG_LOGS', 'true')

    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token expired', code: 'token_expired' },
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'expired' },
    ])
    await updateSession(req)

    expect(consoleSpy).toHaveBeenCalledWith(
      'Middleware auth refresh failed',
      expect.objectContaining({ code: 'token_expired' })
    )
    consoleSpy.mockRestore()
  })

  it('returns originalResponse on auth error (never propagates cookie clears)', async () => {
    mockGetUser.mockImplementation(() => {
      // Supabase tries to clear cookies on failure
      if (capturedSetAll) {
        capturedSetAll([
          { name: 'sb-testproject-auth-token', value: '', options: { maxAge: 0 } },
        ])
      }
      return { data: { user: null }, error: { message: 'refresh failed' } }
    })

    const req = makeNextRequest('GET', [
      { name: 'sb-testproject-auth-token', value: 'bad-token' },
    ])
    await updateSession(req)
    // Cookie mutations should NOT be propagated on error
    expect(mockNextResponseCookiesSet).not.toHaveBeenCalled()
  })
})
