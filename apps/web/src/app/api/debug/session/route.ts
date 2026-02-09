import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Debug endpoint to check session state
export async function GET() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return allCookies
        },
        setAll() {
          // Read-only for this debug endpoint
        },
      },
    }
  )

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  // Find auth-related cookies
  const authCookies = allCookies.filter(c =>
    c.name.includes('auth') || c.name.includes('sb-')
  )

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    cookies: {
      total: allCookies.length,
      authRelated: authCookies.map(c => ({
        name: c.name,
        valueLength: c.value?.length || 0,
        valuePreview: c.value?.substring(0, 50) + '...',
      })),
    },
    session: {
      exists: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
      expiresAt: session?.expires_at,
      error: sessionError?.message,
    },
    user: {
      exists: !!user,
      id: user?.id,
      email: user?.email,
      error: userError?.message,
    },
  })
}
