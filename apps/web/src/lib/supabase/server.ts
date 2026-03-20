import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getActiveOrganizationMembership } from '@/lib/active-org'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

// Helper to get current user
export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Helper to get user with organization
export async function getUserWithOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const membership = await getActiveOrganizationMembership(user.id)

  let organization: Record<string, unknown> | null = null
  if (membership) {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, slug, plan, limits')
      .eq('id', membership.organization_id)
      .maybeSingle()
    organization = data
  }

  return {
    ...user,
    membership: membership || null,
    organization,
    role: membership?.role || null,
  }
}

// Helper to require auth (redirect if not logged in)
export async function requireAuth() {
  const user = await getUser()
  if (!user) {
    const { redirect } = await import('next/navigation')
    redirect('/login')
  }
  return user
}

// Helper to require org membership
export async function requireOrgMembership() {
  const userWithOrg = await getUserWithOrg()
  if (!userWithOrg) {
    const { redirect } = await import('next/navigation')
    redirect('/login')
    throw new Error('unreachable')
  }
  if (!userWithOrg.organization) {
    const { redirect } = await import('next/navigation')
    redirect('/onboarding')
  }
  return userWithOrg
}
