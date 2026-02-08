import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Debug endpoint to test cookie setting
export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const cookieStore = await cookies()
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
          responseCookies.push(...cookiesToSet)
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Return debug info as JSON instead of redirecting
  return NextResponse.json({
    success: !error,
    error: error?.message,
    hasSession: !!data?.session,
    userId: data?.user?.id,
    cookiesCollected: responseCookies.map(c => ({
      name: c.name,
      valueLength: c.value?.length || 0,
      options: c.options,
    })),
  })
}
