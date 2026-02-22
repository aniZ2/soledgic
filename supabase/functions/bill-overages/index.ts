// Soledgic Edge Function: Bill Overage Charges
// POST /bill-overages
//
// Internal scheduled job that charges monthly overages (additional ledgers / team members)
// through the primary card processor (whitelabeled).
//
// Security:
// - Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// - Optional (ops/testing): Authorization: Bearer <BILL_OVERAGES_TOKEN>
// - Uses idempotent DB claim via claim_overage_billing_charge()

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Retry cadence for failed monthly overage charges.
// Attempt 1: day 0 (initial monthly run)
// Attempt 2: day 3
// Attempt 3: day 7
const DUNNING_RETRY_SCHEDULE_DAYS = [0, 3, 7] as const
const MAX_DUNNING_ATTEMPTS = DUNNING_RETRY_SCHEDULE_DAYS.length

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function isAuthorized(authHeader: string, serviceRoleKey: string): boolean {
  const expectedAuth = `Bearer ${serviceRoleKey}`
  if (timingSafeEqualString(authHeader, expectedAuth)) return true

  const testingToken = (Deno.env.get('BILL_OVERAGES_TOKEN') || '').trim()
  if (!testingToken) return false
  return timingSafeEqualString(authHeader, `Bearer ${testingToken}`)
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function toDateOnlyUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function previousUtcMonthPeriod(now: Date): { periodStart: string; periodEnd: string } {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0))
  return {
    periodStart: toDateOnlyUTC(prevMonthStart),
    periodEnd: toDateOnlyUTC(currentMonthStart),
  }
}

function isValidDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function asPositiveInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const v = Math.trunc(value)
  return v >= 0 ? v : fallback
}

function parseIsoTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

function retryDelayDaysAfterAttempt(attemptsCompleted: number): number | null {
  const nextAttemptIndex = attemptsCompleted
  if (nextAttemptIndex < 0 || nextAttemptIndex >= DUNNING_RETRY_SCHEDULE_DAYS.length) return null

  const previousAttemptIndex = Math.max(0, nextAttemptIndex - 1)
  const delay =
    DUNNING_RETRY_SCHEDULE_DAYS[nextAttemptIndex] -
    DUNNING_RETRY_SCHEDULE_DAYS[previousAttemptIndex]
  return delay >= 0 ? delay : null
}

function computeNextRetryAt(
  attemptsCompleted: number,
  lastAttemptAtIso: string | null
): string | null {
  const delayDays = retryDelayDaysAfterAttempt(attemptsCompleted)
  if (delayDays === null) return null

  const last = parseIsoTime(lastAttemptAtIso)
  if (!last) return null

  const next = new Date(last.getTime() + delayDays * 24 * 60 * 60 * 1000)
  return next.toISOString()
}

function isRetryDueNow(
  attemptsCompleted: number,
  lastAttemptAtIso: string | null,
  now: Date
): boolean {
  if (attemptsCompleted <= 0) return true
  if (attemptsCompleted >= MAX_DUNNING_ATTEMPTS) return false

  const nextRetryAt = computeNextRetryAt(attemptsCompleted, lastAttemptAtIso)
  if (!nextRetryAt) return true

  const next = parseIsoTime(nextRetryAt)
  if (!next) return true
  return next.getTime() <= now.getTime()
}

function retriesRemainingAfterAttempt(attemptNumber: number): number {
  return Math.max(0, MAX_DUNNING_ATTEMPTS - attemptNumber)
}

interface BillOveragesRequest {
  period_start?: string
  period_end?: string
  organization_id?: string
  dry_run?: boolean
}

type OrgRow = {
  id: string
  name: string | null
  status: string | null
  max_ledgers: number | null
  max_team_members: number | null
  overage_ledger_price: number | null
  overage_team_member_price: number | null
  settings: any
}

type ExistingChargeRow = {
  id: string
  status: string | null
  attempts: number | null
  last_attempt_at: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Supabase environment is not configured' }, 503)
  }

  const authHeader = req.headers.get('authorization') || ''
  if (!isAuthorized(authHeader, serviceRoleKey)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  let body: BillOveragesRequest = {}
  try {
    body = (await req.json().catch(() => ({}))) as BillOveragesRequest
  } catch {
    body = {}
  }

  const now = new Date()
  const defaultPeriod = previousUtcMonthPeriod(now)

  const periodStart = isValidDateOnly(body.period_start) ? body.period_start : defaultPeriod.periodStart
  const periodEnd = isValidDateOnly(body.period_end) ? body.period_end : defaultPeriod.periodEnd

  if (new Date(`${periodStart}T00:00:00Z`).getTime() >= new Date(`${periodEnd}T00:00:00Z`).getTime()) {
    return json({ success: false, error: 'Invalid period: period_start must be < period_end' }, 400)
  }

  const dryRun = body.dry_run === true
  const orgFilter = typeof body.organization_id === 'string' ? body.organization_id.trim() : ''

  const platformMerchantId =
    (Deno.env.get('BILLING_MERCHANT_ID') || Deno.env.get('PROCESSOR_MERCHANT_ID') || '').trim() || null

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const orgQuery = supabase
    .from('organizations')
    .select('id, name, status, max_ledgers, max_team_members, overage_ledger_price, overage_team_member_price, settings')

  const { data: orgs, error: orgError } = orgFilter
    ? await orgQuery.eq('id', orgFilter)
    : await orgQuery

  if (orgError) {
    return json({ success: false, error: orgError.message || 'Failed to load organizations' }, 500)
  }

  const results: any[] = []
  let charged = 0
  let skipped = 0
  let failed = 0

  for (const org of (orgs || []) as OrgRow[]) {
    const orgStatus = String(org.status || '').toLowerCase()
    if (orgStatus === 'canceled' || orgStatus === 'suspended') {
      skipped++
      continue
    }

    const includedLedgers = typeof org.max_ledgers === 'number' ? org.max_ledgers : 1
    const includedMembers = typeof org.max_team_members === 'number' ? org.max_team_members : 1

    const ledgerOveragePrice = typeof org.overage_ledger_price === 'number' ? org.overage_ledger_price : 2000
    const memberOveragePrice = typeof org.overage_team_member_price === 'number' ? org.overage_team_member_price : 2000

    const [{ count: ledgerCount, error: ledgerCountError }, { count: memberCount, error: memberCountError }] =
      await Promise.all([
        supabase
          .from('ledgers')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('livemode', true)
          .eq('status', 'active'),
        supabase
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('status', 'active'),
      ])

    if (ledgerCountError || memberCountError) {
      failed++
      results.push({
        organization_id: org.id,
        status: 'error',
        error: ledgerCountError?.message || memberCountError?.message || 'Usage query failed',
      })
      continue
    }

    const currentLedgerCount = ledgerCount || 0
    const currentMemberCount = memberCount || 0

    const additionalLedgers =
      includedLedgers === -1 ? 0 : Math.max(0, currentLedgerCount - includedLedgers)
    const additionalMembers =
      includedMembers === -1 ? 0 : Math.max(0, currentMemberCount - includedMembers)

    const amountCents = additionalLedgers * ledgerOveragePrice + additionalMembers * memberOveragePrice

    if (amountCents <= 0) {
      skipped++
      results.push({
        organization_id: org.id,
        status: 'skipped',
        reason: 'no_overage',
        additional_ledgers: additionalLedgers,
        additional_team_members: additionalMembers,
        amount_cents: amountCents,
      })
      continue
    }

    const settingsObj = org.settings && typeof org.settings === 'object' ? org.settings : {}
    const billingSettings = (settingsObj.billing || {}) as Record<string, any>
    const billingSourceId =
      typeof billingSettings?.payment_method_id === 'string' && billingSettings.payment_method_id.trim().length > 0
        ? billingSettings.payment_method_id.trim()
        : null

    // Load existing monthly charge state to enforce retry cadence and avoid
    // claiming rows that are not due yet.
    const { data: existingCharge, error: existingChargeError } = await supabase
      .from('billing_overage_charges')
      .select('id, status, attempts, last_attempt_at')
      .eq('organization_id', org.id)
      .eq('period_start', periodStart)
      .maybeSingle()

    if (existingChargeError) {
      failed++
      results.push({
        organization_id: org.id,
        status: 'error',
        error: existingChargeError.message || 'Failed to load monthly billing charge',
      })
      continue
    }

    const existing = (existingCharge as ExistingChargeRow | null) || null
    const existingStatus = String(existing?.status || '').toLowerCase()
    const existingAttempts = asPositiveInt(existing?.attempts ?? 0, 0)
    const existingLastAttemptAt = existing?.last_attempt_at || null

    if (existingStatus === 'succeeded') {
      skipped++
      results.push({
        organization_id: org.id,
        status: 'skipped',
        reason: 'already_succeeded',
        period_start: periodStart,
      })
      continue
    }

    if (existingStatus === 'processing') {
      skipped++
      results.push({
        organization_id: org.id,
        status: 'skipped',
        reason: 'already_processing',
        period_start: periodStart,
      })
      continue
    }

    if (existingStatus === 'failed') {
      if (existingAttempts >= MAX_DUNNING_ATTEMPTS) {
        if (!dryRun && orgStatus !== 'past_due') {
          await supabase
            .from('organizations')
            .update({ status: 'past_due' })
            .eq('id', org.id)
        }

        skipped++
        results.push({
          organization_id: org.id,
          status: dryRun ? 'dry_run' : 'skipped',
          reason: 'dunning_exhausted',
          attempts: existingAttempts,
          retries_remaining: 0,
          period_start: periodStart,
          would_mark_past_due: dryRun ? true : undefined,
        })
        continue
      }

      if (!isRetryDueNow(existingAttempts, existingLastAttemptAt, now)) {
        skipped++
        results.push({
          organization_id: org.id,
          status: dryRun ? 'dry_run' : 'skipped',
          reason: 'retry_not_due',
          attempts: existingAttempts,
          retries_remaining: retriesRemainingAfterAttempt(existingAttempts),
          next_retry_at: computeNextRetryAt(existingAttempts, existingLastAttemptAt),
          period_start: periodStart,
        })
        continue
      }
    }

    if (dryRun) {
      results.push({
        organization_id: org.id,
        status: 'dry_run',
        period_start: periodStart,
        period_end: periodEnd,
        additional_ledgers: additionalLedgers,
        additional_team_members: additionalMembers,
        amount_cents: amountCents,
        billing_source_configured: Boolean(billingSourceId),
        existing_charge_status: existingStatus || null,
        existing_attempts: existingAttempts,
      })
      continue
    }

    const { data: claimedRaw, error: claimError } = await supabase.rpc('claim_overage_billing_charge', {
      p_organization_id: org.id,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_amount_cents: amountCents,
      p_currency: 'usd',
      p_included_ledgers: includedLedgers === -1 ? 0 : includedLedgers,
      p_included_team_members: includedMembers === -1 ? 0 : includedMembers,
      p_current_ledger_count: currentLedgerCount,
      p_current_member_count: currentMemberCount,
      p_additional_ledgers: additionalLedgers,
      p_additional_team_members: additionalMembers,
      p_overage_ledger_price: ledgerOveragePrice,
      p_overage_team_member_price: memberOveragePrice,
    })

    if (claimError) {
      failed++
      results.push({
        organization_id: org.id,
        status: 'error',
        error: claimError.message || 'Failed to claim billing charge',
      })
      continue
    }

    const claimed = claimedRaw && typeof claimedRaw === 'object' ? claimedRaw : null
    if (!claimed) {
      skipped++
      results.push({
        organization_id: org.id,
        status: 'skipped',
        reason: 'already_processed_or_in_progress',
        period_start: periodStart,
      })
      continue
    }

    const chargeId = String((claimed as any).id || '')
    const attemptNumber = asPositiveInt((claimed as any).attempts ?? 1, 1)
    const claimedLastAttemptAt =
      typeof (claimed as any).last_attempt_at === 'string'
        ? (claimed as any).last_attempt_at
        : new Date().toISOString()
    const retriesRemaining = retriesRemainingAfterAttempt(attemptNumber)
    const nextRetryAt = computeNextRetryAt(attemptNumber, claimedLastAttemptAt)

    if (!billingSourceId) {
      await supabase
        .from('billing_overage_charges')
        .update({
          status: 'failed',
          error: 'Billing method not configured. Add a billing method to enable overage billing.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', chargeId)

      if (attemptNumber >= MAX_DUNNING_ATTEMPTS) {
        await supabase
          .from('organizations')
          .update({ status: 'past_due' })
          .eq('id', org.id)
      }

      failed++
      results.push({
        organization_id: org.id,
        status: 'failed',
        charge_id: chargeId,
        error: 'billing_method_not_configured',
        attempts: attemptNumber,
        retries_remaining: retriesRemaining,
        next_retry_at: nextRetryAt,
      })
      continue
    }

    const merchantId = platformMerchantId
    if (!merchantId) {
      await supabase
        .from('billing_overage_charges')
        .update({
          status: 'failed',
          error: 'Billing merchant is not configured',
          updated_at: new Date().toISOString(),
        })
        .eq('id', chargeId)

      if (attemptNumber >= MAX_DUNNING_ATTEMPTS) {
        await supabase
          .from('organizations')
          .update({ status: 'past_due' })
          .eq('id', org.id)
      }

      failed++
      results.push({
        organization_id: org.id,
        status: 'failed',
        charge_id: chargeId,
        error: 'platform_billing_not_configured',
        attempts: attemptNumber,
        retries_remaining: retriesRemaining,
        next_retry_at: nextRetryAt,
      })
      continue
    }

    const provider = getPaymentProvider('card', { processor: { merchantId } })
    const checkout = await provider.createPaymentIntent({
      amount: amountCents,
      currency: 'USD',
      description: `Soledgic overage billing (${periodStart} to ${periodEnd})`,
      metadata: {
        soledgic_billing_charge_id: chargeId,
        soledgic_organization_id: org.id,
        soledgic_period_start: periodStart,
        soledgic_period_end: periodEnd,
        soledgic_additional_ledgers: String(additionalLedgers),
        soledgic_additional_team_members: String(additionalMembers),
      },
      payment_method_id: billingSourceId,
    })

    if (!checkout.success || !checkout.id) {
      await supabase
        .from('billing_overage_charges')
        .update({
          status: 'failed',
          error: checkout.error || 'Processor charge failed',
          raw: checkout.raw || {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', chargeId)

      if (attemptNumber >= MAX_DUNNING_ATTEMPTS) {
        await supabase
          .from('organizations')
          .update({ status: 'past_due' })
          .eq('id', org.id)
      }

      failed++
      results.push({
        organization_id: org.id,
        status: 'failed',
        charge_id: chargeId,
        error: checkout.error || 'processor_charge_failed',
        attempts: attemptNumber,
        retries_remaining: retriesRemaining,
        next_retry_at: nextRetryAt,
      })
      continue
    }

    await supabase
      .from('billing_overage_charges')
      .update({
        status: 'succeeded',
        processor_payment_id: checkout.id,
        raw: checkout.raw || {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', chargeId)

    if (orgStatus === 'past_due') {
      await supabase
        .from('organizations')
        .update({ status: 'active' })
        .eq('id', org.id)
    }

    charged++
    results.push({
      organization_id: org.id,
      status: 'succeeded',
      charge_id: chargeId,
      processor_payment_id: checkout.id,
      amount_cents: amountCents,
    })
  }

  return json({
    success: true,
    period_start: periodStart,
    period_end: periodEnd,
    dry_run: dryRun,
    charged,
    skipped,
    failed,
    results,
  })
})
