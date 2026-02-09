import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendWelcomeEmail } from '@/lib/email'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/dashboard'

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

  if (code) {
    const cookieStore = await cookies()

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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if user has an active organization membership
      const { data: { user } } = await supabase.auth.getUser()

      let redirectUrl = `${origin}${redirect}`

      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single()

        // If no active membership, this is a new user - send welcome email
        if (!membership) {
          // Send welcome email (non-blocking)
          const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'there'
          sendWelcomeEmail({
            to: user.email!,
            name: userName,
          }).catch(console.error)

          redirectUrl = `${origin}/onboarding`
        }
      }

      const response = NextResponse.redirect(redirectUrl, { status: 303 })

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
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
