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
  buildDefaultBillingSettingsForOwner: vi.fn(() => ({
    pricing_mode: 'self_serve',
    payment_method_id: null,
  })),
}))

vi.mock('@/lib/ecosystem-server', () => ({
  ensureEcosystemForOrganization: vi.fn().mockResolvedValue(undefined),
}))

import { provisionOrganizationWithLedgers } from './org-provisioning'

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
