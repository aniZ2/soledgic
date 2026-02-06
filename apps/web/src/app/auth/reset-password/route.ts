import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  // Handle the recovery token from Supabase email link
  if (token_hash && type === 'recovery') {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: 'recovery',
    })

    if (!error) {
      // Token verified, redirect to reset password form
      // The session is now established with the recovery token
      return NextResponse.redirect(`${origin}/reset-password`)
    }

    // Token verification failed
    return NextResponse.redirect(`${origin}/login?error=invalid_recovery_link`)
  }

  // No token or wrong type, redirect to forgot password
  return NextResponse.redirect(`${origin}/forgot-password?error=missing_token`)
}
