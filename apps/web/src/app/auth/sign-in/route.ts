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

  // Track cookies that need to be set on the response
  const responseCookies: { name: string; value: string; options: any }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Store for setting on response later
            responseCookies.push({ name, value, options })
            // Also try to set via cookieStore
            try {
              cookieStore.set(name, value, options)
            } catch (e) {
              // Ignore - we'll set on response
            }
          })
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

  // Create response
  const response = NextResponse.redirect(finalRedirect)

  // Set all Supabase auth cookies on the response with httpOnly: false
  for (const { name, value, options } of responseCookies) {
    response.cookies.set(name, value, {
      ...options,
      httpOnly: false, // CRITICAL: Allow client-side JS to read
    })
  }

  return response
}
