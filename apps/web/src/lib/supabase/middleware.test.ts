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
})
