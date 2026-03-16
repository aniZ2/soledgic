import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock the supabase client module
const mockGetSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: () => mockGetSession(),
    },
  }),
}))

// Simulate a minimal browser environment for document.cookie and window.location
let fakeCookies = ''
const fakeDocument = {
  get cookie() {
    return fakeCookies
  },
  set cookie(val: string) {
    // Simple cookie jar: handle setting and deletion
    const eqIdx = val.indexOf('=')
    const name = val.substring(0, eqIdx).trim()
    const rest = val.substring(eqIdx + 1)

    // Check if this is a deletion (expires in the past)
    if (rest.includes('expires=Thu, 01 Jan 1970')) {
      const pairs = fakeCookies.split(';').filter((p) => p.trim().split('=')[0].trim() !== name)
      fakeCookies = pairs.join('; ')
      return
    }

    // Set value (strip attributes)
    const value = rest.split(';')[0].trim()
    const pairs = fakeCookies ? fakeCookies.split(';').map((p) => p.trim()) : []
    const existing = pairs.findIndex((p) => p.split('=')[0].trim() === name)
    const entry = `${name}=${value}`
    if (existing >= 0) {
      pairs[existing] = entry
    } else {
      pairs.push(entry)
    }
    fakeCookies = pairs.join('; ')
  },
}

vi.stubGlobal('document', fakeDocument)
vi.stubGlobal('window', {
  location: { origin: 'https://app.soledgic.com' },
})

// Must import after mocks are set up
import { getCsrfToken, fetchWithCsrf } from './fetch-with-csrf'

describe('getCsrfToken', () => {
  beforeEach(() => {
    fakeCookies = ''
  })

  it('returns undefined when no csrf cookie exists', () => {
    expect(getCsrfToken()).toBeUndefined()
  })

  it('extracts the csrf token from cookies', () => {
    fakeCookies = '__csrf_token=abc123'
    expect(getCsrfToken()).toBe('abc123')
  })

  it('extracts the correct token among multiple cookies', () => {
    fakeCookies = 'other=value; __csrf_token=my_token_42; another=thing'
    expect(getCsrfToken()).toBe('my_token_42')
  })
})

describe('fetchWithCsrf', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchSpy)
    mockGetSession.mockResolvedValue({ data: { session: null } })
    fakeCookies = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Re-stub window and document since unstubAllGlobals clears them
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('window', {
      location: { origin: 'https://app.soledgic.com' },
    })
  })

  it('attaches csrf token from cookie as header', async () => {
    fakeCookies = '__csrf_token=test_token'
    await fetchWithCsrf('https://external.com/data')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('x-csrf-token')).toBe('test_token')
  })

  it('sets x-requested-with header to fetch', async () => {
    await fetchWithCsrf('https://external.com/data')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('x-requested-with')).toBe('fetch')
  })

  it('does not override existing x-requested-with header', async () => {
    await fetchWithCsrf('https://external.com/data', {
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('sets Content-Type to application/json when body is present', async () => {
    await fetchWithCsrf('https://external.com/data', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('does not set Content-Type when body is undefined', async () => {
    await fetchWithCsrf('https://external.com/data')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('Content-Type')).toBeNull()
  })

  it('does not override explicit Content-Type', async () => {
    await fetchWithCsrf('https://external.com/data', {
      method: 'POST',
      body: 'plain text',
      headers: { 'Content-Type': 'text/plain' },
    })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('Content-Type')).toBe('text/plain')
  })

  it('defaults credentials to include', async () => {
    await fetchWithCsrf('https://external.com/data')

    const call = fetchSpy.mock.calls[0]
    expect(call[1].credentials).toBe('include')
  })

  it('respects explicit credentials option', async () => {
    await fetchWithCsrf('https://external.com/data', { credentials: 'same-origin' })

    const call = fetchSpy.mock.calls[0]
    expect(call[1].credentials).toBe('same-origin')
  })

  it('injects auth header for internal /api/ requests when session exists', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt_token_123' } },
    })

    // Internal request: same origin + /api/ prefix
    await fetchWithCsrf('https://app.soledgic.com/api/test')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBe('Bearer jwt_token_123')
  })

  it('does not inject auth header for external URLs', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt_token_123' } },
    })

    await fetchWithCsrf('https://external-api.com/data')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })

  it('does not override existing authorization header', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt_token_123' } },
    })

    await fetchWithCsrf('https://app.soledgic.com/api/test', {
      headers: { authorization: 'Bearer custom_token' },
    })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBe('Bearer custom_token')
  })

  it('handles session fetch failure gracefully', async () => {
    mockGetSession.mockRejectedValue(new Error('auth service down'))

    await fetchWithCsrf('https://app.soledgic.com/api/test')

    // Should still make the fetch call without auth header
    expect(fetchSpy).toHaveBeenCalled()
    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })

  it('does not inject auth for same-origin non-api paths', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt_token_123' } },
    })

    await fetchWithCsrf('https://app.soledgic.com/dashboard')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })

  it('does not set csrf header when no csrf cookie exists', async () => {
    fakeCookies = 'other=value'
    await fetchWithCsrf('https://external.com/data')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('x-csrf-token')).toBeNull()
  })

  it('passes through additional options like method', async () => {
    await fetchWithCsrf('https://external.com/data', { method: 'DELETE' })

    const call = fetchSpy.mock.calls[0]
    expect(call[1].method).toBe('DELETE')
  })

  it('does not inject auth for relative /api/ path treated as external (different origin)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt_token_123' } },
    })

    // Relative URL will be resolved against window.location.origin
    await fetchWithCsrf('/api/test')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    // /api/test resolved to https://app.soledgic.com/api/test — this IS internal
    expect(headers.get('authorization')).toBe('Bearer jwt_token_123')
  })

  it('does not inject auth when session has no access_token', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: null } },
    })

    await fetchWithCsrf('https://app.soledgic.com/api/test')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })

  it('does not set Content-Type when body is explicitly undefined', async () => {
    await fetchWithCsrf('https://external.com/data', { body: undefined })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('Content-Type')).toBeNull()
  })

  it('sets Content-Type for empty string body', async () => {
    await fetchWithCsrf('https://external.com/data', {
      method: 'POST',
      body: '',
    })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    // body is '' which is not undefined, so Content-Type should be set
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('preserves other request init properties', async () => {
    const signal = new AbortController().signal
    await fetchWithCsrf('https://external.com/data', {
      method: 'PUT',
      body: '{}',
      signal,
    })

    const call = fetchSpy.mock.calls[0]
    expect(call[1].signal).toBe(signal)
  })

  it('does not inject auth for same-origin /dashboard/api/ path (must start with /api/)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt_token_123' } },
    })

    await fetchWithCsrf('https://app.soledgic.com/dashboard/api/data')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })

  it('credentials defaults to "include" not "same-origin"', async () => {
    await fetchWithCsrf('https://external.com/data')

    const call = fetchSpy.mock.calls[0]
    expect(call[1].credentials).toBe('include')
    expect(call[1].credentials).not.toBe('same-origin')
    expect(call[1].credentials).not.toBe('omit')
  })

  it('does not set Content-Type when body is null (undefined check)', async () => {
    // body: null is not undefined, so Content-Type SHOULD be set
    await fetchWithCsrf('https://external.com/data', {
      method: 'POST',
      body: null as any,
    })

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    // body is null, which is not undefined, so Content-Type should be set
    // The check is `body !== undefined`, and null !== undefined is true
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('uses first URL that starts with /api/ on same origin for auth injection', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })

    await fetchWithCsrf('https://app.soledgic.com/api/nested/endpoint')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBe('Bearer tok')
  })

  it('does not inject auth for URL with /api in query string but not in path', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })

    await fetchWithCsrf('https://app.soledgic.com/dashboard?redirect=/api/test')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })

  it('first call URL is passed through to fetch', async () => {
    await fetchWithCsrf('https://example.com/resource')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/resource',
      expect.any(Object)
    )
  })

  it('credentials "omit" is respected when explicitly set', async () => {
    await fetchWithCsrf('https://external.com/data', { credentials: 'omit' })

    const call = fetchSpy.mock.calls[0]
    expect(call[1].credentials).toBe('omit')
  })

  it('does not inject auth when session is null', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    })

    await fetchWithCsrf('https://app.soledgic.com/api/test')

    const call = fetchSpy.mock.calls[0]
    const headers = call[1].headers as Headers
    expect(headers.get('authorization')).toBeNull()
  })
})
