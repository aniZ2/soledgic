// SERVICE_ID: SVC_COMPLIANCE_MONITOR
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LedgerContext } from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

export interface ComplianceWindowOptions {
  days?: number
  hours?: number
  limit?: number
}

type AuditRow = {
  action: string | null
  created_at: string | null
  ip_address: string | null
  actor_id: string | null
  risk_score: number | null
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value as number)) return fallback
  return Math.max(1, Math.min(Math.trunc(Number(value)), max))
}

function toIsoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function toIsoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function isRefundAction(action: string | null): boolean {
  return action === 'refund' || action === 'record_refund' || action === 'sale_refunded'
}

function isSaleAction(action: string | null): boolean {
  return action === 'sale' || action === 'record_sale' || action === 'checkout_completed'
}

function isDisputeAction(action: string | null): boolean {
  return typeof action === 'string' && action.includes('dispute')
}

async function loadAuditRows(
  supabase: SupabaseClient,
  ledgerId: string,
  sinceIso: string,
  limit: number,
): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('action, created_at, ip_address, actor_id, risk_score')
    .eq('ledger_id', ledgerId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw error
  }

  return (data || []) as AuditRow[]
}

export async function getComplianceOverviewResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  options: ComplianceWindowOptions,
  _requestId: string,
): Promise<ResourceResult> {
  const days = clampLimit(options.days, 30, 365)
  const hours = clampLimit(options.hours, 24, 168)

  try {
    const [monthlyRows, hourlyRows] = await Promise.all([
      loadAuditRows(supabase, ledger.id, toIsoDaysAgo(days), 5000),
      loadAuditRows(supabase, ledger.id, toIsoHoursAgo(hours), 2000),
    ])

    const uniqueMonthlyIps = new Set(monthlyRows.map((row) => row.ip_address).filter(Boolean))
    const uniqueMonthlyActors = new Set(monthlyRows.map((row) => row.actor_id).filter(Boolean))

    return resourceOk({
      success: true,
      overview: {
        window_days: days,
        access_window_hours: hours,
        total_events: monthlyRows.length,
        unique_ips: uniqueMonthlyIps.size,
        unique_actors: uniqueMonthlyActors.size,
        high_risk_events: monthlyRows.filter((row) => Number(row.risk_score || 0) >= 70).length,
        critical_risk_events: monthlyRows.filter((row) => Number(row.risk_score || 0) >= 90).length,
        failed_auth_events: hourlyRows.filter((row) => row.action === 'auth_failed').length,
        payouts_failed: monthlyRows.filter((row) => row.action === 'payout_failed').length,
        refunds_recorded: monthlyRows.filter((row) => isRefundAction(row.action)).length,
        dispute_events: monthlyRows.filter((row) => isDisputeAction(row.action)).length,
      },
      note: 'Soledgic records ledger-scoped compliance and operational signals. Rail-level KYC, AML, and tax identity remain with the payment processor.',
    })
  } catch (error) {
    console.error('getComplianceOverviewResponse error:', error)
    return resourceError('Failed to load compliance overview', 500, {}, 'compliance_overview_failed')
  }
}

export async function listComplianceAccessPatternsResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  options: ComplianceWindowOptions,
  _requestId: string,
): Promise<ResourceResult> {
  const hours = clampLimit(options.hours, 24, 168)
  const limit = clampLimit(options.limit, 100, 500)

  try {
    const rows = await loadAuditRows(supabase, ledger.id, toIsoHoursAgo(hours), 5000)
    const grouped = new Map<string, {
      ip_address: string
      hour: string
      request_count: number
      unique_actions: number
      actions: Set<string>
      max_risk_score: number
      failed_auths: number
    }>()

    for (const row of rows) {
      const ipAddress = row.ip_address || 'unknown'
      const createdAt = row.created_at || new Date().toISOString()
      const hour = createdAt.slice(0, 13) + ':00:00Z'
      const key = `${ipAddress}|${hour}`
      const existing = grouped.get(key) || {
        ip_address: ipAddress,
        hour,
        request_count: 0,
        unique_actions: 0,
        actions: new Set<string>(),
        max_risk_score: 0,
        failed_auths: 0,
      }

      existing.request_count += 1
      if (row.action) {
        existing.actions.add(row.action)
      }
      existing.unique_actions = existing.actions.size
      existing.max_risk_score = Math.max(existing.max_risk_score, Number(row.risk_score || 0))
      if (row.action === 'auth_failed') {
        existing.failed_auths += 1
      }
      grouped.set(key, existing)
    }

    const patterns = Array.from(grouped.values())
      .filter((pattern) => pattern.request_count > 2 || pattern.failed_auths > 0 || pattern.max_risk_score >= 70)
      .sort((left, right) => right.request_count - left.request_count)
      .slice(0, limit)
      .map((pattern) => ({
        ip_address: pattern.ip_address,
        hour: pattern.hour,
        request_count: pattern.request_count,
        unique_actions: pattern.unique_actions,
        actions: Array.from(pattern.actions),
        max_risk_score: pattern.max_risk_score,
        failed_auths: pattern.failed_auths,
      }))

    return resourceOk({
      success: true,
      window_hours: hours,
      count: patterns.length,
      patterns,
    })
  } catch (error) {
    console.error('listComplianceAccessPatternsResponse error:', error)
    return resourceError('Failed to load compliance access patterns', 500, {}, 'compliance_access_patterns_failed')
  }
}

export async function listComplianceFinancialActivityResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  options: ComplianceWindowOptions,
  _requestId: string,
): Promise<ResourceResult> {
  const days = clampLimit(options.days, 90, 365)

  try {
    const rows = await loadAuditRows(supabase, ledger.id, toIsoDaysAgo(days), 10000)
    const byDate = new Map<string, {
      date: string
      payouts_initiated: number
      payouts_completed: number
      payouts_failed: number
      sales_recorded: number
      refunds_recorded: number
      dispute_events: number
    }>()

    for (const row of rows) {
      const date = (row.created_at || '').slice(0, 10)
      if (!date) continue
      const existing = byDate.get(date) || {
        date,
        payouts_initiated: 0,
        payouts_completed: 0,
        payouts_failed: 0,
        sales_recorded: 0,
        refunds_recorded: 0,
        dispute_events: 0,
      }

      if (row.action === 'payout_initiated') existing.payouts_initiated += 1
      if (row.action === 'payout_completed') existing.payouts_completed += 1
      if (row.action === 'payout_failed') existing.payouts_failed += 1
      if (isSaleAction(row.action)) existing.sales_recorded += 1
      if (isRefundAction(row.action)) existing.refunds_recorded += 1
      if (isDisputeAction(row.action)) existing.dispute_events += 1

      byDate.set(date, existing)
    }

    return resourceOk({
      success: true,
      window_days: days,
      activity: Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date)),
    })
  } catch (error) {
    console.error('listComplianceFinancialActivityResponse error:', error)
    return resourceError('Failed to load compliance financial activity', 500, {}, 'compliance_financial_activity_failed')
  }
}

export async function listComplianceSecuritySummaryResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  options: ComplianceWindowOptions,
  _requestId: string,
): Promise<ResourceResult> {
  const days = clampLimit(options.days, 30, 365)

  try {
    const rows = await loadAuditRows(supabase, ledger.id, toIsoDaysAgo(days), 10000)
    const grouped = new Map<string, {
      date: string
      action: string
      event_count: number
      unique_ips: Set<string>
      unique_actors: Set<string>
      risk_total: number
      risk_count: number
      max_risk_score: number
      high_risk_count: number
      critical_risk_count: number
    }>()

    for (const row of rows) {
      const date = (row.created_at || '').slice(0, 10)
      const action = row.action || 'unknown'
      const key = `${date}|${action}`
      const riskScore = Number(row.risk_score || 0)
      const existing = grouped.get(key) || {
        date,
        action,
        event_count: 0,
        unique_ips: new Set<string>(),
        unique_actors: new Set<string>(),
        risk_total: 0,
        risk_count: 0,
        max_risk_score: 0,
        high_risk_count: 0,
        critical_risk_count: 0,
      }

      existing.event_count += 1
      if (row.ip_address) existing.unique_ips.add(row.ip_address)
      if (row.actor_id) existing.unique_actors.add(row.actor_id)
      existing.risk_total += riskScore
      existing.risk_count += 1
      existing.max_risk_score = Math.max(existing.max_risk_score, riskScore)
      if (riskScore >= 70) existing.high_risk_count += 1
      if (riskScore >= 90) existing.critical_risk_count += 1
      grouped.set(key, existing)
    }

    const summary = Array.from(grouped.values())
      .sort((left, right) => {
        const dateCompare = left.date.localeCompare(right.date)
        return dateCompare !== 0 ? dateCompare : left.action.localeCompare(right.action)
      })
      .map((entry) => ({
        date: entry.date,
        action: entry.action,
        event_count: entry.event_count,
        unique_ips: entry.unique_ips.size,
        unique_actors: entry.unique_actors.size,
        avg_risk_score: entry.risk_count > 0 ? Math.round(entry.risk_total / entry.risk_count) : 0,
        max_risk_score: entry.max_risk_score,
        high_risk_count: entry.high_risk_count,
        critical_risk_count: entry.critical_risk_count,
      }))

    return resourceOk({
      success: true,
      window_days: days,
      summary,
    })
  } catch (error) {
    console.error('listComplianceSecuritySummaryResponse error:', error)
    return resourceError('Failed to load compliance security summary', 500, {}, 'compliance_security_summary_failed')
  }
}
