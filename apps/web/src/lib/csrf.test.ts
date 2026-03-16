import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock next/headers
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn(() => []),
}
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

// Mock csrf-token to return predictable values
vi.mock('./csrf-token', () => ({
  generateCsrfToken: vi.fn(() => 'mock-csrf-token-abc123'),
}))

import { validateOrigin, validateCsrfToken, validateCsrf, withCsrfProtection, setCsrfCookie, getCsrfToken } from './csrf'

function makeRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
  } = {}
): Request {
  const { method = 'GET', headers = {} } = options
  return new Request(url, { method, headers })
}

describe('validateOrigin', () => {
  it('returns true for GET with no origin (same-origin assumed)', () => {
    const req = makeRequest('https://soledgic.com/api/test')
    expect(validateOrigin(req)).toBe(true)
  })

  it('returns true when origin matches request URL', () => {
    const req = makeRequest('https://soledgic.com/api/test', {
      headers: { origin: 'https://soledgic.com' },
    })
    expect(validateOrigin(req)).toBe(true)
  })

  it('returns true for allowed origins', () => {
    const req = makeRequest('https://api.soledgic.com/api/test', {
      headers: { origin: 'https://app.soledgic.com' },
    })
    expect(validateOrigin(req)).toBe(true)
  })

  it('returns false for unknown origin', () => {
    const req = makeRequest('https://soledgic.com/api/test', {
      headers: { origin: 'https://evil.com' },
    })
    expect(validateOrigin(req)).toBe(false)
  })

  it('uses referer as fallback when origin is absent', () => {
    const req = makeRequest('https://soledgic.com/api/test', {
      headers: { referer: 'https://soledgic.com/dashboard' },
    })
    expect(validateOrigin(req)).toBe(true)
  })

  it('returns false for invalid referer URL', () => {
    const req = makeRequest('https://soledgic.com/api/test', {
      headers: { referer: 'not-a-valid-url' },
    })
    expect(validateOrigin(req)).toBe(false)
  })

  it('checks referer against allowed origins', () => {
    const req = makeRequest('https://some-other.com/api/test', {
      headers: { referer: 'https://app.soledgic.com/page' },
    })
    expect(validateOrigin(req)).toBe(true)
  })

  it('returns false for referer from disallowed origin', () => {
    const req = makeRequest('https://some-other.com/api/test', {
      headers: { referer: 'https://evil.com/page' },
    })
    expect(validateOrigin(req)).toBe(false)
  })

  describe('requireExplicitOrigin', () => {
    it('accepts x-requested-with: fetch when no origin/referer', () => {
      const req = makeRequest('https://soledgic.com/api/test', {
        headers: { 'x-requested-with': 'fetch' },
      })
      expect(validateOrigin(req, { requireExplicitOrigin: true })).toBe(true)
    })

    it('accepts x-requested-with: XMLHttpRequest', () => {
      const req = makeRequest('https://soledgic.com/api/test', {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      })
      expect(validateOrigin(req, { requireExplicitOrigin: true })).toBe(true)
    })

    it('rejects when no origin, referer, or x-requested-with', () => {
      const req = makeRequest('https://soledgic.com/api/test')
      expect(validateOrigin(req, { requireExplicitOrigin: true })).toBe(false)
    })

    it('rejects invalid x-requested-with value', () => {
      const req = makeRequest('https://soledgic.com/api/test', {
        headers: { 'x-requested-with': 'something-else' },
      })
      expect(validateOrigin(req, { requireExplicitOrigin: true })).toBe(false)
    })
  })
})

describe('validateCsrfToken', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
  })

  it('returns true for GET requests without checking tokens', async () => {
    const req = makeRequest('https://soledgic.com/api/test', { method: 'GET' })
    expect(await validateCsrfToken(req)).toBe(true)
  })

  it('returns true for HEAD requests', async () => {
    const req = makeRequest('https://soledgic.com/api/test', { method: 'HEAD' })
    expect(await validateCsrfToken(req)).toBe(true)
  })

  it('returns true for OPTIONS requests', async () => {
    const req = makeRequest('https://soledgic.com/api/test', { method: 'OPTIONS' })
    expect(await validateCsrfToken(req)).toBe(true)
  })

  it('returns false for POST without cookie token', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: { 'x-csrf-token': 'some-token' },
    })
    expect(await validateCsrfToken(req)).toBe(false)
  })

  it('returns false for POST without header token', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'cookie-token' })
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
    })
    expect(await validateCsrfToken(req)).toBe(false)
  })

  it('returns true when cookie and header tokens match', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'matching-token' })
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: { 'x-csrf-token': 'matching-token' },
    })
    expect(await validateCsrfToken(req)).toBe(true)
  })

  it('returns false when cookie and header tokens differ', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'cookie-token' })
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: { 'x-csrf-token': 'different-token' },
    })
    expect(await validateCsrfToken(req)).toBe(false)
  })

  it('falls back to raw Cookie header when cookies() returns nothing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: {
        'x-csrf-token': 'raw-token',
        cookie: '__csrf_token=raw-token; other=val',
      },
    })
    expect(await validateCsrfToken(req)).toBe(true)
  })
})

describe('validateCsrf', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
  })

  it('returns valid for GET requests', async () => {
    const req = makeRequest('https://soledgic.com/api/test')
    const result = await validateCsrf(req)
    expect(result).toEqual({ valid: true })
  })

  it('returns invalid origin error for bad origin on POST', async () => {
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: { origin: 'https://evil.com' },
    })
    const result = await validateCsrf(req)
    expect(result).toEqual({ valid: false, error: 'Invalid origin' })
  })

  it('returns invalid CSRF token error when token missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: {
        origin: 'https://soledgic.com',
        'x-requested-with': 'fetch',
      },
    })
    const result = await validateCsrf(req)
    expect(result).toEqual({ valid: false, error: 'Invalid CSRF token' })
  })

  it('returns valid when origin and token both pass', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'good-token' })
    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: {
        origin: 'https://soledgic.com',
        'x-csrf-token': 'good-token',
        'x-requested-with': 'fetch',
      },
    })
    const result = await validateCsrf(req)
    expect(result).toEqual({ valid: true })
  })
})

describe('withCsrfProtection', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
  })

  it('calls handler when CSRF is valid', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withCsrfProtection(handler)

    const req = makeRequest('https://soledgic.com/api/test')
    await wrapped(req)

    expect(handler).toHaveBeenCalledWith(req)
  })

  it('returns 403 when CSRF is invalid', async () => {
    const handler = vi.fn()
    const wrapped = withCsrfProtection(handler)

    const req = makeRequest('https://soledgic.com/api/test', {
      method: 'POST',
      headers: { origin: 'https://evil.com' },
    })
    const response = (await wrapped(req)) as Response

    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })
})

describe('setCsrfCookie', () => {
  beforeEach(() => {
    mockCookieStore.set.mockReset()
  })

  it('sets cookie and returns the generated token', async () => {
    const token = await setCsrfCookie()
    expect(token).toBe('mock-csrf-token-abc123')
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      '__csrf_token',
      'mock-csrf-token-abc123',
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'strict',
        path: '/',
      })
    )
  })
})

describe('getCsrfToken', () => {
  beforeEach(() => {
    mockCookieStore.get.mockReset()
  })

  it('returns token from cookie', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'stored-token' })
    expect(await getCsrfToken()).toBe('stored-token')
  })

  it('returns undefined when cookie is missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    expect(await getCsrfToken()).toBeUndefined()
  })
})
