import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

// Debug endpoint to check session state
export async function GET(request: Request) {
  // These endpoints are deployed to a public URL in production. Never expose
  // raw tokens or cookie values without an explicit opt-in gate.
  const debugSecret = process.env.DEBUG_SECRET
  const providedSecret =
    request.headers.get('x-debug-secret') ||
    new URL(request.url).searchParams.get('secret')

  if (process.env.NODE_ENV === 'production') {
    if (!debugSecret || providedSecret !== debugSecret) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const cookieStore = await cookies()
  const headersList = await headers()
  const allCookies = cookieStore.getAll()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const authCookieBase = `sb-${projectRef}-auth-token`

  // Check what host/domain the request is coming from
  const host = headersList.get('host')
  const forwardedHost = headersList.get('x-forwarded-host')
  const forwardedProto = headersList.get('x-forwarded-proto')
  const requestUrl = request.url

  const pendingAuthCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []

  function isLikelyCookieDeletion(cookie: { name: string; value: string; options?: Record<string, unknown> }): boolean {
    if (!cookie.value) return true
    const opts = (cookie.options ?? {}) as any
    if (typeof opts.maxAge === 'number' && opts.maxAge <= 0) return true
    if (opts.expires) {
      const exp = opts.expires instanceof Date ? opts.expires : new Date(opts.expires)
      if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) return true
    }
    return false
  }

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return allCookies
        },
        setAll(cookiesToSet) {
          pendingAuthCookies.push(...cookiesToSet)
        },
      },
    }
  )

  // getUser() validates with Supabase Auth server (works with httpOnly cookies).
  // IMPORTANT: Only apply cookie updates if this succeeds. On transient errors or
  // refresh-token rotation races Supabase may enqueue cookie deletions; we do not
  // want this debug endpoint to wipe a live session.
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  // Find auth-related cookies (chunked cookies use .0, .1 suffixes)
  const authCookies = allCookies.filter(c => c.name.startsWith('sb-'))
  const matchedAuthCookies = allCookies.filter(
    c => c.name === authCookieBase || c.name.startsWith(`${authCookieBase}.`)
  )

  const response = NextResponse.json({
    timestamp: new Date().toISOString(),
    request: {
      host,
      forwardedHost,
      forwardedProto,
      url: requestUrl,
    },
    supabase: {
      projectRef,
      authCookieBase,
    },
    cookies: {
      total: allCookies.length,
      all: allCookies.map(c => c.name),
      matchedAuth: matchedAuthCookies.map(c => ({
        name: c.name,
        valueLength: c.value?.length || 0,
      })),
      authRelated: authCookies.map(c => ({
        name: c.name,
        valueLength: c.value?.length || 0,
      })),
    },
    cookieMutations: pendingAuthCookies.map(c => ({
      name: c.name,
      likelyDeletion: isLikelyCookieDeletion(c),
      options: c.options ?? null,
    })),
    session: {
      exists: !!session,
      expires_at: session?.expires_at ?? null,
      expires_in: session?.expires_in ?? null,
      error: sessionError?.message ?? null,
    },
    user: {
      exists: !!user,
      id: user?.id,
      email: user?.email,
      error: userError?.message ?? null,
    },
  })

  if (!userError) {
    for (const { name, value, options } of pendingAuthCookies) {
      response.cookies.set(name, value, options as any)
    }
  }

  return response
}
