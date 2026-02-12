import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createHash } from 'crypto'

function makeApiKey(livemode: boolean): string {
  return `sk_${livemode ? 'live' : 'test'}_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

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

    // Create the missing sibling for each orphan using hash-only key storage.
    const keyByGroupAndMode = new Map<string, string>()
    const inserts = orphans.map(({ existing, missingMode }) => {
      const key = makeApiKey(missingMode)
      keyByGroupAndMode.set(`${existing.ledger_group_id}:${missingMode ? 'live' : 'test'}`, key)
      return {
        platform_name: existing.platform_name,
        organization_id: existing.organization_id,
        owner_email: existing.owner_email,
        status: 'active' as const,
        ledger_group_id: existing.ledger_group_id,
        livemode: missingMode,
        business_name: existing.business_name,
        ledger_mode: existing.ledger_mode,
        settings: existing.settings,
        api_key_hash: hashApiKey(key),
      }
    })

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

    try {
      const rows = (created || []).flatMap((ledger) => {
        const key = keyByGroupAndMode.get(`${ledger.ledger_group_id}:${ledger.livemode ? 'live' : 'test'}`)
        if (!key) return []
        return [
          {
            ledger_id: ledger.id,
            name: ledger.livemode ? 'Recovered Live Key' : 'Recovered Test Key',
            key_hash: hashApiKey(key),
            key_prefix: key.slice(0, 12),
            scopes: ['read', 'write', 'admin'],
            created_by: user!.id,
          },
        ]
      })

      if (rows.length > 0) {
        await supabase.from('api_keys').insert(rows)
      }
    } catch {
      // Non-blocking: api_keys table might be unavailable in older environments.
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
