import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'

export const POST = createApiHandler(
  async (_request, { user }) => {
    const supabase = await createClient()

    // Verify user is an admin/owner of their org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only organization owners and admins can run repairs' },
        { status: 403 }
      )
    }

    const orgId = membership.organization_id

    // Find ledger groups with only one sibling (orphans)
    const { data: allLedgers } = await supabase
      .from('ledgers')
      .select('id, ledger_group_id, livemode, platform_name, owner_email, organization_id, settings, business_name, ledger_mode')
      .eq('organization_id', orgId)

    if (!allLedgers || allLedgers.length === 0) {
      return NextResponse.json({ success: true, repaired: 0, orphans: [] })
    }

    // Group by ledger_group_id
    const groups = new Map<string, typeof allLedgers>()
    for (const ledger of allLedgers) {
      const group = groups.get(ledger.ledger_group_id) || []
      group.push(ledger)
      groups.set(ledger.ledger_group_id, group)
    }

    // Find orphans (groups with only 1 member)
    const orphans: Array<{ existing: typeof allLedgers[0]; missingMode: boolean }> = []
    for (const [, group] of groups) {
      if (group.length === 1) {
        orphans.push({
          existing: group[0],
          missingMode: !group[0].livemode, // if test exists, live is missing, and vice versa
        })
      }
    }

    if (orphans.length === 0) {
      return NextResponse.json({ success: true, repaired: 0, orphans: [] })
    }

    // Create the missing sibling for each orphan
    const inserts = orphans.map(({ existing, missingMode }) => ({
      platform_name: existing.platform_name,
      organization_id: existing.organization_id,
      owner_email: existing.owner_email,
      status: 'active' as const,
      ledger_group_id: existing.ledger_group_id,
      livemode: missingMode,
      business_name: existing.business_name,
      ledger_mode: existing.ledger_mode,
      settings: existing.settings,
      api_key: missingMode
        ? `sk_live_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
        : `sk_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`,
    }))

    const { data: created, error } = await supabase
      .from('ledgers')
      .insert(inserts)
      .select('id, platform_name, livemode, ledger_group_id')

    if (error) {
      console.error('Orphan repair failed:', error.code)
      return NextResponse.json(
        { error: 'Failed to create missing siblings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      repaired: created?.length ?? 0,
      created: created?.map(l => ({
        id: l.id,
        platform_name: l.platform_name,
        livemode: l.livemode,
        ledger_group_id: l.ledger_group_id,
      })),
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/admin/repair-orphans',
  }
)
