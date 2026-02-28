import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { getLivemode } from '@/lib/livemode-server'
import { ACTIVE_LEDGER_GROUP_COOKIE } from '@/lib/livemode'
import { canCreateLiveLedger } from '@/lib/entitlements'
import { sendSecurityAlertEmail } from '@/lib/email'
import { createHash } from 'crypto'

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

// POST /api/ledgers - Create a new ledger (paired test + live)
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

    // Creating ledgers can change billing; limit to owner/admin.
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can create new ledgers' },
        { status: 403 }
      )
    }

    // Check plan limits
    const { data: org } = await supabase
      .from('organizations')
      .select('max_ledgers, current_ledger_count, plan, status')
      .eq('id', organization_id)
      .single()

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Enforce billing status + plan limits for live ledger creation
    const entitlement = canCreateLiveLedger(org)
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: entitlement.message, code: entitlement.code },
        { status: entitlement.httpStatus }
      )
    }

    // Cap test ledgers per org to prevent spam (test ledgers don't count toward billing)
    const MAX_TEST_LEDGERS_PER_ORG = 50
    const { count: testLedgerCount } = await supabase
      .from('ledgers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('livemode', false)

    if ((testLedgerCount ?? 0) >= MAX_TEST_LEDGERS_PER_ORG) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_TEST_LEDGERS_PER_ORG} test ledgers per organization.` },
        { status: 429 }
      )
    }

    // Create paired test + live ledgers
    const ledgerGroupId = crypto.randomUUID()
    const testApiKey = `sk_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
    const liveApiKey = `sk_live_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`

    const sharedFields = {
      platform_name,
      organization_id,
      owner_email: user!.email,
      status: 'active' as const,
      ledger_group_id: ledgerGroupId,
      settings: {
        default_platform_fee_percent: 20,
        tax_withholding_percent: 0,
        min_payout_amount: 10,
        payout_schedule: 'manual',
      },
    }

    const { data: ledgers, error: ledgerError } = await supabase
      .from('ledgers')
      .insert([
        { ...sharedFields, api_key_hash: hashApiKey(testApiKey), livemode: false },
        { ...sharedFields, api_key_hash: hashApiKey(liveApiKey), livemode: true },
      ])
      .select()

    if (ledgerError) {
      console.error(`[${requestId}] Ledger creation failed:`, ledgerError.code)
      return NextResponse.json(
        { error: 'Failed to create ledger. Please try again.' },
        { status: 500 }
      )
    }

    // Best-effort API key registry (hash-only metadata for previews/rotation history)
    try {
      const testLedger = ledgers?.find((l) => l.livemode === false)
      const liveLedger = ledgers?.find((l) => l.livemode === true)
      const rows: Array<Record<string, unknown>> = []

      if (testLedger?.id) {
        rows.push({
          ledger_id: testLedger.id,
          name: 'Default Test Key',
          key_hash: hashApiKey(testApiKey),
          key_prefix: testApiKey.slice(0, 12),
          scopes: ['read', 'write', 'admin'],
          created_by: user!.id,
        })
      }

      if (liveLedger?.id) {
        rows.push({
          ledger_id: liveLedger.id,
          name: 'Default Live Key',
          key_hash: hashApiKey(liveApiKey),
          key_prefix: liveApiKey.slice(0, 12),
          scopes: ['read', 'write', 'admin'],
          created_by: user!.id,
        })
      }

      if (rows.length > 0) {
        await supabase.from('api_keys').insert(rows)
      }
    } catch {
      // Non-blocking: key registry table may be unavailable in some environments.
    }

    // Send security alert for new API keys (non-blocking)
    if (user?.email) {
      sendSecurityAlertEmail({
        to: user.email,
        alertType: 'api_key_created',
        details: `New API keys were created for ledger "${platform_name}". Both test and live keys are now active.`,
        timestamp: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      }).catch(console.error)
    }

    // Return the ledger matching the current mode and set its group as active
    const livemode = await getLivemode()
    const ledger = ledgers?.find(l => l.livemode === livemode) || ledgers?.[0]

    const response = NextResponse.json({ success: true, ledger })

    response.cookies.set(ACTIVE_LEDGER_GROUP_COOKIE, ledgerGroupId, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
    })

    return response
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
    const livemode = await getLivemode()

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

    // Get ledgers for those organizations, filtered by mode
    const { data: ledgers, error } = await supabase
      .from('ledgers')
      .select('id, organization_id, business_name, status, livemode, ledger_group_id, settings, created_at')
      .in('organization_id', orgIds)
      .eq('livemode', livemode)
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
