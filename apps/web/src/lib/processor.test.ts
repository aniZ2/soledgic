import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// We test the pure helper functions by importing the module
// processorRequest and higher-level functions need fetch mocking

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.PROCESSOR_BASE_URL = 'https://sandbox.example.com'
  process.env.PROCESSOR_USERNAME = 'user'
  process.env.PROCESSOR_PASSWORD = 'pass'
  process.env.PROCESSOR_ENV = 'sandbox'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

import { processorRequest } from './processor'

describe('processorRequest', () => {
  it('throws when path does not start with /', async () => {
    await expect(processorRequest('no-leading-slash')).rejects.toThrow(
      'Processor request path must start with "/"'
    )
  })

  it('throws when PROCESSOR_BASE_URL is not set', async () => {
    process.env.PROCESSOR_BASE_URL = ''
    await expect(processorRequest('/test')).rejects.toThrow(
      'Payment processor base URL is not configured'
    )
  })

  it('throws when credentials are missing', async () => {
    delete process.env.PROCESSOR_USERNAME
    await expect(processorRequest('/test')).rejects.toThrow(
      'Payment processor credentials are not configured'
    )
  })

  it('throws on production env with sandbox URL', async () => {
    process.env.PROCESSOR_ENV = 'production'
    process.env.PROCESSOR_BASE_URL = 'https://sandbox.finix.com'
    await expect(processorRequest('/test')).rejects.toThrow(
      'production environment cannot use sandbox base URL'
    )
  })

  it('throws on sandbox env with production URL', async () => {
    process.env.PROCESSOR_ENV = 'sandbox'
    process.env.PROCESSOR_BASE_URL = 'https://live.finix.com'
    await expect(processorRequest('/test')).rejects.toThrow(
      'sandbox environment cannot use production base URL'
    )
  })

  it('makes successful GET request', async () => {
    const mockResponse = { id: 'test-123' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    )

    const result = await processorRequest('/identities/123')
    expect(result).toEqual(mockResponse)
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox.example.com/identities/123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('makes POST request with body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'new-123' }), { status: 201 })
    )

    const body = { name: 'Test' }
    await processorRequest('/identities', { method: 'POST', body })
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox.example.com/identities',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      })
    )
  })

  it('extracts error message from response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 })
    )

    await expect(processorRequest('/test')).rejects.toThrow('Bad request')
  })

  it('extracts error from _embedded.errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _embedded: { errors: [{ message: 'Field invalid' }] },
        }),
        { status: 422 }
      )
    )

    await expect(processorRequest('/test')).rejects.toThrow('Field invalid')
  })

  it('falls back to generic error when body has no message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 500 })
    )

    await expect(processorRequest('/test')).rejects.toThrow('Processor request failed (500)')
  })

  it('strips trailing slash from base URL', async () => {
    process.env.PROCESSOR_BASE_URL = 'https://sandbox.example.com/'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await processorRequest('/test')
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox.example.com/test',
      expect.anything()
    )
  })

  it('uses custom version header and API version from env', async () => {
    process.env.PROCESSOR_VERSION_HEADER = 'X-Custom-Version'
    process.env.PROCESSOR_API_VERSION = '2024-01-01'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await processorRequest('/test')
    const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
    expect(callHeaders['X-Custom-Version']).toBe('2024-01-01')
  })

  it('defaults Finix-Version header to 2022-02-01', async () => {
    delete process.env.PROCESSOR_VERSION_HEADER
    delete process.env.PROCESSOR_API_VERSION
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await processorRequest('/test')
    const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
    expect(callHeaders['Finix-Version']).toBe('2022-02-01')
  })
})

describe('getProcessorEnvironment mapping', () => {
  // Test indirectly through processorRequest's env/URL mismatch checks

  it('treats "prod" as production', async () => {
    process.env.PROCESSOR_ENV = 'prod'
    process.env.PROCESSOR_BASE_URL = 'https://sandbox.finix.com'
    await expect(processorRequest('/test')).rejects.toThrow('production environment cannot use sandbox')
  })

  it('treats "live" as production', async () => {
    process.env.PROCESSOR_ENV = 'live'
    process.env.PROCESSOR_BASE_URL = 'https://sandbox.finix.com'
    await expect(processorRequest('/test')).rejects.toThrow('production environment cannot use sandbox')
  })

  it('treats "dev" as sandbox', async () => {
    process.env.PROCESSOR_ENV = 'dev'
    process.env.PROCESSOR_BASE_URL = 'https://production.finix.com'
    await expect(processorRequest('/test')).rejects.toThrow('sandbox environment cannot use production')
  })

  it('treats "testing" as sandbox', async () => {
    process.env.PROCESSOR_ENV = 'testing'
    process.env.PROCESSOR_BASE_URL = 'https://production.finix.com'
    await expect(processorRequest('/test')).rejects.toThrow('sandbox environment cannot use production')
  })
})

describe('getProcessorRequestTimeoutMs', () => {
  it('handles abort/timeout scenario', async () => {
    process.env.PROCESSOR_REQUEST_TIMEOUT_MS = '1' // 1ms — too short, will use 30000 default
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((_, reject) => {
        const err = new DOMException('The operation was aborted', 'AbortError')
        setTimeout(() => reject(err), 5)
      })
    )

    await expect(processorRequest('/test')).rejects.toThrow('Processor request timed out')
  })
})
