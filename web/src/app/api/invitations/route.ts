import { createClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { organization_id, email, role } = body

    // Verify user is owner or admin and get org details
    const { data: membershipData } = await supabase
      .from('organization_members')
      .select(`
        role,
        organizations (
          name
        )
      `)
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membershipData || !['owner', 'admin'].includes(membershipData.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if user already a member
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('user_id', (
        await supabase.from('user_profiles').select('id').eq('email', email).single()
      ).data?.id)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: 'User is already a member' }, { status: 400 })
    }

    // Create invitation
    const { data: invitation, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id,
        email,
        role: role || 'member',
        invited_by: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send invitation email
    // Handle both array and object response from Supabase join
    const orgs = membershipData.organizations as { name: string } | { name: string }[] | null
    const orgName = Array.isArray(orgs) ? orgs[0]?.name : orgs?.name || 'the organization'
    const inviterName = user.email || 'A team member'

    const emailResult = await sendInvitationEmail({
      email,
      organizationName: orgName,
      inviterName,
      role: role || 'member',
      invitationId: invitation.id,
    })

    if (!emailResult.success) {
      // Log error but don't fail the request - invitation was created
      console.error('Failed to send invitation email:', emailResult.error)
    }

    return NextResponse.json({
      invitation,
      emailSent: emailResult.success
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
