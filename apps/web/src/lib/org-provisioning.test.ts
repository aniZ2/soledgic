import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock external dependencies
const mockFrom = vi.fn()
const mockSupabase = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: vi.fn(() => mockSupabase),
}))

vi.mock('@/lib/internal-platforms', () => ({
  buildDefaultBillingSettingsForOwner: vi.fn((email: string | null | undefined) => ({
    pricing_mode: 'self_serve',
    payment_method_id: null,
  })),
}))

vi.mock('@/lib/ecosystem-server', () => ({
  ensureEcosystemForOrganization: vi.fn().mockResolvedValue(undefined),
}))

import { provisionOrganizationWithLedgers } from './org-provisioning'

// Helper to set up chained Supabase query responses
function chainResponse(data: unknown, error: { message?: string; code?: string } | null = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data, error }),
          in: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data, error }),
            }),
          }),
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
        order: vi.fn().mockReturnValue({
          returns: vi.fn().mockResolvedValue({ data, error }),
        }),
        single: vi.fn().mockResolvedValue({ data, error }),
        head: vi.fn().mockResolvedValue({ count: 0, error: null }),
      }),
      single: vi.fn().mockResolvedValue({ data, error }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
        returns: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data, error }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReset()
})

describe('provisionOrganizationWithLedgers', () => {
  it('throws when organization name is empty', async () => {
    await expect(
      provisionOrganizationWithLedgers({
        userId: 'user-123',
        organizationName: '',
      })
    ).rejects.toThrow('Organization name is required')
  })

  it('throws when organization name is only whitespace', async () => {
    await expect(
      provisionOrganizationWithLedgers({
        userId: 'user-123',
        organizationName: '   ',
      })
    ).rejects.toThrow('Organization name is required')
  })

  it('throws when userId is empty', async () => {
    await expect(
      provisionOrganizationWithLedgers({
        userId: '',
        organizationName: 'Test Org',
      })
    ).rejects.toThrow('User ID is required')
  })
})
