import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getPrimaryOwnerHomePath,
  isInternalPlatformOperatorEmail,
  isPrimarySoledgicOwnerEmail,
  resolvePrimaryOwnerAppEntryPath,
} from './internal-platforms'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env = { ...originalEnv }
  delete process.env.SOLEDGIC_PRIMARY_OWNER_EMAIL
  delete process.env.PRIMARY_PLATFORM_OWNER_EMAIL
  delete process.env.SOLEDGIC_INTERNAL_OWNER_EMAILS
  delete process.env.INTERNAL_PLATFORM_OWNER_EMAILS
  delete process.env.PLATFORM_ADMIN_EMAILS
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('internal platform owner helpers', () => {
  it('treats soledgic@gmail.com as the default primary owner email', () => {
    expect(isPrimarySoledgicOwnerEmail('soledgic@gmail.com')).toBe(true)
    expect(isInternalPlatformOperatorEmail('soledgic@gmail.com')).toBe(true)
  })

  it('does not treat other emails as the primary owner by default', () => {
    expect(isPrimarySoledgicOwnerEmail('ops@soledgic.com')).toBe(false)
  })

  it('respects explicit operator allowlists alongside the primary owner', () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@soledgic.com'

    expect(isInternalPlatformOperatorEmail('ops@soledgic.com')).toBe(true)
    expect(isInternalPlatformOperatorEmail('soledgic@gmail.com')).toBe(true)
  })

  it('routes the primary owner away from customer entry points', () => {
    expect(resolvePrimaryOwnerAppEntryPath('/dashboard', 'soledgic@gmail.com')).toBe(getPrimaryOwnerHomePath())
    expect(resolvePrimaryOwnerAppEntryPath('/onboarding', 'soledgic@gmail.com')).toBe(getPrimaryOwnerHomePath())
    expect(resolvePrimaryOwnerAppEntryPath('/connect', 'soledgic@gmail.com')).toBe(getPrimaryOwnerHomePath())
  })

  it('preserves explicit deep links for the primary owner', () => {
    expect(resolvePrimaryOwnerAppEntryPath('/dashboard/admin/risk', 'soledgic@gmail.com')).toBe('/dashboard/admin/risk')
  })

  it('does not rewrite paths for non-primary users', () => {
    expect(resolvePrimaryOwnerAppEntryPath('/dashboard', 'ops@soledgic.com')).toBe('/dashboard')
  })
})
