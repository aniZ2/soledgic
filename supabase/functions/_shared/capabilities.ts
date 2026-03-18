// Deno-compatible org capabilities enforcement.
// Mirrors apps/web/src/lib/org-capabilities.ts for edge function use.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface OrgCapabilities {
  can_go_live: boolean
  can_payout: boolean
  max_daily_payout_cents: number    // -1 = unlimited
  max_single_payout_cents: number   // -1 = unlimited
  min_payout_delay_days: number     // org-level floor (creator risk can only raise, not lower)
  reserve_percent: number           // 0-100, % of each sale held in reserve (0 = disabled)
  requires_payout_review: boolean
  max_daily_volume_cents: number    // -1 = unlimited
}

const DEFAULTS: OrgCapabilities = {
  can_go_live: true,
  can_payout: true,
  max_daily_payout_cents: -1,
  max_single_payout_cents: -1,
  min_payout_delay_days: 7,
  reserve_percent: 0,
  requires_payout_review: false,
  max_daily_volume_cents: -1,
}

function resolve(raw: unknown): OrgCapabilities {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const c = raw as Record<string, unknown>
  return {
    can_go_live: typeof c.can_go_live === 'boolean' ? c.can_go_live : DEFAULTS.can_go_live,
    can_payout: typeof c.can_payout === 'boolean' ? c.can_payout : DEFAULTS.can_payout,
    max_daily_payout_cents: typeof c.max_daily_payout_cents === 'number' ? c.max_daily_payout_cents : DEFAULTS.max_daily_payout_cents,
    max_single_payout_cents: typeof c.max_single_payout_cents === 'number' ? c.max_single_payout_cents : DEFAULTS.max_single_payout_cents,
    min_payout_delay_days: typeof c.min_payout_delay_days === 'number' ? c.min_payout_delay_days : DEFAULTS.min_payout_delay_days,
    reserve_percent: typeof c.reserve_percent === 'number' ? c.reserve_percent : DEFAULTS.reserve_percent,
    requires_payout_review: typeof c.requires_payout_review === 'boolean' ? c.requires_payout_review : DEFAULTS.requires_payout_review,
    max_daily_volume_cents: typeof c.max_daily_volume_cents === 'number' ? c.max_daily_volume_cents : DEFAULTS.max_daily_volume_cents,
  }
}

/**
 * Load and resolve capabilities for the org that owns a ledger.
 * Returns defaults if org lookup fails (fail-open for backwards compat).
 */
export async function loadOrgCapabilities(
  supabase: SupabaseClient,
  organizationId: string | undefined,
): Promise<OrgCapabilities> {
  if (!organizationId) return { ...DEFAULTS }

  const { data } = await supabase
    .from('organizations')
    .select('capabilities')
    .eq('id', organizationId)
    .single()

  return resolve(data?.capabilities)
}

/**
 * Get today's total payout amount across ALL ledgers for the org.
 * Capabilities are org-level — checking a single ledger allows bypass
 * by spreading payouts across multiple ledgers.
 */
export async function getDailyPayoutTotal(
  supabase: SupabaseClient,
  ledgerId: string,
): Promise<number> {
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))

  // Get all ledger IDs for this org
  const { data: currentLedger } = await supabase
    .from('ledgers')
    .select('organization_id')
    .eq('id', ledgerId)
    .single()

  const orgId = currentLedger?.organization_id
  if (!orgId) {
    // Fallback: single ledger if org lookup fails
    const { data } = await supabase
      .from('transactions')
      .select('amount')
      .eq('ledger_id', ledgerId)
      .eq('transaction_type', 'payout')
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
    return (data || []).reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0)
  }

  const { data: orgLedgers } = await supabase
    .from('ledgers')
    .select('id')
    .eq('organization_id', orgId)

  const ledgerIds = (orgLedgers || []).map((l) => l.id)
  if (ledgerIds.length === 0) return 0

  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .in('ledger_id', ledgerIds)
    .eq('transaction_type', 'payout')
    .eq('status', 'completed')
    .gte('created_at', todayStart.toISOString())

  return (data || []).reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0)
}

export interface CapabilityCheckResult {
  allowed: boolean
  reason?: string
}

export function checkPayoutAllowed(
  caps: OrgCapabilities,
  amountCents: number,
  dailyPayoutTotalCents: number,
): CapabilityCheckResult {
  if (!caps.can_payout) {
    return { allowed: false, reason: 'Payouts are disabled for this organization' }
  }
  if (caps.max_single_payout_cents !== -1 && amountCents > caps.max_single_payout_cents) {
    return { allowed: false, reason: `Payout exceeds single payout limit ($${(caps.max_single_payout_cents / 100).toFixed(2)})` }
  }
  if (caps.max_daily_payout_cents !== -1 && dailyPayoutTotalCents + amountCents > caps.max_daily_payout_cents) {
    return { allowed: false, reason: `Daily payout limit ($${(caps.max_daily_payout_cents / 100).toFixed(2)}) would be exceeded` }
  }
  return { allowed: true }
}

/**
 * Get today's total transaction volume for a ledger (all types except expenses).
 */
export async function getDailyVolume(
  supabase: SupabaseClient,
  ledgerId: string,
): Promise<number> {
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))

  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('ledger_id', ledgerId)
    .eq('status', 'completed')
    .neq('transaction_type', 'expense')
    .gte('created_at', todayStart.toISOString())

  return (data || []).reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0)
}

export function checkDailyVolumeAllowed(
  caps: OrgCapabilities,
  dailyVolumeCents: number,
  newAmountCents: number,
): CapabilityCheckResult {
  if (caps.max_daily_volume_cents === -1) return { allowed: true }
  if (dailyVolumeCents + newAmountCents > caps.max_daily_volume_cents) {
    return { allowed: false, reason: `Daily volume limit ($${(caps.max_daily_volume_cents / 100).toFixed(2)}) would be exceeded` }
  }
  return { allowed: true }
}
