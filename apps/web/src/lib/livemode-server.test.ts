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

// Mock supabase/server
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq1 = vi.fn()
const mockEq2 = vi.fn()
const mockIn = vi.fn()
const mockLimit = vi.fn()
const mockMaybeSingle = vi.fn()

vi.mock('./supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: vi.fn(() => ({
        select: mockSelect.mockReturnValue({
          eq: mockEq1.mockReturnValue({
            eq: mockEq2.mockReturnValue({
              in: mockIn.mockReturnValue({
                limit: mockLimit.mockReturnValue({
                  maybeSingle: mockMaybeSingle,
                }),
              }),
            }),
          }),
        }),
      })),
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

  it('sets livemode cookie and returns success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const result = await setLivemodeAction(true, null)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'soledgic_livemode',
      'true',
      expect.objectContaining({ path: '/' })
    )
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
    await setLivemodeAction(true, null)
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
    mockMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
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
    mockMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    const result = await setReadonlyAction(false)
    expect(result).toEqual({ success: true })
    expect(mockCookieStore.delete).toHaveBeenCalledWith('soledgic_readonly')
  })
})
