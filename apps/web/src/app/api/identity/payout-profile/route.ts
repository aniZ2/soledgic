import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createServiceRoleClient } from '@/lib/supabase/service'

type PayoutProfilePayload = {
  default_method?: 'manual' | 'card' | 'bank'
  schedule?: 'manual' | 'weekly' | 'biweekly' | 'monthly'
  minimum_amount?: number
  currency?: string
  country?: string
  payouts_enabled?: boolean
}

const VALID_METHODS = new Set(['manual', 'card', 'bank'])
const VALID_SCHEDULES = new Set(['manual', 'weekly', 'biweekly', 'monthly'])

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

function mapPayoutProfile(row: Record<string, unknown> | null) {
  if (!row) return null

  return {
    user_id: row.user_id,
    status: row.status,
    default_method: row.default_method,
    schedule: row.schedule,
    minimum_amount: Number(row.minimum_amount || 0),
    currency: row.currency,
    country: row.country,
    payouts_enabled: Boolean(row.payouts_enabled),
  }
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('shared_payout_profiles')
      .select('user_id, status, default_method, schedule, minimum_amount, currency, country, payouts_enabled')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to load shared payout profile' }, { status: 500 })
    }

    return NextResponse.json({ payout_profile: mapPayoutProfile(data as Record<string, unknown> | null) })
  },
  {
    routePath: '/api/identity/payout-profile',
    csrfProtection: false,
  },
)

export const PUT = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<PayoutProfilePayload>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid JSON body' }, { status: 400 })
    }

    const defaultMethod = body.default_method || 'manual'
    if (!VALID_METHODS.has(defaultMethod)) {
      return NextResponse.json({ error: 'Invalid default_method' }, { status: 400 })
    }

    const schedule = body.schedule || 'manual'
    if (!VALID_SCHEDULES.has(schedule)) {
      return NextResponse.json({ error: 'Invalid schedule' }, { status: 400 })
    }

    const minimumAmount = body.minimum_amount ?? 0
    if (!Number.isInteger(minimumAmount) || minimumAmount < 0) {
      return NextResponse.json({ error: 'Invalid minimum_amount' }, { status: 400 })
    }

    const currency = body.currency ? normalizeString(body.currency, 3)?.toUpperCase() : 'USD'
    const country = body.country ? normalizeString(body.country, 2)?.toUpperCase() : 'US'

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('shared_payout_profiles')
      .upsert({
        user_id: user!.id,
        status: 'active',
        default_method: defaultMethod,
        schedule,
        minimum_amount: minimumAmount,
        currency,
        country,
        payouts_enabled: body.payouts_enabled === true,
      }, {
        onConflict: 'user_id',
      })
      .select('user_id, status, default_method, schedule, minimum_amount, currency, country, payouts_enabled')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to save shared payout profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      payout_profile: mapPayoutProfile(data as Record<string, unknown>),
    })
  },
  {
    routePath: '/api/identity/payout-profile',
    csrfProtection: true,
  },
)
