import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'

// GET /api/organizations - List organizations for authenticated user
export const GET = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    // Get user's organizations
    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization:organizations(*)
      `)
      .eq('user_id', user!.id)
      .eq('status', 'active')

    if (error) {
      console.error('Organization fetch error:', error.code)
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      )
    }

    const organizations = memberships?.map(m => ({
      ...m.organization,
      role: m.role,
    })) || []

    return NextResponse.json({ organizations })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: false, // GET requests don't need CSRF
    routePath: '/api/organizations'
  }
)

// PATCH /api/organizations - Update organization settings
export const PATCH = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    const { data: body, error: parseError } = await parseJsonBody<{
      name?: string
      settings?: Record<string, unknown>
    }>(request)

    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || 'Invalid request body' },
        { status: 400 }
      )
    }

    // Get user's membership
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

    // Only owner and admin can update organization
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can update organization settings' },
        { status: 403 }
      )
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (body.name?.trim()) {
      updates.name = body.name.trim()
    }
    if (body.settings) {
      // Merge settings instead of replacing
      const { data: currentOrg } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', membership.organization_id)
        .single()

      updates.settings = {
        ...(currentOrg?.settings || {}),
        ...body.settings,
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', membership.organization_id)

    if (updateError) {
      console.error('Organization update error:', updateError.code)
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/organizations'
  }
)

// DELETE /api/organizations - Delete organization (owner only)
export const DELETE = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    // Get user's membership
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

    // Only owner can delete organization
    if (membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the organization owner can delete the organization' },
        { status: 403 }
      )
    }

    // Soft delete: set status to 'deleted'
    // This preserves data for potential recovery
    const { error: deleteError } = await supabase
      .from('organizations')
      .update({ status: 'deleted' })
      .eq('id', membership.organization_id)

    if (deleteError) {
      console.error('Organization delete error:', deleteError.code)
      return NextResponse.json(
        { error: 'Failed to delete organization' },
        { status: 500 }
      )
    }

    // Also mark all memberships as removed
    await supabase
      .from('organization_members')
      .update({ status: 'removed' })
      .eq('organization_id', membership.organization_id)

    return NextResponse.json({ success: true })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/organizations'
  }
)
