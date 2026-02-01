import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=invalid_token`)
  }

  const supabase = await createClient()

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?invite=${token}`)
  }

  // Validate token: must be pending and not expired
  const { data: invitation, error: inviteError } = await supabase
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

  // Check if user is already an active member
  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id, status')
    .eq('organization_id', invitation.organization_id)
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    if (existingMember.status === 'active') {
      // Already a member — mark invite as accepted and redirect
      await supabase
        .from('organization_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      return NextResponse.redirect(`${origin}/dashboard?success=already_member`)
    }

    // Re-invite of a removed member — reactivate with new role
    const { error: reactivateError } = await supabase
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
    const { error: memberError } = await supabase
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
      console.error('Accept invitation — member insert error:', memberError.code)
      return NextResponse.redirect(`${origin}/dashboard?error=accept_failed`)
    }
  }

  // Mark invitation as accepted
  await supabase
    .from('organization_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)

  return NextResponse.redirect(`${origin}/dashboard?success=invitation_accepted`)
}
