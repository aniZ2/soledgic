import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

async function handleSignOut(request: Request) {
  const cookieStore = await cookies()
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

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

  await supabase.auth.signOut()

  const response = NextResponse.redirect(`${origin}/login`, { status: 303 })

  // Set cookies (including deletions) directly on the response
  // Note: httpOnly must be false (Supabase default) so client SDK can read session
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, {
      path: options.path ?? '/',
      maxAge: options.maxAge,
      httpOnly: options.httpOnly ?? false,
      sameSite: (options.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
      secure: isSecure,
    })
  }

  return response
}

export async function POST(request: Request) {
  return handleSignOut(request)
}

export async function GET(request: Request) {
  return handleSignOut(request)
}
