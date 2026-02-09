import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // First update the request cookies (for downstream middleware/routes)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Create new response with updated request
          supabaseResponse = NextResponse.next({
            request,
          })
          // Set cookies on the response (this goes back to browser)
          // Explicitly keep httpOnly: false so client JS can read session cookies
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

  // IMPORTANT: This refreshes the session and triggers setAll if token needs updating
  // getUser() validates with Supabase server and refreshes expired tokens
  const { data: { user }, error } = await supabase.auth.getUser()

  // Log for debugging (remove in production)
  if (error) {
    console.log('Middleware auth error:', error.message)
  }

  return supabaseResponse
}
