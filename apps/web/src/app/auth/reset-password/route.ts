import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

  // Handle the recovery token from Supabase email link
  if (token_hash && type === 'recovery') {
    const cookieStore = await cookies()
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

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: 'recovery',
    })

    if (!error) {
      // Token verified, redirect to reset password form
      // The session is now established with the recovery token
      const response = NextResponse.redirect(`${origin}/reset-password`, { status: 303 })

      // Set cookies directly on the response
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

    // Token verification failed
    return NextResponse.redirect(`${origin}/login?error=invalid_recovery_link`)
  }

  // No token or wrong type, redirect to forgot password
  return NextResponse.redirect(`${origin}/forgot-password?error=missing_token`)
}
