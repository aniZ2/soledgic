import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createApiHandler } from '@/lib/api-handler'
import { getPublicAppUrl } from '@/lib/public-url'
import { NextResponse } from 'next/server'

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const normalized = email.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function getSafeRedirectOrigin(requestUrl: URL): string {
  const requestOrigin = requestUrl.origin

  try {
    const configuredOrigin = new URL(getPublicAppUrl()).origin
    if (requestOrigin === configuredOrigin) return requestOrigin
    if (process.env.NODE_ENV !== 'production') return requestOrigin
    return configuredOrigin
  } catch {
    return requestOrigin
  }
}

export const GET = createApiHandler(
  async (request) => {
    const requestUrl = new URL(request.url)
    const { searchParams } = requestUrl
    const origin = getSafeRedirectOrigin(requestUrl)
    const token = (searchParams.get('token') || '').trim()
    const encodedToken = encodeURIComponent(token)

    if (!token) {
      return NextResponse.redirect(`${origin}/login?error=invalid_token`)
    }

    const supabase = await createClient()

    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(`${origin}/login?invite=${encodedToken}`)
    }

    const userEmail = normalizeEmail(user.email)
    if (!userEmail) {
      return NextResponse.redirect(`${origin}/dashboard?error=invitation_email_required`)
    }

    const serviceClient = (() => {
      try {
        return createServiceRoleClient()
      } catch (error) {
        console.error('Accept invitation - service client error:', error)
        return null
      }
    })()
    if (!serviceClient) {
      return NextResponse.redirect(`${origin}/dashboard?error=accept_failed`)
    }

    // Validate token: must be pending and not expired
    const { data: invitation, error: inviteError } = await serviceClient
      .from('organization_invitations')
      .select('*')
      .eq('token', token)
      .single()

    if (inviteError || !invitation) {
      return NextResponse.redirect(`${origin}/dashboard?error=invitation_not_found`)
    }

    if (invitation.status !== 'pending') {
      return NextResponse.redirect(`${origin}/dashboard?error=invitation_${invitation.status}`)
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.redirect(`${origin}/dashboard?error=invitation_expired`)
    }

    const invitationEmail = normalizeEmail(invitation.email)
    if (!invitationEmail || invitationEmail !== userEmail) {
      return NextResponse.redirect(`${origin}/dashboard?error=invitation_email_mismatch`)
    }

    // Check if user is already an active member
    const { data: existingMember, error: existingMemberError } = await serviceClient
      .from('organization_members')
      .select('id, status')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMemberError) {
      return NextResponse.redirect(`${origin}/dashboard?error=accept_failed`)
    }

    if (existingMember) {
      if (existingMember.status === 'active') {
        // Already a member - mark invite as accepted and redirect
        await serviceClient
          .from('organization_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', invitation.id)
          .eq('status', 'pending')

        return NextResponse.redirect(`${origin}/dashboard?success=already_member`)
      }

      // Re-invite of a removed member - reactivate with new role
      const { error: reactivateError } = await serviceClient
        .from('organization_members')
        .update({
          status: 'active',
          role: invitation.role,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', existingMember.id)

      if (reactivateError) {
        return NextResponse.redirect(`${origin}/dashboard?error=accept_failed`)
      }
    } else {
      // Insert new membership
      const { error: memberError } = await serviceClient
        .from('organization_members')
        .insert({
          organization_id: invitation.organization_id,
          user_id: user.id,
          role: invitation.role,
          invited_by: invitation.invited_by,
          invited_at: invitation.created_at,
          accepted_at: new Date().toISOString(),
          status: 'active',
        })

      if (memberError) {
        if (memberError.code !== '23505') {
          console.error('Accept invitation - member insert error:', memberError.code)
          return NextResponse.redirect(`${origin}/dashboard?error=accept_failed`)
        }
        // Another concurrent accept request created membership first.
        console.warn('Accept invitation - membership already created concurrently')
      }
    }

    // Mark invitation as accepted
    const { error: inviteUpdateError } = await serviceClient
      .from('organization_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)
      .eq('status', 'pending')

    if (inviteUpdateError) {
      console.error('Accept invitation - invite update error:', inviteUpdateError.code)
      return NextResponse.redirect(`${origin}/dashboard?error=accept_failed`)
    }

    return NextResponse.redirect(`${origin}/dashboard?success=invitation_accepted`)
  },
  {
    requireAuth: false,
    csrfProtection: false, // GET requests don't need CSRF
    rateLimit: true,
    routePath: '/api/invitations/accept',
    rateLimitConfig: { requests: 60, windowMs: 60_000 },
  }
)
