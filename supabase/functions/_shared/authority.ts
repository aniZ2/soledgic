// Authority hierarchy for Soledgic action enforcement.
// Higher authority can override lower authority, never the reverse.
//
// soledgic_system (3) — fraud holds, compliance blocks, auto-restrictions
// org_operator    (2) — business holds, manual freezes by org admin
// platform_api    (1) — standard holds from platform API integration

export type AuthorityLevel = 'soledgic_system' | 'org_operator' | 'platform_api'

const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
  soledgic_system: 3,
  org_operator: 2,
  platform_api: 1,
}

/** Returns true if the caller's authority is sufficient to override the target's authority. */
export function canOverride(callerAuthority: AuthorityLevel, targetAuthority: AuthorityLevel): boolean {
  return AUTHORITY_RANK[callerAuthority] >= AUTHORITY_RANK[targetAuthority]
}

/** Rank a raw string into an AuthorityLevel, defaulting to platform_api. */
export function toAuthorityLevel(raw: string | null | undefined): AuthorityLevel {
  if (raw === 'soledgic_system' || raw === 'org_operator' || raw === 'platform_api') {
    return raw
  }
  return 'platform_api'
}
