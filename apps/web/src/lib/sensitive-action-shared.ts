export const RECENT_SIGN_IN_MAX_AGE_SECONDS = 15 * 60

export type SensitiveActionErrorCode = 'step_up_required' | 'recent_login_required'
export type SensitiveActionLevel = 'aal1' | 'aal2' | null

export interface SensitiveActionVerification {
  requires_mfa: boolean
  requires_recent_sign_in: boolean
  current_level: SensitiveActionLevel
  next_level: SensitiveActionLevel
  signed_in_at: string | null
  max_age_seconds: number
}

export interface SensitiveActionChallenge {
  error: string
  error_code: SensitiveActionErrorCode
  action: string
  verification: SensitiveActionVerification
}

function isVerification(value: unknown): value is SensitiveActionVerification {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    typeof record.requires_mfa === 'boolean' &&
    typeof record.requires_recent_sign_in === 'boolean' &&
    (record.current_level === 'aal1' || record.current_level === 'aal2' || record.current_level === null) &&
    (record.next_level === 'aal1' || record.next_level === 'aal2' || record.next_level === null) &&
    (typeof record.signed_in_at === 'string' || record.signed_in_at === null) &&
    typeof record.max_age_seconds === 'number'
  )
}

export function isSensitiveActionChallenge(value: unknown): value is SensitiveActionChallenge {
  if (typeof value !== 'object' || value === null) return false

  const record = value as Record<string, unknown>
  return (
    typeof record.error === 'string' &&
    (record.error_code === 'step_up_required' || record.error_code === 'recent_login_required') &&
    typeof record.action === 'string' &&
    isVerification(record.verification)
  )
}
