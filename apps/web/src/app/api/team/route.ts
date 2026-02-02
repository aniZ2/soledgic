import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { canAddTeamMember } from '@/lib/entitlements'
import { sendTeamInviteEmail } from '@/lib/email'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}

// GET /api/team — List members, invitations, and org info
export const GET = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    // Get caller's membership + org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization membership found' },
        { status: 404 }
      )
    }

    const { organization_id, role: currentUserRole } = membership

    // Get org details
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, plan, status, max_team_members, current_member_count')
      .eq('id', organization_id)
      .single()

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Get all active members
    const { data: members } = await supabase
      .from('organization_members')
      .select('id, user_id, role, status, created_at')
      .eq('organization_id', organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    // Enrich members with user info via service client
    const serviceClient = createServiceClient()
    const enrichedMembers = await Promise.all(
      (members || []).map(async (member) => {
        const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(member.user_id)
        return {
          ...member,
          email: authUser?.email || null,
          full_name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || null,
        }
      })
    )

    // Get pending invitations
    const { data: invitations } = await supabase
      .from('organization_invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('organization_id', organization_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    return NextResponse.json({
      members: enrichedMembers,
      invitations: invitations || [],
      current_user_id: user!.id,
      current_user_role: currentUserRole,
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        max_team_members: org.max_team_members,
        current_member_count: org.current_member_count,
      },
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/team',
  }
)

// POST /api/team — Send invitation
export const POST = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    const { data: body, error: parseError } = await parseJsonBody<{
      email: string
      role: string
    }>(request)

    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || 'Invalid request body' },
        { status: 400 }
      )
    }

    const { email, role } = body

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      )
    }

    // Validate role
    const allowedRoles = ['admin', 'member', 'viewer']
    if (!role || !allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Role must be admin, member, or viewer' },
        { status: 400 }
      )
    }

    // Get caller's membership + org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization membership found' },
        { status: 404 }
      )
    }

    const callerRole = membership.role

    // Permission check: only owner or admin can invite
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can invite team members' },
        { status: 403 }
      )
    }

    // Admin cannot invite as admin (only owner can)
    if (role === 'admin' && callerRole !== 'owner') {
      return NextResponse.json(
        { error: 'Only the organization owner can invite admins' },
        { status: 403 }
      )
    }

    // Get org for entitlement check
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, plan, status, max_team_members, current_member_count, max_ledgers, current_ledger_count')
      .eq('id', membership.organization_id)
      .single()

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Entitlement check
    const entitlement = canAddTeamMember(org)
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: entitlement.message, code: entitlement.code },
        { status: entitlement.httpStatus }
      )
    }

    // Check for existing pending invite for same email
    const { data: existingInvite } = await supabase
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', org.id)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingInvite) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email address' },
        { status: 409 }
      )
    }

    // Check if email belongs to an existing user who is already a member.
    // GoTrue admin API doesn't support email filtering, so we fetch the user
    // via a direct REST call to the admin endpoint with email filter.
    const serviceClient = createServiceClient()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    try {
      const res = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email.toLowerCase())}`,
        {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
        }
      )

      if (res.ok) {
        const { users } = await res.json()
        const existingUser = users?.find(
          (u: any) => u.email?.toLowerCase() === email.toLowerCase()
        )

        if (existingUser) {
          const { data: existingMember } = await supabase
            .from('organization_members')
            .select('id, status')
            .eq('organization_id', org.id)
            .eq('user_id', existingUser.id)
            .single()

          if (existingMember?.status === 'active') {
            return NextResponse.json(
              { error: 'This person is already a member of your organization' },
              { status: 409 }
            )
          }
        }
      }
    } catch {
      // Non-critical — the invite will still work; accept flow handles duplicates
    }

    // Create invitation
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { error: insertError } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: org.id,
        email: email.toLowerCase(),
        role,
        token,
        invited_by: user!.id,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('Invitation insert error:', insertError.code)
      return NextResponse.json(
        { error: 'Failed to create invitation. Please try again.' },
        { status: 500 }
      )
    }

    // Send email (non-blocking — invite is created regardless)
    const inviterName = user!.email?.split('@')[0] || 'A team member'
    const emailResult = await sendTeamInviteEmail({
      to: email.toLowerCase(),
      orgName: org.name,
      inviterName,
      role,
      token,
    })

    return NextResponse.json({
      success: true,
      ...(emailResult.success ? {} : { warning: 'Invitation created but the email could not be sent. Share the invite link manually.' }),
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/team',
  }
)
