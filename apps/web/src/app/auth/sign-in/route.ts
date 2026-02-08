import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = formData.get('redirect') as string || '/dashboard'

  const { origin } = new URL(request.url)

  // Collect cookies to set on the response
  const cookiesToSet: { name: string; value: string; options: any }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get('cookie')?.split('; ').map(c => {
            const [name, ...rest] = c.split('=')
            return { name, value: rest.join('=') }
          }) || []
        },
        setAll(cookies) {
          // Collect cookies to set later on the response
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
      `${origin}/login?error=${encodeURIComponent(error.message)}&redirect=${encodeURIComponent(redirectTo)}`
    )
  }

  if (!data.session) {
    return NextResponse.redirect(
      `${origin}/login?error=Login failed - no session created&redirect=${encodeURIComponent(redirectTo)}`
    )
  }

  // Check if user has an organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', data.user.id)
    .single()

  // Determine redirect URL
  const finalRedirect = membership ? `${origin}${redirectTo}` : `${origin}/onboarding`

  // Create response and set cookies on it
  const response = NextResponse.redirect(finalRedirect)

  // Set all cookies on the response
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options)
  }

  return response
}
