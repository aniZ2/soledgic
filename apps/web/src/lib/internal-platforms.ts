import type { User } from '@supabase/supabase-js'

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function getInternalOperatorEmails(): string[] {
  return parseCsvEnv(
    process.env.SOLEDGIC_INTERNAL_OWNER_EMAILS ||
      process.env.INTERNAL_PLATFORM_OWNER_EMAILS ||
      process.env.PLATFORM_ADMIN_EMAILS,
  )
}

function getInternalOperatorDomains(): string[] {
  return parseCsvEnv(
    process.env.SOLEDGIC_INTERNAL_OWNER_DOMAINS ||
      process.env.INTERNAL_PLATFORM_OWNER_DOMAINS,
  )
}

export function isInternalPlatformOperatorEmail(email: string | null | undefined): boolean {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return false

  if (getInternalOperatorEmails().includes(normalized)) {
    return true
  }

  const domain = normalized.split('@')[1] || ''
  if (!domain) return false

  return getInternalOperatorDomains().includes(domain)
}

export function isPlatformOperatorUser(user: User | null | undefined): boolean {
  if (!user) return false
  // SECURITY: Only use email allowlist (env vars). Never trust user_metadata
  // because it is writable by the user via supabase.auth.updateUser().
  return isInternalPlatformOperatorEmail(user.email)
}

export function buildDefaultBillingSettingsForOwner(email: string | null | undefined) {
  const now = new Date().toISOString()

  if (isInternalPlatformOperatorEmail(email)) {
    return {
      pricing_mode: 'internal' as const,
      billing_bypass: true,
      bypass_reason: 'internal_platform',
      bypass_enabled_at: now,
      bypass_enabled_by: email || null,
      last_updated_at: now,
    }
  }

  return {
    pricing_mode: 'self_serve' as const,
    billing_bypass: false,
    last_updated_at: now,
  }
}
