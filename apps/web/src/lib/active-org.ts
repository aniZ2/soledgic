import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/livemode-server'

/**
 * Resolve the active organization ID for the current user.
 * Multi-org safe: uses the active org cookie, falls back to first membership.
 * Returns null if user has no active memberships.
 *
 * Use this instead of .from('organization_members').eq('user_id', ...).single()
 */
export async function getActiveOrganizationId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const activeOrgId = await getActiveOrgId()

  if (activeOrgId) {
    // Verify user is actually a member of this org
    const { data } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', activeOrgId)
      .eq('status', 'active')
      .maybeSingle()

    if (data) return data.organization_id
  }

  // No cookie or invalid — pick first active membership
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.organization_id ?? null
}
