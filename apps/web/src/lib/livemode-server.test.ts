import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock next/headers
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(() => []),
}
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

// Mock supabase/server — flexible chain mock that works for any query pattern
const mockGetUser = vi.fn()
const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()

function createChainMock() {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'in', 'order', 'limit', 'gte', 'neq', 'not']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = mockMaybeSingle
  chain.single = mockSingle
  return chain
}

vi.mock('./supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: vi.fn(() => createChainMock()),
    })
  ),
}))

import {
  getLivemode,
  getActiveLedgerGroupId,
  getReadonly,
  setLivemodeAction,
  setActiveLedgerGroupAction,
  setReadonlyAction,
} from './livemode-server'

beforeEach(() => {
  mockCookieStore.get.mockReset()
  mockCookieStore.set.mockReset()
  mockCookieStore.delete.mockReset()
  mockGetUser.mockReset()
  mockMaybeSingle.mockReset()
})

describe('getLivemode', () => {
  it('returns true when cookie is "true"', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'true' })
    expect(await getLivemode()).toBe(true)
  })

  it('returns false when cookie is "false"', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'false' })
    expect(await getLivemode()).toBe(false)
  })

  it('returns false when cookie is missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    expect(await getLivemode()).toBe(false)
  })
})

describe('getActiveLedgerGroupId', () => {
  it('returns the cookie value when set', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'group-uuid' })
    expect(await getActiveLedgerGroupId()).toBe('group-uuid')
  })

  it('returns null when cookie is missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    expect(await getActiveLedgerGroupId()).toBeNull()
  })
})

describe('getReadonly', () => {
  it('returns true when cookie is "true"', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'true' })
    expect(await getReadonly()).toBe(true)
  })

  it('returns false when cookie is missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    expect(await getReadonly()).toBe(false)
  })
})

describe('setLivemodeAction', () => {
  it('returns { success: false } when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await setLivemodeAction(true, null)
    expect(result).toEqual({ success: false })
  })

  it('sets livemode cookie and returns success (sandbox mode)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const result = await setLivemodeAction(false, null)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'soledgic_livemode',
      'false',
      expect.objectContaining({ path: '/' })
    )
  })

  it('sets livemode to live when KYC approved', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    // resolveActiveMembership returns a membership, then KYC check queries org
    mockMaybeSingle.mockResolvedValue({ data: { organization_id: 'org-1', role: 'owner' }, error: null })
    mockSingle.mockResolvedValue({ data: { kyc_status: 'approved' }, error: null })
    const result = await setLivemodeAction(true, null)
    expect(result).toEqual({ success: true })
  })

  it('sets active ledger group cookie when provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const uuid = '12345678-1234-1234-9234-123456789012'
    const result = await setLivemodeAction(false, uuid)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.set).toHaveBeenCalledTimes(2)
  })

  it('deletes active ledger group cookie when null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    await setLivemodeAction(false, null)
    expect(mockCookieStore.delete).toHaveBeenCalledWith('soledgic_active_ledger_group')
  })

  it('rejects invalid UUID for ledger group ID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const result = await setLivemodeAction(true, 'not-a-uuid')
    expect(result).toEqual({ success: false })
  })
})

describe('setActiveLedgerGroupAction', () => {
  it('returns { success: false } when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await setActiveLedgerGroupAction('12345678-1234-1234-9234-123456789012')
    expect(result).toEqual({ success: false })
  })

  it('sets cookie for valid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const uuid = '12345678-1234-1234-9234-123456789012'
    const result = await setActiveLedgerGroupAction(uuid)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.set).toHaveBeenCalled()
  })

  it('deletes cookie when null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const result = await setActiveLedgerGroupAction(null)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.delete).toHaveBeenCalled()
  })

  it('rejects invalid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const result = await setActiveLedgerGroupAction('invalid')
    expect(result).toEqual({ success: false })
  })
})

describe('setReadonlyAction', () => {
  it('returns { success: false } when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await setReadonlyAction(true)
    expect(result).toEqual({ success: false })
  })

  it('returns { success: false } when user is not owner/admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await setReadonlyAction(true)
    expect(result).toEqual({ success: false })
  })

  it('sets readonly cookie when user is admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockMaybeSingle.mockResolvedValue({ data: { organization_id: 'org-1', role: 'admin' }, error: null })
    const result = await setReadonlyAction(true)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'soledgic_readonly',
      'true',
      expect.objectContaining({ maxAge: 86400 })
    )
  })

  it('deletes readonly cookie when setting to false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockMaybeSingle.mockResolvedValue({ data: { organization_id: 'org-1', role: 'owner' }, error: null })
    const result = await setReadonlyAction(false)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.delete).toHaveBeenCalledWith('soledgic_readonly')
  })
})
