import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { ApiContext } from '@/lib/api-handler'
import {
  RECENT_SIGN_IN_MAX_AGE_SECONDS,
  type SensitiveActionChallenge,
  type SensitiveActionErrorCode,
  type SensitiveActionLevel,
} from '@/lib/sensitive-action-shared'

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length < 2 || !parts[1]) return null

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padLength = (4 - (normalized.length % 4)) % 4
    const base64 = `${normalized}${'='.repeat(padLength)}`
    const json = Buffer.from(base64, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function getTokenAal(accessToken: string | null): SensitiveActionLevel {
  const payload = decodeJwtPayload(accessToken)
  const aal = payload?.aal
  return aal === 'aal1' || aal === 'aal2' ? aal : null
}

function getVerifiedFactorCount(user: User | null): number {
  const factors = Array.isArray(user?.factors) ? user?.factors : []
  return factors.filter((factor) => factor.status === 'verified').length
}

function getSignedInAt(user: User | null): string | null {
  return typeof user?.last_sign_in_at === 'string' ? user.last_sign_in_at : null
}

function hasRecentSignIn(user: User | null, now = Date.now()): boolean {
  const signedInAt = getSignedInAt(user)
  if (!signedInAt) return false

  const timestamp = Date.parse(signedInAt)
  if (!Number.isFinite(timestamp)) return false

  return now - timestamp <= RECENT_SIGN_IN_MAX_AGE_SECONDS * 1000
}

function buildChallenge(
  action: string,
  errorCode: SensitiveActionErrorCode,
  authUser: User | null,
  currentLevel: SensitiveActionLevel,
): SensitiveActionChallenge {
  const requiresMfa = errorCode === 'step_up_required'
  const signedInAt = getSignedInAt(authUser)

  return {
    error: requiresMfa
      ? `Additional verification is required to ${action.toLowerCase()}.`
      : `Please sign in again to ${action.toLowerCase()}.`,
    error_code: errorCode,
    action,
    verification: {
      requires_mfa: requiresMfa,
      requires_recent_sign_in: !requiresMfa,
      current_level: currentLevel,
      next_level: getVerifiedFactorCount(authUser) > 0 ? 'aal2' : currentLevel,
      signed_in_at: signedInAt,
      max_age_seconds: RECENT_SIGN_IN_MAX_AGE_SECONDS,
    },
  }
}

export function requireSensitiveActionAuth(
  context: Pick<ApiContext, 'authUser' | 'accessToken' | 'requestId'>,
  action: string,
): NextResponse | null {
  const authUser = context.authUser
  const currentLevel = getTokenAal(context.accessToken)
  const hasVerifiedFactor = getVerifiedFactorCount(authUser) > 0

  if (hasVerifiedFactor && currentLevel === 'aal2') {
    return null
  }

  if (!hasVerifiedFactor && hasRecentSignIn(authUser)) {
    return null
  }

  const challenge = buildChallenge(
    action,
    hasVerifiedFactor ? 'step_up_required' : 'recent_login_required',
    authUser,
    currentLevel,
  )

  return NextResponse.json(
    {
      ...challenge,
      request_id: context.requestId,
    },
    { status: 403 },
  )
}
