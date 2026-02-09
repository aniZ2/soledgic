import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

// Debug endpoint to check session state
export async function GET(request: Request) {
  const cookieStore = await cookies()
  const headersList = await headers()
  const allCookies = cookieStore.getAll()

  // Check what host/domain the request is coming from
  const host = headersList.get('host')
  const forwardedHost = headersList.get('x-forwarded-host')
  const forwardedProto = headersList.get('x-forwarded-proto')
  const requestUrl = request.url

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
    request: {
      host,
      forwardedHost,
      forwardedProto,
      url: requestUrl,
    },
    cookies: {
      total: allCookies.length,
      all: allCookies.map(c => c.name),
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
