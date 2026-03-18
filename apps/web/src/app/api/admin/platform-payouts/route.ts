import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { isPlatformOperatorUser } from '@/lib/internal-platforms'

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isPlatformOperatorUser(user)) return null
  return user
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function callPlatformPayouts(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/platform-payouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'x-actor-type': 'admin',
      'x-actor-source': 'soledgic-dashboard',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export const GET = createApiHandler(
  async () => {
    const admin = await requirePlatformAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const [statusData, historyData] = await Promise.all([
      callPlatformPayouts({ action: 'status' }),
      callPlatformPayouts({ action: 'history' }),
    ])

    return NextResponse.json({
      balance: statusData.available_balance_cents ?? 0,
      balance_dollars: statusData.available_balance ?? 0,
      payouts: historyData.payouts ?? [],
    })
  },
  { requireAuth: true, rateLimit: true, routePath: '/api/admin/platform-payouts' },
)

export const POST = createApiHandler(
  async (request) => {
    const admin = await requirePlatformAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: body, error: parseError } = await parseJsonBody<{
      action: 'request'
      amount?: number
      description?: string
      reference_id?: string
    }>(request)

    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    if (body.action !== 'request') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const result = await callPlatformPayouts({
      action: 'request',
      amount: body.amount,
      description: body.description,
      reference_id: body.reference_id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Payout failed' }, { status: 400 })
    }

    return NextResponse.json({ success: true, payout: result.payout })
  },
  { requireAuth: true, rateLimit: true, routePath: '/api/admin/platform-payouts' },
)
