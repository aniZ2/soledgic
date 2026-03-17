import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { isPlatformOperatorUser } from '@/lib/internal-platforms'

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isPlatformOperatorUser(user)) return null
  return user
}

export const GET = createApiHandler(
  async (request) => {
    const admin = await requirePlatformAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'alerts'
    const severity = searchParams.get('severity') || ''
    const acknowledged = searchParams.get('acknowledged') || 'false'

    const serviceClient = createServiceRoleClient()

    if (view === 'alerts') {
      let query = serviceClient
        .from('security_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (severity) {
        query = query.eq('severity', severity)
      }
      if (acknowledged === 'false') {
        query = query.is('acknowledged_at', null)
      }

      const { data: alerts, error } = await query
      if (error) {
        return NextResponse.json({ error: 'Failed to load security alerts' }, { status: 500 })
      }
      return NextResponse.json({ alerts: alerts || [] })
    }

    if (view === 'boundary_violations') {
      const hoursBack = parseInt(searchParams.get('hours') || '24', 10)
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

      const { data: violations, error } = await serviceClient
        .from('audit_log')
        .select('id, ledger_id, entity_type, entity_id, ip_address, request_body, risk_score, created_at')
        .eq('action', 'cross_ledger_violation')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) {
        return NextResponse.json({ error: 'Failed to load boundary violations' }, { status: 500 })
      }
      return NextResponse.json({ violations: violations || [] })
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  },
  { requireAuth: true, rateLimit: true, routePath: '/api/admin/security-events' },
)

export const POST = createApiHandler(
  async (request) => {
    const admin = await requirePlatformAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { action, alert_id } = body

    if (action === 'acknowledge' && alert_id) {
      const serviceClient = createServiceRoleClient()
      const { error } = await serviceClient
        .from('security_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', alert_id)

      if (error) {
        return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  },
  { requireAuth: true, rateLimit: true, routePath: '/api/admin/security-events' },
)
