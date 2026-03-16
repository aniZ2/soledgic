import { describe, expect, it, vi, beforeEach } from 'vitest'

// Simulate window.location for URL construction
vi.stubGlobal('window', {
  location: { origin: 'https://app.soledgic.com' },
})

// Mock fetchWithCsrf
const mockFetchWithCsrf = vi.fn()
vi.mock('@/lib/fetch-with-csrf', () => ({
  fetchWithCsrf: (...args: unknown[]) => mockFetchWithCsrf(...args),
}))

import { callLedgerFunction } from './ledger-functions-client'

describe('callLedgerFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchWithCsrf.mockResolvedValue(new Response('ok'))
  })

  it('constructs the correct URL with ledger_id', async () => {
    await callLedgerFunction('transfers', { ledgerId: 'ledger_abc' })

    const [url] = mockFetchWithCsrf.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/api/ledger-functions/transfers')
    expect(parsed.searchParams.get('ledger_id')).toBe('ledger_abc')
  })

  it('appends query parameters', async () => {
    await callLedgerFunction('balances', {
      ledgerId: 'ledger_1',
      method: 'GET',
      query: { page: 2, active: true, filter: 'recent' },
    })

    const [url] = mockFetchWithCsrf.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.searchParams.get('page')).toBe('2')
    expect(parsed.searchParams.get('active')).toBe('true')
    expect(parsed.searchParams.get('filter')).toBe('recent')
  })

  it('skips null and undefined query values', async () => {
    await callLedgerFunction('balances', {
      ledgerId: 'ledger_1',
      method: 'GET',
      query: { included: 'yes', excluded_null: null, excluded_undef: undefined },
    })

    const [url] = mockFetchWithCsrf.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.searchParams.get('included')).toBe('yes')
    expect(parsed.searchParams.has('excluded_null')).toBe(false)
    expect(parsed.searchParams.has('excluded_undef')).toBe(false)
  })

  it('uses GET method without body', async () => {
    await callLedgerFunction('balances', {
      ledgerId: 'ledger_1',
      method: 'GET',
    })

    const [, options] = mockFetchWithCsrf.mock.calls[0]
    expect(options.method).toBe('GET')
    expect(options.body).toBeUndefined()
  })

  it('defaults to POST with JSON body including ledger_id', async () => {
    await callLedgerFunction('refunds', {
      ledgerId: 'ledger_abc',
      body: { transfer_id: 'txn_123', amount: 50 },
    })

    const [, options] = mockFetchWithCsrf.mock.calls[0]
    expect(options.method).toBe('POST')
    const parsed = JSON.parse(options.body)
    expect(parsed.ledger_id).toBe('ledger_abc')
    expect(parsed.transfer_id).toBe('txn_123')
    expect(parsed.amount).toBe(50)
  })

  it('includes ledger_id in body even when no extra body is provided', async () => {
    await callLedgerFunction('some-action', {
      ledgerId: 'ledger_xyz',
    })

    const [, options] = mockFetchWithCsrf.mock.calls[0]
    const parsed = JSON.parse(options.body)
    expect(parsed.ledger_id).toBe('ledger_xyz')
    expect(Object.keys(parsed)).toEqual(['ledger_id'])
  })

  it('supports PUT method', async () => {
    await callLedgerFunction('settings', {
      ledgerId: 'ledger_1',
      method: 'PUT',
      body: { name: 'Updated' },
    })

    const [, options] = mockFetchWithCsrf.mock.calls[0]
    expect(options.method).toBe('PUT')
    const parsed = JSON.parse(options.body)
    expect(parsed.name).toBe('Updated')
    expect(parsed.ledger_id).toBe('ledger_1')
  })

  it('supports DELETE method with body', async () => {
    await callLedgerFunction('participants', {
      ledgerId: 'ledger_1',
      method: 'DELETE',
      body: { participant_id: 'p_1' },
    })

    const [, options] = mockFetchWithCsrf.mock.calls[0]
    expect(options.method).toBe('DELETE')
    const parsed = JSON.parse(options.body)
    expect(parsed.participant_id).toBe('p_1')
  })
})
