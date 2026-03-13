export interface EcosystemPlatformSummary {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string | null
}

export interface CurrentEcosystemSummary {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  role: 'owner' | 'admin' | 'member' | null
  canManage: boolean
  currentOrganizationId: string
  platformCount: number
  platforms: EcosystemPlatformSummary[]
}

export function slugifyEcosystemValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function isValidEcosystemSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}
