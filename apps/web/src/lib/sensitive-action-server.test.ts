import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { requireSensitiveActionAuth } from '@/lib/sensitive-action-server'
import { RECENT_SIGN_IN_MAX_AGE_SECONDS } from '@/lib/sensitive-action-shared'

function makeAccessToken(aal: 'aal1' | 'aal2'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'user_1', aal })).toString('base64url')
  return `${header}.${payload}.signature`
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-03-13T08:00:00Z',
    email: 'user@example.com',
    ...(overrides as User),
  }
}

describe('requireSensitiveActionAuth', () => {
  it('allows MFA-backed actions when the session is already aal2', () => {
    const response = requireSensitiveActionAuth(
      {
        authUser: makeUser({
          factors: [
            { id: 'factor_1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' } as User['factors'][number],
          ],
        }),
        accessToken: makeAccessToken('aal2'),
        requestId: 'req_1',
      },
      'rotate API keys',
    )

    expect(response).toBeNull()
  })

  it('requires MFA step-up when verified factors exist but the session is only aal1', async () => {
    const response = requireSensitiveActionAuth(
      {
        authUser: makeUser({
          factors: [
            { id: 'factor_1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' } as User['factors'][number],
          ],
        }),
        accessToken: makeAccessToken('aal1'),
        requestId: 'req_2',
      },
      'rotate webhook secrets',
    )

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual(
      expect.objectContaining({
        error_code: 'step_up_required',
        action: 'rotate webhook secrets',
        verification: expect.objectContaining({
          requires_mfa: true,
          current_level: 'aal1',
          next_level: 'aal2',
        }),
      }),
    )
  })

  it('allows recent-login fallback when no MFA factors exist', () => {
    const response = requireSensitiveActionAuth(
      {
        authUser: makeUser({
          last_sign_in_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        }),
        accessToken: makeAccessToken('aal1'),
        requestId: 'req_3',
      },
      'change payout settings',
    )

    expect(response).toBeNull()
  })

  it('requires a fresh login when MFA is not enabled and the session is stale', async () => {
    const response = requireSensitiveActionAuth(
      {
        authUser: makeUser({
          last_sign_in_at: new Date(
            Date.now() - (RECENT_SIGN_IN_MAX_AGE_SECONDS + 60) * 1000,
          ).toISOString(),
        }),
        accessToken: makeAccessToken('aal1'),
        requestId: 'req_4',
      },
      'update ecosystem settings',
    )

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual(
      expect.objectContaining({
        error_code: 'recent_login_required',
        action: 'update ecosystem settings',
        verification: expect.objectContaining({
          requires_mfa: false,
          requires_recent_sign_in: true,
          max_age_seconds: RECENT_SIGN_IN_MAX_AGE_SECONDS,
        }),
      }),
    )
  })
})
