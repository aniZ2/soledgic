import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Keep the original response — if getUser() fails we return this
  // instead of a response that might clear auth cookies
  const originalResponse = NextResponse.next({ request })
  let supabaseResponse = originalResponse

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              httpOnly: false,
            })
          )
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.log('Middleware auth error:', error.message)
    // Don't return supabaseResponse — it may contain Set-Cookie headers
    // that clear the auth cookies. Return the original passthrough instead.
    return originalResponse
  }

  return supabaseResponse
}
