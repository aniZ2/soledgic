import { describe, expect, it } from 'vitest'
import { isSensitiveActionChallenge, RECENT_SIGN_IN_MAX_AGE_SECONDS } from './sensitive-action-shared'

describe('RECENT_SIGN_IN_MAX_AGE_SECONDS', () => {
  it('is 15 minutes in seconds', () => {
    expect(RECENT_SIGN_IN_MAX_AGE_SECONDS).toBe(900)
  })
})

describe('isSensitiveActionChallenge', () => {
  const validChallenge = {
    error: 'Step-up required',
    error_code: 'step_up_required' as const,
    action: 'delete_api_key',
    verification: {
      requires_mfa: true,
      requires_recent_sign_in: false,
      current_level: 'aal1' as const,
      next_level: 'aal2' as const,
      signed_in_at: '2026-01-01T00:00:00Z',
      max_age_seconds: 900,
    },
  }

  it('returns true for a valid challenge', () => {
    expect(isSensitiveActionChallenge(validChallenge)).toBe(true)
  })

  it('returns true for recent_login_required error_code', () => {
    expect(
      isSensitiveActionChallenge({
        ...validChallenge,
        error_code: 'recent_login_required',
      })
    ).toBe(true)
  })

  it('returns true when current_level and next_level are null', () => {
    expect(
      isSensitiveActionChallenge({
        ...validChallenge,
        verification: {
          ...validChallenge.verification,
          current_level: null,
          next_level: null,
        },
      })
    ).toBe(true)
  })

  it('returns true when signed_in_at is null', () => {
    expect(
      isSensitiveActionChallenge({
        ...validChallenge,
        verification: {
          ...validChallenge.verification,
          signed_in_at: null,
        },
      })
    ).toBe(true)
  })

  it('returns false for null', () => {
    expect(isSensitiveActionChallenge(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSensitiveActionChallenge(undefined)).toBe(false)
  })

  it('returns false for a string', () => {
    expect(isSensitiveActionChallenge('not an object')).toBe(false)
  })

  it('returns false when error is missing', () => {
    const { error, ...rest } = validChallenge
    expect(isSensitiveActionChallenge(rest)).toBe(false)
  })

  it('returns false for invalid error_code', () => {
    expect(
      isSensitiveActionChallenge({ ...validChallenge, error_code: 'unknown' })
    ).toBe(false)
  })

  it('returns false when action is not a string', () => {
    expect(
      isSensitiveActionChallenge({ ...validChallenge, action: 123 })
    ).toBe(false)
  })

  it('returns false when verification is missing', () => {
    const { verification, ...rest } = validChallenge
    expect(isSensitiveActionChallenge(rest)).toBe(false)
  })

  it('returns false when verification has wrong requires_mfa type', () => {
    expect(
      isSensitiveActionChallenge({
        ...validChallenge,
        verification: { ...validChallenge.verification, requires_mfa: 'yes' },
      })
    ).toBe(false)
  })

  it('returns false when verification has invalid current_level', () => {
    expect(
      isSensitiveActionChallenge({
        ...validChallenge,
        verification: { ...validChallenge.verification, current_level: 'aal3' },
      })
    ).toBe(false)
  })

  it('returns false when max_age_seconds is not a number', () => {
    expect(
      isSensitiveActionChallenge({
        ...validChallenge,
        verification: { ...validChallenge.verification, max_age_seconds: '900' },
      })
    ).toBe(false)
  })
})
