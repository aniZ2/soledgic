// SERVICE_ID: SVC_RISK_ENGINE
//
// Lightweight behavioral risk signal recorder + auto-response engine.
// Call recordRiskSignal() from any edge function when suspicious
// activity is detected. Signals aggregate into the org_risk_summary view.
//
// High/critical signals can trigger automatic capability restrictions
// (e.g. disable payouts, require manual review) without admin intervention.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type SignalType =
  | 'velocity_spike'
  | 'refund_abuse'
  | 'rapid_topup_withdraw'
  | 'large_single_txn'
  | 'failed_auth_burst'
  | 'payout_velocity'
  | 'chargeback'
  | 'duplicate_identity'
  | 'geo_anomaly'
  | 'custom'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface RiskSignalInput {
  ledgerId: string
  organizationId: string
  signalType: SignalType
  severity: Severity
  entityType?: string   // 'organization', 'creator', 'wallet'
  entityId?: string
  description: string
  details?: Record<string, unknown>
}

// ── Auto-action rules ─────────────────────────────────────────────
// Maps signal_type + severity → automatic capability changes.
// These fire immediately when a signal is recorded — no admin needed.
interface AutoAction {
  capabilities: Record<string, unknown>
  auditAction: string
}

const AUTO_ACTIONS: Record<string, AutoAction | undefined> = {
  // Rapid topup-withdraw (money laundering signal) → freeze payouts
  'rapid_topup_withdraw:high': {
    capabilities: { can_payout: false, requires_payout_review: true },
    auditAction: 'risk_auto_freeze_payouts',
  },
  'rapid_topup_withdraw:critical': {
    capabilities: { can_payout: false, requires_payout_review: true },
    auditAction: 'risk_auto_freeze_payouts',
  },
  // Refund abuse → require payout review
  'refund_abuse:high': {
    capabilities: { requires_payout_review: true },
    auditAction: 'risk_auto_require_review',
  },
  'refund_abuse:critical': {
    capabilities: { can_payout: false, requires_payout_review: true },
    auditAction: 'risk_auto_freeze_payouts',
  },
  // Chargeback → freeze payouts immediately
  'chargeback:high': {
    capabilities: { requires_payout_review: true },
    auditAction: 'risk_auto_require_review',
  },
  'chargeback:critical': {
    capabilities: { can_payout: false, requires_payout_review: true },
    auditAction: 'risk_auto_freeze_payouts',
  },
}

/**
 * Apply automatic capability restrictions based on signal type + severity.
 * Merges into existing capabilities (never loosens — only tightens).
 */
async function applyAutoAction(
  supabase: SupabaseClient,
  organizationId: string,
  signalType: SignalType,
  severity: Severity,
  signalId: string,
): Promise<void> {
  const key = `${signalType}:${severity}`
  const action = AUTO_ACTIONS[key]
  if (!action) return

  try {
    // Use authority-aware RPC to set capabilities with soledgic_system lock.
    // This prevents org operators from loosening system-imposed restrictions.
    const patch = action.capabilities
    for (const [capKey, capValue] of Object.entries(patch)) {
      await supabase.rpc('set_capability_with_authority', {
        p_org_id: organizationId,
        p_key: capKey,
        p_value: JSON.stringify(capValue),
        p_authority: 'soledgic_system',
        p_actor_id: 'risk-engine',
      }).then(() => {}, () => {
        // Fallback: direct merge if RPC not available yet
        supabase
          .from('organizations')
          .select('capabilities')
          .eq('id', organizationId)
          .single()
          .then(({ data: org }) => {
            const current = (org?.capabilities || {}) as Record<string, unknown>
            supabase
              .from('organizations')
              .update({ capabilities: { ...current, [capKey]: capValue } })
              .eq('id', organizationId)
          })
      })
    }

    // Tag the risk signal as system-level (requires system authority to resolve)
    await supabase
      .from('risk_signals')
      .update({
        signal_authority: 'soledgic_system',
        requires_system_resolution: true,
      })
      .eq('id', signalId)
      .then(() => {}, () => {})

    // Audit trail — so admins know this was automated, not manual
    await supabase.from('audit_log').insert({
      ledger_id: null,
      action: action.auditAction,
      entity_type: 'organization',
      entity_id: organizationId,
      actor_type: 'system',
      actor_id: 'risk-engine',
      request_body: {
        signal_id: signalId,
        signal_type: signalType,
        severity,
        applied_capabilities: action.capabilities,
        authority: 'soledgic_system',
      },
      response_status: 200,
      risk_score: severity === 'critical' ? 90 : 70,
    })

    console.warn(`[risk-engine] Auto-action applied: ${action.auditAction} for org ${organizationId} (signal: ${signalType}:${severity})`)
  } catch (err) {
    console.error('[risk-engine] Failed to apply auto-action:', err)
  }
}

/**
 * Record a behavioral risk signal. Fire-and-forget — never throws.
 * If the signal matches an auto-action rule, capabilities are tightened immediately.
 */
export async function recordRiskSignal(
  supabase: SupabaseClient,
  input: RiskSignalInput,
): Promise<void> {
  try {
    const { data: inserted } = await supabase.from('risk_signals').insert({
      ledger_id: input.ledgerId,
      organization_id: input.organizationId,
      signal_type: input.signalType,
      severity: input.severity,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      description: input.description,
      details: input.details || {},
    }).select('id').single()

    // Fire auto-action if applicable
    if (inserted?.id) {
      await applyAutoAction(
        supabase,
        input.organizationId,
        input.signalType,
        input.severity,
        inserted.id,
      )
    }
  } catch (err) {
    // Never block the caller
    console.error('[risk-engine] Failed to record signal:', err)
  }
}

/**
 * Check if a refund rate is suspicious (>20% in last 24h).
 */
export async function checkRefundRate(
  supabase: SupabaseClient,
  ledgerId: string,
  organizationId: string,
  triggerTransactionId?: string,
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ count: totalCount }, { count: refundCount }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledgerId)
      .gte('created_at', since),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledgerId)
      .eq('transaction_type', 'refund')
      .gte('created_at', since),
  ])

  const total = totalCount || 0
  const refunds = refundCount || 0

  if (total >= 10 && refunds / total > 0.20) {
    await recordRiskSignal(supabase, {
      ledgerId,
      organizationId,
      signalType: 'refund_abuse',
      severity: refunds / total > 0.50 ? 'critical' : 'high',
      entityType: 'organization',
      entityId: organizationId,
      description: `High refund rate: ${refunds}/${total} (${Math.round(refunds / total * 100)}%) in last 24h`,
      details: {
        total_transactions: total,
        refund_count: refunds,
        rate: refunds / total,
        trigger_transaction_id: triggerTransactionId || null,
      },
    })
  }
}

/**
 * Check for rapid topup-then-withdraw pattern (money laundering signal).
 * Flags if wallet receives deposit and withdrawal within 5 minutes.
 */
export async function checkRapidTopupWithdraw(
  supabase: SupabaseClient,
  ledgerId: string,
  organizationId: string,
  walletEntityId: string,
  transactionType: 'deposit' | 'withdrawal',
  triggerTransactionId?: string,
  triggerReferenceId?: string,
): Promise<void> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const oppositeType = transactionType === 'deposit' ? 'withdrawal' : 'deposit'

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('ledger_id', ledgerId)
    .eq('transaction_type', oppositeType)
    .gte('created_at', fiveMinAgo)
    .contains('metadata', { user_id: walletEntityId })

  if ((count || 0) > 0) {
    await recordRiskSignal(supabase, {
      ledgerId,
      organizationId,
      signalType: 'rapid_topup_withdraw',
      severity: 'high',
      entityType: 'wallet',
      entityId: walletEntityId,
      description: `Rapid ${transactionType} after ${oppositeType} within 5 minutes`,
      details: {
        wallet_entity_id: walletEntityId,
        trigger_type: transactionType,
        trigger_transaction_id: triggerTransactionId || null,
        trigger_reference_id: triggerReferenceId || null,
      },
    })
  }
}

/**
 * Check if a single transaction exceeds a threshold (default $10,000).
 */
export async function checkLargeTransaction(
  supabase: SupabaseClient,
  ledgerId: string,
  organizationId: string,
  amountCents: number,
  transactionType: string,
  referenceId: string,
  transactionId?: string,
  thresholdCents = 1_000_000, // $10,000
): Promise<void> {
  if (amountCents >= thresholdCents) {
    await recordRiskSignal(supabase, {
      ledgerId,
      organizationId,
      signalType: 'large_single_txn',
      severity: amountCents >= 5_000_000 ? 'critical' : 'high', // $50k+ = critical
      entityType: 'organization',
      entityId: organizationId,
      description: `Large ${transactionType}: $${(amountCents / 100).toFixed(2)}`,
      details: {
        amount_cents: amountCents,
        transaction_type: transactionType,
        trigger_reference_id: referenceId,
        trigger_transaction_id: transactionId || null,
      },
    })
  }
}
