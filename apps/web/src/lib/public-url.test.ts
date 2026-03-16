import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('public-url', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    // Clear relevant env vars
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  async function importModule() {
    return import('./public-url')
  }

  describe('getPublicAppUrl', () => {
    it('uses NEXT_PUBLIC_APP_URL when set', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com/'
      const { getPublicAppUrl } = await importModule()
      expect(getPublicAppUrl()).toBe('https://custom.example.com')
    })

    it('strips trailing slashes from configured URL', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://example.com///'
      const { getPublicAppUrl } = await importModule()
      expect(getPublicAppUrl()).toBe('https://example.com')
    })

    it('falls back to NEXT_PUBLIC_SITE_URL', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
      const { getPublicAppUrl } = await importModule()
      expect(getPublicAppUrl()).toBe('https://site.example.com')
    })

    it('prefers NEXT_PUBLIC_APP_URL over NEXT_PUBLIC_SITE_URL', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
      const { getPublicAppUrl } = await importModule()
      expect(getPublicAppUrl()).toBe('https://app.example.com')
    })

    it('returns dev default when no env vars and NODE_ENV is not production', async () => {
      process.env.NODE_ENV = 'test'
      const { getPublicAppUrl } = await importModule()
      // When typeof window === 'undefined' and no env vars, falls to default
      expect(getPublicAppUrl()).toBe('http://localhost:3000')
    })
  })

  describe('toAppUrl', () => {
    it('prepends app URL to a path starting with /', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      const { toAppUrl } = await importModule()
      expect(toAppUrl('/dashboard')).toBe('https://app.example.com/dashboard')
    })

    it('adds leading slash to paths without one', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      const { toAppUrl } = await importModule()
      expect(toAppUrl('dashboard')).toBe('https://app.example.com/dashboard')
    })

    it('handles empty path', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      const { toAppUrl } = await importModule()
      expect(toAppUrl('')).toBe('https://app.example.com/')
    })
  })
})
