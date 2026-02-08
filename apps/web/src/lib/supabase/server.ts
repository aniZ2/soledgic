import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// 30 days in seconds
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

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
              cookieStore.set(name, value, {
                ...options,
                maxAge: COOKIE_MAX_AGE,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              })
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
    throw new Error('unreachable')
  }
  if (!userWithOrg.organization) {
    const { redirect } = await import('next/navigation')
    redirect('/onboarding')
  }
  return userWithOrg
}
