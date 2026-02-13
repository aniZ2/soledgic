// Soledgic Edge Function: Bill Overage Charges
// POST /bill-overages
//
// Internal scheduled job that charges monthly overages (additional ledgers / team members)
// through the primary card processor (whitelabeled).
//
// Security:
// - Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// - Uses idempotent DB claim via claim_overage_billing_charge()

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
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
  const expectedAuth = `Bearer ${serviceRoleKey}`
  if (!timingSafeEqualString(authHeader, expectedAuth)) {
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
    (Deno.env.get('BILLING_MERCHANT_ID') || Deno.env.get('FINIX_MERCHANT_ID') || '').trim() || null
  const platformDestinationId =
    (Deno.env.get('BILLING_DESTINATION_ID') || Deno.env.get('FINIX_SOURCE_ID') || '').trim() || null

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

    const orgProcessor = (org.settings && typeof org.settings === 'object' ? org.settings.finix : null) || {}
    const billingSourceId =
      typeof orgProcessor?.source_id === 'string' && orgProcessor.source_id.trim().length > 0
        ? orgProcessor.source_id.trim()
        : null

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

    if (!billingSourceId) {
      await supabase
        .from('billing_overage_charges')
        .update({
          status: 'failed',
          error: 'Billing method not configured. Connect payment rails to enable overage billing.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', chargeId)

      await supabase
        .from('organizations')
        .update({ status: 'past_due' })
        .eq('id', org.id)

      failed++
      results.push({
        organization_id: org.id,
        status: 'failed',
        charge_id: chargeId,
        error: 'billing_method_not_configured',
      })
      continue
    }

    if (!platformMerchantId || !platformDestinationId) {
      await supabase
        .from('billing_overage_charges')
        .update({
          status: 'failed',
          error: 'Platform billing destination is not configured',
          updated_at: new Date().toISOString(),
        })
        .eq('id', chargeId)

      failed++
      results.push({
        organization_id: org.id,
        status: 'failed',
        charge_id: chargeId,
        error: 'platform_billing_not_configured',
      })
      continue
    }

    const provider = getPaymentProvider('card')
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
      destination_id: platformDestinationId,
      merchant_id: platformMerchantId,
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

      await supabase
        .from('organizations')
        .update({ status: 'past_due' })
        .eq('id', org.id)

      failed++
      results.push({
        organization_id: org.id,
        status: 'failed',
        charge_id: chargeId,
        error: checkout.error || 'processor_charge_failed',
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

