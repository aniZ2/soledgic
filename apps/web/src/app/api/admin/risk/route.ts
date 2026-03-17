import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { isPlatformOperatorUser } from '@/lib/internal-platforms'

async function requirePlatformAdmin(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isPlatformOperatorUser(user)) return null
  return { organization_id: null as string | null, role: 'platform_admin' }
}

export const GET = createApiHandler(
  async (request, { user }) => {
    const membership = await requirePlatformAdmin(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'signals'

    const serviceClient = createServiceRoleClient()

    if (view === 'summary') {
      const { data: summary, error } = await serviceClient
        .from('org_risk_summary')
        .select('*')
        .order('composite_risk_score', { ascending: false })
        .limit(50)

      if (error) {
        return NextResponse.json({ error: 'Failed to load risk summary' }, { status: 500 })
      }
      return NextResponse.json({ summary: summary || [] })
    }

    if (view === 'creators') {
      const { data: creators, error } = await serviceClient
        .from('connected_accounts')
        .select('id, ledger_id, entity_id, display_name, email, risk_score, risk_flags, payout_delay_days, payout_delay_reason, kyc_status, is_active, created_at')
        .eq('is_active', true)
        .order('risk_score', { ascending: false })
        .limit(100)

      if (error) {
        return NextResponse.json({ error: 'Failed to load creator risk data' }, { status: 500 })
      }
      return NextResponse.json({ creators: creators || [] })
    }

    if (view === 'capabilities') {
      const orgId = searchParams.get('org_id')
      if (!orgId) {
        return NextResponse.json({ error: 'org_id required' }, { status: 400 })
      }
      const { data: org, error } = await serviceClient
        .from('organizations')
        .select('id, name, capabilities')
        .eq('id', orgId)
        .single()

      if (error || !org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      return NextResponse.json({ organization: org })
    }

    // Default: open risk signals
    const resolved = searchParams.get('resolved') === 'true'
    const severity = searchParams.get('severity')

    let query = serviceClient
      .from('risk_signals')
      .select('id, signal_type, severity, entity_type, entity_id, description, details, resolved, created_at, organization_id')
      .eq('resolved', resolved)
      .order('created_at', { ascending: false })
      .limit(100)

    if (severity) {
      query = query.eq('severity', severity)
    }

    const { data: signals, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to load risk signals' }, { status: 500 })
    }

    return NextResponse.json({ signals: signals || [] })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/admin/risk' }
)

export const POST = createApiHandler(
  async (request, { user }) => {
    const membership = await requirePlatformAdmin(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: body, error: parseError } = await parseJsonBody<{
      action: 'resolve' | 'update_capabilities'
      signal_id?: string
      resolution_note?: string
      organization_id?: string
      capabilities?: Record<string, unknown>
    }>(request)

    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    const serviceClient = createServiceRoleClient()

    if (body.action === 'resolve') {
      if (!body.signal_id) {
        return NextResponse.json({ error: 'signal_id required' }, { status: 400 })
      }

      const { error } = await serviceClient
        .from('risk_signals')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user!.id,
          resolution_note: body.resolution_note || null,
        })
        .eq('id', body.signal_id)

      if (error) {
        return NextResponse.json({ error: 'Failed to resolve signal' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (body.action === 'update_capabilities') {
      if (!body.organization_id || !body.capabilities) {
        return NextResponse.json({ error: 'organization_id and capabilities required' }, { status: 400 })
      }

      // Validate capability keys
      const allowedKeys = new Set([
        'can_go_live', 'can_payout', 'max_daily_payout_cents',
        'max_single_payout_cents', 'min_payout_delay_days',
        'reserve_percent', 'requires_payout_review', 'max_daily_volume_cents',
      ])

      const patch: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(body.capabilities)) {
        if (allowedKeys.has(key)) {
          patch[key] = value
        }
      }

      // Merge into existing capabilities (don't replace) so unset keys are preserved
      const { data: currentOrg } = await serviceClient
        .from('organizations')
        .select('capabilities')
        .eq('id', body.organization_id)
        .single()

      const merged = { ...((currentOrg?.capabilities || {}) as Record<string, unknown>), ...patch }
      const caps = merged

      const { error } = await serviceClient
        .from('organizations')
        .update({ capabilities: merged })
        .eq('id', body.organization_id)

      if (error) {
        return NextResponse.json({ error: 'Failed to update capabilities' }, { status: 500 })
      }

      // Audit log
      try {
        await serviceClient.from('audit_log').insert({
          ledger_id: null,
          action: 'capabilities_updated',
          entity_type: 'organization',
          entity_id: body.organization_id,
          actor_type: 'user',
          actor_id: user!.id,
          request_body: { capabilities: caps },
          response_status: 200,
          risk_score: 40,
        })
      } catch {
        // Non-blocking
      }

      return NextResponse.json({ success: true, capabilities: caps })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/admin/risk' }
)
