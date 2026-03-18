// SERVICE_ID: SVC_EARNINGS
// Soledgic Edge Function: Historical Earnings
// GET /earnings — Per-creator, per-period earnings breakdown
// Supports: ?creator_id=X, ?granularity=monthly|quarterly|daily, ?start_date=YYYY-MM-DD, ?end_date=YYYY-MM-DD

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INCLUDED_STATUS = 'completed'

type Granularity = 'monthly' | 'quarterly' | 'daily' | 'total'

interface PeriodBucket {
  period: string       // e.g. "2026-01", "2026-Q1", "2026-03-15", or "total"
  period_label: string // e.g. "January 2026", "Q1 2026", "Mar 15", or "Total"
  earned: number       // credits to creator_balance
  paid: number         // debits from creator_balance
  net: number          // earned - paid
}

interface CreatorEarnings {
  creator_id: string
  name: string
  periods: PeriodBucket[]
  totals: { earned: number; paid: number; net: number }
}

// ============================================================================
// Period generation
// ============================================================================

function generateMonthlyPeriods(startDate: string, endDate: string): Array<{ key: string; label: string; start: string; end: string }> {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const periods: Array<{ key: string; label: string; start: string; end: string }> = []
  const [sy, sm] = startDate.split('-').map(Number)
  const [ey, em] = endDate.split('-').map(Number)

  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    const mStr = m.toString().padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    periods.push({
      key: `${y}-${mStr}`,
      label: `${months[m - 1]} ${y}`,
      start: `${y}-${mStr}-01`,
      end: `${y}-${mStr}-${lastDay}`,
    })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return periods
}

function generateQuarterlyPeriods(startDate: string, endDate: string): Array<{ key: string; label: string; start: string; end: string }> {
  const periods: Array<{ key: string; label: string; start: string; end: string }> = []
  const [sy] = startDate.split('-').map(Number)
  const [ey] = endDate.split('-').map(Number)
  const startQ = Math.ceil(Number(startDate.split('-')[1]) / 3)
  const endQ = Math.ceil(Number(endDate.split('-')[1]) / 3)

  for (let y = sy; y <= ey; y++) {
    const qStart = y === sy ? startQ : 1
    const qEnd = y === ey ? endQ : 4
    for (let q = qStart; q <= qEnd; q++) {
      const sm = (q - 1) * 3 + 1
      const em = q * 3
      const lastDay = new Date(y, em, 0).getDate()
      periods.push({
        key: `${y}-Q${q}`,
        label: `Q${q} ${y}`,
        start: `${y}-${sm.toString().padStart(2, '0')}-01`,
        end: `${y}-${em.toString().padStart(2, '0')}-${lastDay}`,
      })
    }
  }
  return periods
}

function generateDailyPeriods(startDate: string, endDate: string): Array<{ key: string; label: string; start: string; end: string }> {
  const periods: Array<{ key: string; label: string; start: string; end: string }> = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  // Cap at 90 days to prevent abuse
  const maxDays = 90
  let count = 0
  while (current <= end && count < maxDays) {
    const iso = current.toISOString().slice(0, 10)
    const label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    periods.push({ key: iso, label, start: iso, end: iso })
    current.setUTCDate(current.getUTCDate() + 1)
    count++
  }
  return periods
}

// ============================================================================
// Core earnings query
// ============================================================================

async function queryCreatorEarningsForPeriod(
  supabase: SupabaseClient,
  accountId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ earned: number; paid: number }> {
  const [{ data: credits }, { data: debits }] = await Promise.all([
    supabase
      .from('entries')
      .select('amount, transactions!inner(created_at, status)')
      .eq('account_id', accountId)
      .eq('entry_type', 'credit')
      .gte('transactions.created_at', periodStart)
      .lte('transactions.created_at', periodEnd + 'T23:59:59Z')
      .eq('transactions.status', INCLUDED_STATUS),
    supabase
      .from('entries')
      .select('amount, transactions!inner(created_at, status)')
      .eq('account_id', accountId)
      .eq('entry_type', 'debit')
      .gte('transactions.created_at', periodStart)
      .lte('transactions.created_at', periodEnd + 'T23:59:59Z')
      .eq('transactions.status', INCLUDED_STATUS),
  ])

  let earned = 0, paid = 0
  for (const e of credits || []) earned += Number(e.amount)
  for (const e of debits || []) paid += Number(e.amount)

  return {
    earned: Math.round(earned * 100) / 100,
    paid: Math.round(paid * 100) / 100,
  }
}

// ============================================================================
// Handler
// ============================================================================

const handler = createHandler(
  { endpoint: 'earnings', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger, _body, { requestId }) => {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const url = new URL(req.url)
    const creatorIdParam = url.searchParams.get('creator_id')
    const granularity = (url.searchParams.get('granularity') || 'monthly') as Granularity
    const rawStart = url.searchParams.get('start_date')
    const rawEnd = url.searchParams.get('end_date')

    if (!['monthly', 'quarterly', 'daily', 'total'].includes(granularity)) {
      return errorResponse('Invalid granularity: must be monthly, quarterly, daily, or total', 400, req, requestId)
    }

    // Default: last 12 months
    const now = new Date()
    const defaultStart = `${now.getFullYear() - 1}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`
    const defaultEnd = now.toISOString().slice(0, 10)

    const startDate = rawStart && DATE_RE.test(rawStart) ? rawStart : defaultStart
    const endDate = rawEnd && DATE_RE.test(rawEnd) ? rawEnd : defaultEnd

    if (startDate > endDate) {
      return errorResponse('start_date must be before end_date', 400, req, requestId)
    }

    // Fetch creator accounts
    let accountQuery = supabase
      .from('accounts')
      .select('id, entity_id, name, metadata')
      .eq('ledger_id', (ledger as LedgerContext).id)
      .eq('account_type', 'creator_balance')

    if (creatorIdParam) {
      const creatorId = validateId(creatorIdParam, 100)
      if (!creatorId) {
        return errorResponse('Invalid creator_id', 400, req, requestId)
      }
      accountQuery = accountQuery.eq('entity_id', creatorId)
    }

    const { data: creators, error: creatorsErr } = await accountQuery
    if (creatorsErr) {
      return errorResponse('Failed to fetch creators', 500, req, requestId)
    }
    if (!creators || creators.length === 0) {
      return jsonResponse({
        success: true,
        period: { start: startDate, end: endDate },
        granularity,
        creators: [],
        totals: { earned: 0, paid: 0, net: 0 },
      }, 200, req, requestId)
    }

    // Generate period buckets
    let periods: Array<{ key: string; label: string; start: string; end: string }>

    if (granularity === 'monthly') {
      periods = generateMonthlyPeriods(startDate, endDate)
    } else if (granularity === 'quarterly') {
      periods = generateQuarterlyPeriods(startDate, endDate)
    } else if (granularity === 'daily') {
      periods = generateDailyPeriods(startDate, endDate)
    } else {
      periods = [{ key: 'total', label: 'Total', start: startDate, end: endDate }]
    }

    // Query earnings per creator per period
    const results: CreatorEarnings[] = []

    for (const creator of creators) {
      const creatorPeriods: PeriodBucket[] = []
      let totalEarned = 0, totalPaid = 0

      for (const period of periods) {
        const { earned, paid } = await queryCreatorEarningsForPeriod(
          supabase, creator.id, period.start, period.end,
        )
        creatorPeriods.push({
          period: period.key,
          period_label: period.label,
          earned,
          paid,
          net: Math.round((earned - paid) * 100) / 100,
        })
        totalEarned += earned
        totalPaid += paid
      }

      // Skip creators with zero activity
      if (totalEarned === 0 && totalPaid === 0) continue

      results.push({
        creator_id: String(creator.entity_id),
        name: creator.name || `Creator ${creator.entity_id}`,
        periods: creatorPeriods,
        totals: {
          earned: Math.round(totalEarned * 100) / 100,
          paid: Math.round(totalPaid * 100) / 100,
          net: Math.round((totalEarned - totalPaid) * 100) / 100,
        },
      })
    }

    // Sort by total earned descending
    results.sort((a, b) => b.totals.earned - a.totals.earned)

    const grandTotals = {
      earned: Math.round(results.reduce((s, c) => s + c.totals.earned, 0) * 100) / 100,
      paid: Math.round(results.reduce((s, c) => s + c.totals.paid, 0) * 100) / 100,
      net: Math.round(results.reduce((s, c) => s + c.totals.net, 0) * 100) / 100,
    }

    return jsonResponse({
      success: true,
      period: { start: startDate, end: endDate },
      granularity,
      creators: results,
      creator_count: results.length,
      totals: grandTotals,
    }, 200, req, requestId)
  },
)

Deno.serve(handler)
