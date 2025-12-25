import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
        setAll(cookiesToSet) {
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

  // Get user's organization membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(
        id,
        name,
        slug,
        plan,
        limits
      )
    `)
    .eq('user_id', user.id)
    .single()

  return {
    ...user,
    membership: membership || null,
    organization: membership?.organization || null,
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
  }
  if (!userWithOrg.organization) {
    const { redirect } = await import('next/navigation')
    redirect('/onboarding')
  }
  return userWithOrg
}
