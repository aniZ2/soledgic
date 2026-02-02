import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'

function getInviteIdFromUrl(request: Request): string | null {
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  // /api/team/invitations/[inviteId] → segments: ['', 'api', 'team', 'invitations', '<inviteId>']
  return segments[4] || null
}

// DELETE /api/team/invitations/[inviteId] — Revoke pending invitation
export const DELETE = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()
    const inviteId = getInviteIdFromUrl(request)

    if (!inviteId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
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

    // Only owner or admin can revoke invitations
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can revoke invitations' },
        { status: 403 }
      )
    }

    // Get the invitation — must belong to caller's org and be pending
    const { data: invitation } = await supabase
      .from('organization_invitations')
      .select('id, status')
      .eq('id', inviteId)
      .eq('organization_id', callerMembership.organization_id)
      .eq('status', 'pending')
      .single()

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or already processed' },
        { status: 404 }
      )
    }

    // Revoke
    const { error: revokeError } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', inviteId)

    if (revokeError) {
      console.error('Invitation revoke error:', revokeError.code)
      return NextResponse.json(
        { error: 'Failed to revoke invitation. Please try again.' },
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
