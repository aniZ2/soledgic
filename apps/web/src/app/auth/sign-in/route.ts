import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = formData.get('redirect') as string || '/dashboard'

  const { origin } = new URL(request.url)
  const cookieStore = await cookies()

  // Collect cookies to set on the response
  const responseCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Collect cookies - we'll set them on the response object
          responseCookies.push(...cookiesToSet)
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

  // Check if user has an organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', data.user.id)
    .single()

  const finalRedirect = membership ? `${origin}${redirectTo}` : `${origin}/onboarding`

  // Create redirect response and set cookies directly on it
  const response = NextResponse.redirect(finalRedirect, { status: 303 })

  // Set each cookie on the response
  // Always use secure cookies on soledgic.com (production HTTPS)
  const isProduction = origin.includes('soledgic.com') || origin.includes('vercel.app')

  for (const { name, value, options } of responseCookies) {
    response.cookies.set(name, value, {
      ...options,
      path: '/',
      sameSite: 'lax',
      secure: isProduction,
    })
  }

  return response
}
