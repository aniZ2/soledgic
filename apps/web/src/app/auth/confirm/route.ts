import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | null

  if (token_hash && type) {
    const supabase = await createClient()

    // Handle different confirmation types
    if (type === 'signup' || type === 'email') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type === 'signup' ? 'signup' : 'email_change',
      })

      if (!error) {
        // Email confirmed, check if user has an organization
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data: membership } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()

          // Redirect to onboarding if no organization, otherwise dashboard
          if (!membership) {
            return NextResponse.redirect(`${origin}/onboarding`)
          }
        }

        return NextResponse.redirect(`${origin}/dashboard?confirmed=true`)
      }

      return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
    }

    // Recovery type should use the reset-password route
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/reset-password?token_hash=${token_hash}&type=recovery`)
    }

    // Invite type - handle team invitations
    if (type === 'invite') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: 'invite',
      })

      if (!error) {
        return NextResponse.redirect(`${origin}/dashboard?invited=true`)
      }

      return NextResponse.redirect(`${origin}/login?error=invite_failed`)
    }
  }

  // No token or invalid type
  return NextResponse.redirect(`${origin}/login?error=invalid_confirmation_link`)
}
