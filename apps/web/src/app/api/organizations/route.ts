import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'

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
