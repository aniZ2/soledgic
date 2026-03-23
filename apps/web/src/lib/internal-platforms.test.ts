import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isInternalPlatformOperatorEmail,
  isPrimarySoledgicOwnerEmail,
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
})
