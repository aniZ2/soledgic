import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Keep the original response — if getUser() fails we return this
  // instead of a response that might clear auth cookies
  const originalResponse = NextResponse.next({ request })
  let supabaseResponse = originalResponse
  let setAllCalled = false
  let pendingCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []

  // Avoid refresh-token rotation races on non-idempotent requests (notably
  // Next.js Server Actions, which are POSTs). We'll refresh on the subsequent
  // GET navigation/refresh instead.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return originalResponse
  }

  // Only check auth cookies for this project; ignore stale cookies from
  // other Supabase projects that may exist in the same browser.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const authCookieBase = `sb-${projectRef}-auth-token`
  const authCookies = request.cookies
    .getAll()
    .filter(({ name }) => name === authCookieBase || name.startsWith(`${authCookieBase}.`))
  if (authCookies.length === 0) {
    return originalResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          setAllCalled = true
          pendingCookies = cookiesToSet
        },
      },
    }
  )

  // Per Supabase SSR guidance, getUser() validates and refreshes auth cookies.
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    if (!error.message.toLowerCase().includes('auth session missing')) {
      console.log('Middleware auth error:', request.nextUrl.pathname, error.message)
    }
    // Never propagate cookie-clearing headers on refresh failure.
    // Clearing cookies is correct when the session is truly invalid, but it is
    // disastrous on transient failures (network, timeouts) because it hard-logs
    // users out. Let the next request retry refresh instead.
    return originalResponse
  }

  // Apply cookie mutations only after successful auth validation.
  if (setAllCalled) {
    pendingCookies.forEach(({ name, value }) => request.cookies.set(name, value))
    supabaseResponse = NextResponse.next({ request })
    pendingCookies.forEach(({ name, value, options }) => {
      const cookieOptions = {
        ...options,
        httpOnly: typeof options?.httpOnly === 'boolean' ? options.httpOnly : false,
      }
      supabaseResponse.cookies.set(name, value, cookieOptions)
    })
  }

  // User may be null for signed-out requests. We only need to return the
  // Supabase response when it contains cookie updates.
  if (!user) {
    return setAllCalled ? supabaseResponse : originalResponse
  }

  return setAllCalled ? supabaseResponse : originalResponse
}
