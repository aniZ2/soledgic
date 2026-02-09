import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

// Debug endpoint to see what cookies would be set on login
export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cookieStore = await cookies()
  const headersList = await headers()

  // Get request info
  const host = headersList.get('host')
  const forwardedHost = headersList.get('x-forwarded-host')
  const forwardedProto = headersList.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')

  // Collect cookies that Supabase wants to set
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookies) {
          cookiesToSet.push(...cookies)
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Build what the Set-Cookie headers would look like
  const setCookieHeaders: string[] = []
  for (const { name, value, options } of cookiesToSet) {
    const parts = [`${name}=${value.substring(0, 50)}...`]
    parts.push(`Path=${options.path ?? '/'}`)
    if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`)
    if (options.domain) parts.push(`Domain=${options.domain}`)
    if (isSecure) parts.push('Secure')
    parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
    if (options.httpOnly) parts.push('HttpOnly')
    setCookieHeaders.push(parts.join('; '))
  }

  return NextResponse.json({
    request: {
      host,
      forwardedHost,
      forwardedProto,
      isSecure,
      url: request.url,
    },
    auth: {
      success: !error,
      error: error?.message,
      hasSession: !!data?.session,
      userId: data?.user?.id,
    },
    cookies: {
      count: cookiesToSet.length,
      details: cookiesToSet.map(c => ({
        name: c.name,
        valueLength: c.value?.length,
        options: c.options,
      })),
      setCookieHeaders,
    },
  })
}
