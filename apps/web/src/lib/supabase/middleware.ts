import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Get cookie domain - use root domain to work across www and non-www
function getCookieDomain(host: string): string | undefined {
  // In development, don't set domain (use default)
  if (host.includes('localhost')) return undefined
  // For production, use root domain with leading dot
  if (host.includes('soledgic.com')) return '.soledgic.com'
  return undefined
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const cookieDomain = getCookieDomain(request.headers.get('host') || '')

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // Set domain to root so cookies work across www and non-www
              ...(cookieDomain && { domain: cookieDomain }),
            })
          )
        },
      },
    }
  )

  // Just refresh the session - let pages handle their own auth redirects
  await supabase.auth.getUser()

  return supabaseResponse
}
