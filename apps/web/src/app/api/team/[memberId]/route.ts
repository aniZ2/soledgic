import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'

function getMemberIdFromUrl(request: Request): string | null {
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  // /api/team/[memberId] → segments: ['', 'api', 'team', '<memberId>']
  return segments[3] || null
}

// PATCH /api/team/[memberId] — Change member role
export const PATCH = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()
    const memberId = getMemberIdFromUrl(request)

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      )
    }

    const { data: body, error: parseError } = await parseJsonBody<{
      role: string
    }>(request)

    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || 'Invalid request body' },
        { status: 400 }
      )
    }

    const { role: newRole } = body

    const allowedRoles = ['admin', 'member', 'viewer']
    if (!newRole || !allowedRoles.includes(newRole)) {
      return NextResponse.json(
        { error: 'Role must be admin, member, or viewer' },
        { status: 400 }
      )
    }

    // Get caller's membership
    const { data: callerMembership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!callerMembership) {
      return NextResponse.json(
        { error: 'No organization membership found' },
        { status: 404 }
      )
    }

    const callerRole = callerMembership.role

    // Only owner or admin can change roles
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can change member roles' },
        { status: 403 }
      )
    }

    // Get target member
    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('id, user_id, role, status')
      .eq('id', memberId)
      .eq('organization_id', callerMembership.organization_id)
      .eq('status', 'active')
      .single()

    if (!targetMember) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    // Cannot change owner's role
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'The owner\u2019s role cannot be changed' },
        { status: 403 }
      )
    }

    // Cannot change own role
    if (targetMember.user_id === user!.id) {
      return NextResponse.json(
        { error: 'You cannot change your own role' },
        { status: 403 }
      )
    }

    // Admin cannot manage other admins
    if (callerRole === 'admin' && targetMember.role === 'admin') {
      return NextResponse.json(
        { error: 'Admins cannot manage other admins' },
        { status: 403 }
      )
    }

    // Admin cannot promote to admin
    if (callerRole === 'admin' && newRole === 'admin') {
      return NextResponse.json(
        { error: 'Only the organization owner can promote members to admin' },
        { status: 403 }
      )
    }

    // Apply role change
    const { error: updateError } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId)

    if (updateError) {
      console.error('Role update error:', updateError.code)
      return NextResponse.json(
        { error: 'Failed to update role. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/team',
  }
)

// DELETE /api/team/[memberId] — Remove member (soft-remove)
export const DELETE = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()
    const memberId = getMemberIdFromUrl(request)

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      )
    }

    // Get caller's membership
    const { data: callerMembership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!callerMembership) {
      return NextResponse.json(
        { error: 'No organization membership found' },
        { status: 404 }
      )
    }

    const callerRole = callerMembership.role

    // Only owner or admin can remove members
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can remove team members' },
        { status: 403 }
      )
    }

    // Get target member
    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('id, user_id, role, status')
      .eq('id', memberId)
      .eq('organization_id', callerMembership.organization_id)
      .eq('status', 'active')
      .single()

    if (!targetMember) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      )
    }

    // Cannot remove owner
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'The organization owner cannot be removed' },
        { status: 403 }
      )
    }

    // Cannot remove yourself
    if (targetMember.user_id === user!.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the organization' },
        { status: 403 }
      )
    }

    // Admin cannot remove other admins
    if (callerRole === 'admin' && targetMember.role === 'admin') {
      return NextResponse.json(
        { error: 'Admins cannot remove other admins' },
        { status: 403 }
      )
    }

    // Soft-remove: set status to 'removed' (DB trigger decrements current_member_count)
    const { error: removeError } = await supabase
      .from('organization_members')
      .update({ status: 'removed' })
      .eq('id', memberId)

    if (removeError) {
      console.error('Member removal error:', removeError.code)
      return NextResponse.json(
        { error: 'Failed to remove member. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/team',
  }
)
