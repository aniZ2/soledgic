import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = formData.get('redirect') as string || '/dashboard'

  const cookieStore = await cookies()

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')

  // Build origin from headers for proper redirect (handles proxy correctly)
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

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

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}&redirect=${encodeURIComponent(redirectTo)}`,
      { status: 303 }
    )
  }

  if (!data.session) {
    return NextResponse.redirect(
      `${origin}/login?error=Login failed&redirect=${encodeURIComponent(redirectTo)}`,
      { status: 303 }
    )
  }

  // Check if user has an active organization membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .single()

  const finalRedirect = membership ? redirectTo : '/onboarding'

  const response = NextResponse.redirect(`${origin}${finalRedirect}`, { status: 303 })

  // Set cookies on the redirect response
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, {
      path: options.path ?? '/',
      maxAge: options.maxAge,
      httpOnly: false,
      sameSite: (options.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
      secure: isSecure,
    })
  }

  return response
}
