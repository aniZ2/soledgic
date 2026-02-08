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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Use Supabase's default options - don't override httpOnly
          // This allows client-side JS to read the session
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
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
    // Redirect back to login with error
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

  // If no organization, redirect to onboarding
  if (!membership) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // Success - redirect to dashboard (or requested page)
  return NextResponse.redirect(`${origin}${redirectTo}`)
}
