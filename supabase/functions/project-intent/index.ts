// Soledgic Edge Function: Project Intent
// POST /project-intent
//
// Projects future obligations based on authorizing instrument terms.
// Creates ghost entries (projected_transactions) that NEVER affect:
// - entries table
// - account balances
// - reports like trial-balance
//
// Ghost entries exist only for:
// - Future intent expression
// - Snap-to matching when reality arrives

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateUUID,
  validateDate,
  validateInteger,
  LedgerContext,
  createAuditLog
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ProjectIntentRequest {
  authorizing_instrument_id: string
  until_date: string  // ISO date string
  horizon_count?: number  // Optional: max projections to create (default 12)
}

interface AuthorizingInstrument {
  id: string
  ledger_id: string
  status: string
  external_ref: string
  extracted_terms: {
    amount: number
    currency: string
    cadence?: string
    counterparty_name: string
  }
}

// Supported cadences for deterministic projection
const SUPPORTED_CADENCES = ['weekly', 'bi_weekly', 'monthly', 'quarterly', 'annual', 'yearly']

// Map cadence to interval in days (approximate for date generation)
function getCadenceInterval(cadence: string): number {
  switch (cadence.toLowerCase()) {
    case 'weekly': return 7
    case 'bi_weekly': return 14
    case 'monthly': return 30
    case 'quarterly': return 91
    case 'annual':
    case 'yearly': return 365
    default: return 0
  }
}

// Generate expected dates based on cadence
function generateExpectedDates(
  startDate: Date,
  untilDate: Date,
  cadence: string,
  maxCount: number
): Date[] {
  const dates: Date[] = []
  let current = new Date(startDate)

  while (current <= untilDate && dates.length < maxCount) {
    dates.push(new Date(current))

    // Advance to next date based on cadence
    switch (cadence.toLowerCase()) {
      case 'weekly':
        current.setDate(current.getDate() + 7)
        break
      case 'bi_weekly':
        current.setDate(current.getDate() + 14)
        break
      case 'monthly':
        current.setMonth(current.getMonth() + 1)
        break
      case 'quarterly':
        current.setMonth(current.getMonth() + 3)
        break
      case 'annual':
      case 'yearly':
        current.setFullYear(current.getFullYear() + 1)
        break
    }
  }

  return dates
}

// Format currency for Slack display
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Send breach alerts to configured channels (fire and forget)
async function sendBreachAlerts(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  alertConfigs: Array<{ id: string; channel: string; config: any; thresholds: any }>,
  alertPayload: {
    cash_balance: number
    pending_total: number
    shortfall: number
    coverage_ratio: number
    triggered_by: string
    instrument_id: string
    external_ref: string
    projections_created: number
  }
): Promise<void> {
  for (const config of alertConfigs) {
    // Check thresholds
    const coverageThreshold = config.thresholds?.coverage_ratio_below ?? 0.5
    const shortfallThreshold = config.thresholds?.shortfall_above ?? 0

    const shouldTrigger = alertPayload.coverage_ratio < coverageThreshold ||
                          alertPayload.shortfall > shortfallThreshold

    if (!shouldTrigger) continue

    // Send Slack alert
    if (config.channel === 'slack' && config.config?.webhook_url) {
      const severityEmoji = alertPayload.coverage_ratio < 0.25 ? '🚨' : alertPayload.coverage_ratio < 0.5 ? '⚠️' : '📊'
      const severityText = alertPayload.coverage_ratio < 0.25 ? 'CRITICAL' : alertPayload.coverage_ratio < 0.5 ? 'WARNING' : 'NOTICE'
      const severityColor = alertPayload.coverage_ratio < 0.25 ? '#dc2626' : alertPayload.coverage_ratio < 0.5 ? '#f59e0b' : '#3b82f6'

      const slackMessage = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severityEmoji} Cash Breach Risk Detected`,
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Ledger:* ${ledger.name || 'Ledger'}\n*Severity:* ${severityText}`
            }
          },
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Current Cash*\n${formatCurrency(alertPayload.cash_balance)}` },
              { type: 'mrkdwn', text: `*Pending Obligations*\n${formatCurrency(alertPayload.pending_total)}` },
              { type: 'mrkdwn', text: `*Projected Shortfall*\n${formatCurrency(alertPayload.shortfall)}` },
              { type: 'mrkdwn', text: `*Coverage Ratio*\n${Math.round(alertPayload.coverage_ratio * 100)}%` }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `📋 Triggered by new projections from: *${alertPayload.external_ref}* (${alertPayload.projections_created} new obligations)`
              }
            ]
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `⏰ ${new Date().toISOString()}` }
            ]
          }
        ],
        attachments: [{ color: severityColor, fallback: `Cash Breach Risk: ${formatCurrency(alertPayload.shortfall)} shortfall` }]
      }

      try {
        const response = await fetch(config.config.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackMessage)
        })

        // Log to alert history
        await supabase.from('alert_history').insert({
          ledger_id: ledger.id,
          alert_config_id: config.id,
          alert_type: 'breach_risk',
          channel: 'slack',
          payload: alertPayload,
          status: response.ok ? 'sent' : 'failed',
          response_status: response.status,
          sent_at: response.ok ? new Date().toISOString() : null
        })

        // Update trigger count on success
        if (response.ok) {
          await supabase
            .from('alert_configurations')
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: (config as any).trigger_count + 1
            })
            .eq('id', config.id)
        }
      } catch (err) {
        console.error('Failed to send Slack alert:', err)
      }
    }

    // Send email alert
    if (config.channel === 'email' && config.config?.recipients?.length) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      const fromEmail = Deno.env.get('FROM_EMAIL') || 'alerts@soledgic.com'

      if (!resendApiKey) {
        console.error('Email alert skipped: RESEND_API_KEY not configured')
        continue
      }

      const severityEmoji = alertPayload.coverage_ratio < 0.25 ? '🚨' : alertPayload.coverage_ratio < 0.5 ? '⚠️' : '📊'
      const severityText = alertPayload.coverage_ratio < 0.25 ? 'CRITICAL' : alertPayload.coverage_ratio < 0.5 ? 'WARNING' : 'NOTICE'
      const severityColor = alertPayload.coverage_ratio < 0.25 ? '#dc2626' : alertPayload.coverage_ratio < 0.5 ? '#f59e0b' : '#3b82f6'

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cash Breach Risk Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-left: 4px solid ${severityColor}; padding-left: 20px; margin-bottom: 20px;">
    <h1 style="color: ${severityColor}; margin: 0 0 10px 0; font-size: 24px;">
      ${severityEmoji} Cash Breach Risk Detected
    </h1>
    <p style="margin: 0; color: #666;">
      <strong>Ledger:</strong> ${ledger.name || 'Ledger'}<br>
      <strong>Severity:</strong> ${severityText}
    </p>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 15px; background: #f8f9fa; border: 1px solid #e9ecef; width: 50%;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Current Cash</div>
        <div style="font-size: 24px; font-weight: bold; color: #333;">${formatCurrency(alertPayload.cash_balance)}</div>
      </td>
      <td style="padding: 15px; background: #f8f9fa; border: 1px solid #e9ecef; width: 50%;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Pending Obligations</div>
        <div style="font-size: 24px; font-weight: bold; color: #333;">${formatCurrency(alertPayload.pending_total)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 15px; background: #fff; border: 1px solid #e9ecef;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Projected Shortfall</div>
        <div style="font-size: 24px; font-weight: bold; color: ${severityColor};">${formatCurrency(alertPayload.shortfall)}</div>
      </td>
      <td style="padding: 15px; background: #fff; border: 1px solid #e9ecef;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Coverage Ratio</div>
        <div style="font-size: 24px; font-weight: bold; color: ${severityColor};">${Math.round(alertPayload.coverage_ratio * 100)}%</div>
      </td>
    </tr>
  </table>
  <p style="color: #666; font-size: 14px;">📋 Triggered by new projections from: <strong>${alertPayload.external_ref}</strong> (${alertPayload.projections_created} new obligations)</p>
  <div style="margin-top: 30px;">
    <a href="https://app.soledgic.com/dashboard" style="display: inline-block; background: ${severityColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
      View Dashboard
    </a>
  </div>
  <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
  <p style="color: #999; font-size: 12px;">
    This alert was generated at ${new Date().toISOString()}<br>
    Soledgic - Financial Infrastructure for Your Business
  </p>
</body>
</html>`

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: config.config.recipients,
            subject: `${severityEmoji} Cash Breach Risk Alert - ${ledger.name || 'Ledger'} [${severityText}]`,
            html: emailHtml
          })
        })

        const data = await response.json()

        // Log to alert history
        await supabase.from('alert_history').insert({
          ledger_id: ledger.id,
          alert_config_id: config.id,
          alert_type: 'breach_risk',
          channel: 'email',
          payload: { ...alertPayload, recipients: config.config.recipients },
          status: response.ok ? 'sent' : 'failed',
          response_status: response.status,
          error_message: response.ok ? null : (data.message || JSON.stringify(data)),
          sent_at: response.ok ? new Date().toISOString() : null
        })

        // Update trigger count on success
        if (response.ok) {
          await supabase
            .from('alert_configurations')
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: (config as any).trigger_count + 1
            })
            .eq('id', config.id)
        }
      } catch (err) {
        console.error('Failed to send email alert:', err)
      }
    }
  }
}

const handler = createHandler(
  { endpoint: 'project-intent', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: ProjectIntentRequest,
    context: { requestId: string; startTime: number }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    // Validate authorizing_instrument_id
    const instrumentId = validateUUID(body.authorizing_instrument_id)
    if (!instrumentId) {
      return errorResponse('Invalid authorizing_instrument_id: must be valid UUID', 400, req, context.requestId)
    }

    // Validate until_date
    const untilDateStr = validateDate(body.until_date)
    if (!untilDateStr) {
      return errorResponse('Invalid until_date: must be valid ISO date', 400, req, context.requestId)
    }
    const untilDate = new Date(untilDateStr)

    // Validate horizon_count (optional, default 12, max 60)
    const horizonCount = body.horizon_count
      ? validateInteger(body.horizon_count, 1, 60)
      : 12
    if (horizonCount === null) {
      return errorResponse('Invalid horizon_count: must be integer 1-60', 400, req, context.requestId)
    }

    // Fetch the authorizing instrument
    const { data: instrument, error: instrumentError } = await supabase
      .from('authorizing_instruments')
      .select('id, ledger_id, status, external_ref, extracted_terms')
      .eq('id', instrumentId)
      .eq('ledger_id', ledger.id)  // Ensure instrument belongs to this ledger
      .single()

    if (instrumentError || !instrument) {
      return errorResponse('Authorizing instrument not found', 404, req, context.requestId)
    }

    const typedInstrument = instrument as AuthorizingInstrument

    // Check instrument status
    if (typedInstrument.status === 'invalidated') {
      return errorResponse('Cannot project from invalidated instrument', 400, req, context.requestId)
    }

    // Validate cadence is supported
    const cadence = typedInstrument.extracted_terms.cadence?.toLowerCase()
    if (!cadence || !SUPPORTED_CADENCES.includes(cadence)) {
      return jsonResponse({
        success: false,
        error: 'Unsupported cadence for projection',
        supported_cadences: SUPPORTED_CADENCES,
        instrument_cadence: typedInstrument.extracted_terms.cadence || 'none'
      }, 400, req, context.requestId)
    }

    // One-time cadence cannot be projected repeatedly
    if (cadence === 'one_time') {
      return errorResponse('Cannot project one_time cadence - use single projection', 400, req, context.requestId)
    }

    // Generate expected dates starting from today (or next occurrence)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const expectedDates = generateExpectedDates(today, untilDate, cadence, horizonCount)

    if (expectedDates.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No projections created: until_date is before first expected date',
        projections_created: 0
      }, 200, req, context.requestId)
    }

    // Prepare projection records
    const amount = typedInstrument.extracted_terms.amount / 100  // Convert cents to dollars
    const currency = typedInstrument.extracted_terms.currency || 'USD'
    const counterpartyName = typedInstrument.extracted_terms.counterparty_name

    const projectionRecords = expectedDates.map(date => ({
      ledger_id: ledger.id,
      authorizing_instrument_id: instrumentId,
      expected_date: date.toISOString().split('T')[0],  // YYYY-MM-DD
      amount: amount,
      currency: currency.toUpperCase(),
      status: 'pending',
      metadata: {
        counterparty_name: counterpartyName,
        external_ref: typedInstrument.external_ref,
        cadence: cadence
      }
    }))

    // Batch insert using ON CONFLICT DO NOTHING (via upsert with ignoreDuplicates)
    const { data: inserted, error: insertError } = await supabase
      .from('projected_transactions')
      .upsert(projectionRecords, {
        onConflict: 'ledger_id,authorizing_instrument_id,expected_date,amount,currency',
        ignoreDuplicates: true
      })
      .select('id, expected_date')

    if (insertError) {
      console.error(`[${context.requestId}] Failed to create projections:`, insertError.message)
      return errorResponse('Failed to create projections', 500, req, context.requestId)
    }

    const projectionsCreated = inserted?.length || 0

    // ========================================================================
    // BREACH RISK CHECK & ALERT
    // ========================================================================
    // After creating projections, check if we now have a breach risk
    // and trigger alerts if configured

    let breachRisk: { at_risk: boolean; shortfall: number; coverage_ratio: number } | null = null

    try {
      // Get current cash balance
      const { data: cashAccount } = await supabase
        .from('accounts')
        .select('balance')
        .eq('ledger_id', ledger.id)
        .eq('account_type', 'cash')
        .single()

      const cashBalance = Number(cashAccount?.balance || 0)

      // Get total pending obligations
      const { data: pendingSum } = await supabase
        .from('projected_transactions')
        .select('amount')
        .eq('ledger_id', ledger.id)
        .eq('status', 'pending')

      const pendingTotal = pendingSum?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      if (pendingTotal > 0) {
        const shortfall = Math.max(0, pendingTotal - cashBalance)
        const coverageRatio = cashBalance / pendingTotal

        breachRisk = {
          at_risk: cashBalance < pendingTotal,
          shortfall,
          coverage_ratio: Math.round(coverageRatio * 100) / 100
        }

        // If at risk, trigger breach alerts
        if (breachRisk.at_risk) {
          // Check if there are active alert configurations
          const { data: alertConfigs } = await supabase
            .from('alert_configurations')
            .select('id, channel, config, thresholds')
            .eq('ledger_id', ledger.id)
            .eq('alert_type', 'breach_risk')
            .eq('is_active', true)

          if (alertConfigs && alertConfigs.length > 0) {
            // Send alerts asynchronously (don't block the response)
            const alertPayload = {
              cash_balance: cashBalance,
              pending_total: pendingTotal,
              shortfall,
              coverage_ratio: coverageRatio,
              triggered_by: 'project_intent',
              instrument_id: instrumentId,
              external_ref: typedInstrument.external_ref,
              projections_created: projectionsCreated
            }

            // Fire and forget - send alerts in background
            sendBreachAlerts(supabase, ledger, alertConfigs, alertPayload).catch(err => {
              console.error(`[${context.requestId}] Failed to send breach alerts:`, err)
            })
          }
        }
      }
    } catch (breachErr) {
      // Breach check is non-critical - don't fail the request
      console.warn(`[${context.requestId}] Breach check failed (non-critical):`, breachErr)
    }

    // Audit log
    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'project_intent',
      entity_type: 'projected_transactions',
      entity_id: instrumentId,
      actor_type: 'api',
      request_body: {
        instrument_id: instrumentId,
        external_ref: typedInstrument.external_ref,
        until_date: untilDateStr,
        cadence: cadence,
        projections_requested: expectedDates.length,
        projections_created: projectionsCreated
      },
      risk_score: 10
    }, context.requestId)

    return jsonResponse({
      success: true,
      instrument_id: instrumentId,
      external_ref: typedInstrument.external_ref,
      cadence: cadence,
      projections_created: projectionsCreated,
      projections_requested: expectedDates.length,
      duplicates_skipped: expectedDates.length - projectionsCreated,
      date_range: {
        from: expectedDates[0]?.toISOString().split('T')[0],
        to: expectedDates[expectedDates.length - 1]?.toISOString().split('T')[0]
      },
      projected_dates: inserted?.map(p => p.expected_date) || []
    }, 200, req, context.requestId)
  }
)

Deno.serve(handler)
