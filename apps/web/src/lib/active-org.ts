import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/livemode-server'

export interface ActiveOrganizationMembership {
  organization_id: string
  role: string
}

type MembershipQueryResult = PromiseLike<{ data: unknown }>

type MembershipQuery = {
  select: (columns: string) => MembershipQueryFilters
}

type MembershipQueryFilters = {
  eq: (column: string, value: string) => MembershipQueryFilters
  order: (column: string, options: { ascending: boolean }) => MembershipQueryFilters
  limit: (count: number) => MembershipQueryFilters
  maybeSingle: () => MembershipQueryResult
}

export type MembershipQueryClient = {
  from: (table: 'organization_members') => MembershipQuery
}

export function asMembershipQueryClient(client: unknown): MembershipQueryClient {
  return client as MembershipQueryClient
}

function normalizeMembership(value: unknown): ActiveOrganizationMembership | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const organizationId =
    typeof (value as { organization_id?: unknown }).organization_id === 'string'
      ? (value as { organization_id: string }).organization_id
      : null
  if (!organizationId) return null

  const role =
    typeof (value as { role?: unknown }).role === 'string'
      ? (value as { role: string }).role
      : 'member'

  return {
    organization_id: organizationId,
    role,
  }
}

export async function resolveActiveOrganizationMembershipForClient(
  supabase: MembershipQueryClient,
  userId: string,
  activeOrgId: string | null,
): Promise<ActiveOrganizationMembership | null> {
  if (activeOrgId) {
    const { data } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userId)
      .eq('organization_id', activeOrgId)
      .eq('status', 'active')
      .maybeSingle()

    const membership = normalizeMembership(data)
    if (membership) return membership
  }

  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return normalizeMembership(data)
}

export async function getActiveOrganizationMembership(
  userId: string,
): Promise<ActiveOrganizationMembership | null> {
  const supabase = await createClient()
  const activeOrgId = await getActiveOrgId()
  return resolveActiveOrganizationMembershipForClient(asMembershipQueryClient(supabase), userId, activeOrgId)
}

/**
 * Resolve the active organization ID for the current user.
 * Multi-org safe: uses the active org cookie, falls back to first membership.
 * Returns null if user has no active memberships.
 *
 * Use this instead of .from('organization_members').eq('user_id', ...).single()
 */
export async function getActiveOrganizationId(userId: string): Promise<string | null> {
  const membership = await getActiveOrganizationMembership(userId)
  return membership?.organization_id ?? null
}
