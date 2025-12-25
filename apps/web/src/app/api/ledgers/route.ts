import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'

// POST /api/ledgers - Create a new ledger
export const POST = createApiHandler(
  async (request, { user, requestId }) => {
    const supabase = await createClient()

    const { data: body, error: parseError } = await parseJsonBody<{
      platform_name: string
      organization_id: string
    }>(request)

    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || 'Invalid request body' },
        { status: 400 }
      )
    }

    const { platform_name, organization_id } = body

    if (!platform_name || !organization_id) {
      return NextResponse.json(
        { error: 'platform_name and organization_id are required' },
        { status: 400 }
      )
    }

    // Verify user is member of organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 403 }
      )
    }

    // Check plan limits
    const { data: org } = await supabase
      .from('organizations')
      .select('max_ledgers, current_ledger_count, plan')
      .eq('id', organization_id)
      .single()

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Scale plan has unlimited (-1)
    if (org.max_ledgers !== -1 && org.current_ledger_count >= org.max_ledgers) {
      // Allow overage, but flag it
      // In production, you'd check if they're okay with overage billing
    }

    // Create ledger
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .insert({
        platform_name,
        organization_id,
        owner_email: user!.email,
        status: 'active',
        settings: {
          default_platform_fee_percent: 20,
          tax_withholding_percent: 0,
          min_payout_amount: 10,
          payout_schedule: 'manual',
        },
      })
      .select()
      .single()

    if (ledgerError) {
      console.error(`[${requestId}] Ledger creation failed:`, ledgerError.code)
      return NextResponse.json(
        { error: 'Failed to create ledger. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, ledger })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/ledgers'
  }
)

// GET /api/ledgers - List ledgers for authenticated user
export const GET = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    // Get user's organizations
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user!.id)
      .eq('status', 'active')

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ ledgers: [] })
    }

    const orgIds = memberships.map(m => m.organization_id)

    // Get ledgers for those organizations
    const { data: ledgers, error } = await supabase
      .from('ledgers')
      .select('*')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Ledger fetch error:', error.code)
      return NextResponse.json(
        { error: 'Failed to fetch ledgers' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ledgers })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: false, // GET requests don't need CSRF
    routePath: '/api/ledgers'
  }
)
