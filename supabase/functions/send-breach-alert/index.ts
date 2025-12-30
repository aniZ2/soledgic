// Soledgic Edge Function: Send Breach Alert
// POST /send-breach-alert
//
// Sends breach risk alerts to configured channels (Slack, email, webhook)
// Called internally when project-intent or get-runway detects a breach risk

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BreachAlertRequest {
  // Breach details
  cash_balance: number
  pending_total: number
  shortfall: number
  coverage_ratio: number

  // Context
  triggered_by: 'project_intent' | 'get_runway' | 'manual'
  instrument_id?: string
  external_ref?: string
  projections_created?: number

  // Optional: specific channel to use (otherwise uses all configured)
  channel?: 'slack' | 'email' | 'webhook'
}

interface AlertConfig {
  id: string
  channel: string
  config: {
    webhook_url?: string
    channel?: string
    recipients?: string[]
  }
  thresholds: {
    coverage_ratio_below?: number
    shortfall_above?: number
  }
}

// Format currency for display
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Format percentage for display
function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

// Build Slack Block Kit message
function buildSlackMessage(
  ledgerName: string,
  data: BreachAlertRequest
): object {
  const severityEmoji = data.coverage_ratio < 0.25 ? '🚨' : data.coverage_ratio < 0.5 ? '⚠️' : '📊'
  const severityText = data.coverage_ratio < 0.25 ? 'CRITICAL' : data.coverage_ratio < 0.5 ? 'WARNING' : 'NOTICE'
  const severityColor = data.coverage_ratio < 0.25 ? '#dc2626' : data.coverage_ratio < 0.5 ? '#f59e0b' : '#3b82f6'

  const blocks: any[] = [
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
        text: `*Ledger:* ${ledgerName}\n*Severity:* ${severityText}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Current Cash*\n${formatCurrency(data.cash_balance)}`
        },
        {
          type: 'mrkdwn',
          text: `*Pending Obligations*\n${formatCurrency(data.pending_total)}`
        },
        {
          type: 'mrkdwn',
          text: `*Projected Shortfall*\n${formatCurrency(data.shortfall)}`
        },
        {
          type: 'mrkdwn',
          text: `*Coverage Ratio*\n${formatPercent(data.coverage_ratio)}`
        }
      ]
    }
  ]

  // Add context about what triggered the alert
  if (data.triggered_by === 'project_intent' && data.external_ref) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📋 Triggered by new projections from instrument: *${data.external_ref}* (${data.projections_created || 0} new obligations)`
        }
      ]
    })
  }

  // Add action button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Dashboard',
          emoji: true
        },
        url: 'https://app.soledgic.com/dashboard',
        style: 'primary'
      }
    ]
  })

  // Add timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `⏰ Alert generated at ${new Date().toISOString()}`
      }
    ]
  })

  return {
    blocks,
    attachments: [
      {
        color: severityColor,
        fallback: `Cash Breach Risk: ${formatCurrency(data.shortfall)} shortfall (${formatPercent(data.coverage_ratio)} coverage)`
      }
    ]
  }
}

// Send Slack webhook
async function sendSlackAlert(
  webhookUrl: string,
  message: object
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })

    if (response.ok) {
      return { success: true, status: response.status }
    } else {
      const body = await response.text()
      return { success: false, status: response.status, error: body }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Build email HTML for breach alert
function buildEmailHtml(
  ledgerName: string,
  data: BreachAlertRequest
): { subject: string; html: string; text: string } {
  const severityEmoji = data.coverage_ratio < 0.25 ? '🚨' : data.coverage_ratio < 0.5 ? '⚠️' : '📊'
  const severityText = data.coverage_ratio < 0.25 ? 'CRITICAL' : data.coverage_ratio < 0.5 ? 'WARNING' : 'NOTICE'
  const severityColor = data.coverage_ratio < 0.25 ? '#dc2626' : data.coverage_ratio < 0.5 ? '#f59e0b' : '#3b82f6'

  const subject = `${severityEmoji} Cash Breach Risk Alert - ${ledgerName} [${severityText}]`

  const triggerContext = data.triggered_by === 'project_intent' && data.external_ref
    ? `<p style="color: #666; font-size: 14px;">📋 Triggered by new projections from: <strong>${data.external_ref}</strong> (${data.projections_created || 0} new obligations)</p>`
    : ''

  const html = `
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
      <strong>Ledger:</strong> ${ledgerName}<br>
      <strong>Severity:</strong> ${severityText}
    </p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 15px; background: #f8f9fa; border: 1px solid #e9ecef; width: 50%;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Current Cash</div>
        <div style="font-size: 24px; font-weight: bold; color: #333;">${formatCurrency(data.cash_balance)}</div>
      </td>
      <td style="padding: 15px; background: #f8f9fa; border: 1px solid #e9ecef; width: 50%;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Pending Obligations</div>
        <div style="font-size: 24px; font-weight: bold; color: #333;">${formatCurrency(data.pending_total)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 15px; background: #fff; border: 1px solid #e9ecef;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Projected Shortfall</div>
        <div style="font-size: 24px; font-weight: bold; color: ${severityColor};">${formatCurrency(data.shortfall)}</div>
      </td>
      <td style="padding: 15px; background: #fff; border: 1px solid #e9ecef;">
        <div style="color: #666; font-size: 12px; text-transform: uppercase;">Coverage Ratio</div>
        <div style="font-size: 24px; font-weight: bold; color: ${severityColor};">${formatPercent(data.coverage_ratio)}</div>
      </td>
    </tr>
  </table>

  ${triggerContext}

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

  const text = `${severityEmoji} CASH BREACH RISK ALERT - ${severityText}

Ledger: ${ledgerName}

Current Cash: ${formatCurrency(data.cash_balance)}
Pending Obligations: ${formatCurrency(data.pending_total)}
Projected Shortfall: ${formatCurrency(data.shortfall)}
Coverage Ratio: ${formatPercent(data.coverage_ratio)}

${data.triggered_by === 'project_intent' && data.external_ref ? `Triggered by: ${data.external_ref} (${data.projections_created || 0} new obligations)` : ''}

View Dashboard: https://app.soledgic.com/dashboard

Generated at ${new Date().toISOString()}
`

  return { subject, html, text }
}

// Send email via Resend
async function sendEmailAlert(
  recipients: string[],
  emailContent: { subject: string; html: string; text: string }
): Promise<{ success: boolean; status?: number; messageId?: string; error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'alerts@soledgic.com'

  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      })
    })

    const data = await response.json()

    if (response.ok) {
      return { success: true, status: response.status, messageId: data.id }
    } else {
      return { success: false, status: response.status, error: data.message || JSON.stringify(data) }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

const handler = createHandler(
  { endpoint: 'send-breach-alert', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: BreachAlertRequest,
    context: { requestId: string }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    // Validate required fields
    if (body.cash_balance === undefined || body.pending_total === undefined) {
      return errorResponse('Missing required fields: cash_balance, pending_total', 400, req, context.requestId)
    }

    // Calculate shortfall and coverage if not provided
    const shortfall = body.shortfall ?? Math.max(0, body.pending_total - body.cash_balance)
    const coverageRatio = body.coverage_ratio ?? (body.pending_total > 0 ? body.cash_balance / body.pending_total : 1)

    // Get alert configurations for this ledger
    let query = supabase
      .from('alert_configurations')
      .select('id, channel, config, thresholds')
      .eq('ledger_id', ledger.id)
      .eq('alert_type', 'breach_risk')
      .eq('is_active', true)

    if (body.channel) {
      query = query.eq('channel', body.channel)
    }

    const { data: configs, error: configError } = await query

    if (configError) {
      console.error(`[${context.requestId}] Failed to fetch alert configs:`, configError.message)
      return errorResponse('Failed to fetch alert configurations', 500, req, context.requestId)
    }

    if (!configs || configs.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No active alert configurations found for breach_risk',
        alerts_sent: 0
      }, 200, req, context.requestId)
    }

    // Check each config against thresholds and send alerts
    const results: Array<{ channel: string; success: boolean; error?: string }> = []

    for (const config of configs as AlertConfig[]) {
      // Check if alert should trigger based on thresholds
      const coverageThreshold = config.thresholds?.coverage_ratio_below ?? 0.5
      const shortfallThreshold = config.thresholds?.shortfall_above ?? 0

      const shouldTrigger = coverageRatio < coverageThreshold || shortfall > shortfallThreshold

      if (!shouldTrigger) {
        results.push({ channel: config.channel, success: true, error: 'Thresholds not met' })
        continue
      }

      // Send alert based on channel
      if (config.channel === 'slack' && config.config.webhook_url) {
        const slackMessage = buildSlackMessage(ledger.name || 'Ledger', {
          ...body,
          shortfall,
          coverage_ratio: coverageRatio
        })

        const slackResult = await sendSlackAlert(config.config.webhook_url, slackMessage)
        results.push({ channel: 'slack', ...slackResult })

        // Log to alert history
        await supabase.from('alert_history').insert({
          ledger_id: ledger.id,
          alert_config_id: config.id,
          alert_type: 'breach_risk',
          channel: 'slack',
          payload: {
            cash_balance: body.cash_balance,
            pending_total: body.pending_total,
            shortfall,
            coverage_ratio: coverageRatio,
            triggered_by: body.triggered_by
          },
          status: slackResult.success ? 'sent' : 'failed',
          error_message: slackResult.error,
          response_status: slackResult.status,
          sent_at: slackResult.success ? new Date().toISOString() : null
        })

        // Update trigger count
        if (slackResult.success) {
          await supabase
            .from('alert_configurations')
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: (config as any).trigger_count + 1
            })
            .eq('id', config.id)
        }
      }

      // Send email alert
      if (config.channel === 'email' && config.config.recipients?.length) {
        const emailContent = buildEmailHtml(ledger.name || 'Ledger', {
          ...body,
          shortfall,
          coverage_ratio: coverageRatio
        })

        const emailResult = await sendEmailAlert(config.config.recipients, emailContent)
        results.push({ channel: 'email', ...emailResult })

        // Log to alert history
        await supabase.from('alert_history').insert({
          ledger_id: ledger.id,
          alert_config_id: config.id,
          alert_type: 'breach_risk',
          channel: 'email',
          payload: {
            cash_balance: body.cash_balance,
            pending_total: body.pending_total,
            shortfall,
            coverage_ratio: coverageRatio,
            triggered_by: body.triggered_by,
            recipients: config.config.recipients
          },
          status: emailResult.success ? 'sent' : 'failed',
          error_message: emailResult.error,
          response_status: emailResult.status,
          sent_at: emailResult.success ? new Date().toISOString() : null
        })

        // Update trigger count
        if (emailResult.success) {
          await supabase
            .from('alert_configurations')
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: (config as any).trigger_count + 1
            })
            .eq('id', config.id)
        }
      }

      // TODO: Add generic webhook channel support (use existing webhook system)
    }

    const successCount = results.filter(r => r.success && !r.error?.includes('Thresholds')).length
    const failedCount = results.filter(r => !r.success).length

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'breach_alert_sent',
      entity_type: 'alert',
      actor_type: 'system',
      request_body: {
        triggered_by: body.triggered_by,
        alerts_sent: successCount,
        alerts_failed: failedCount,
        coverage_ratio: coverageRatio,
        shortfall
      }
    })

    return jsonResponse({
      success: true,
      alerts_sent: successCount,
      alerts_failed: failedCount,
      alerts_skipped: results.filter(r => r.error?.includes('Thresholds')).length,
      results
    }, 200, req, context.requestId)
  }
)

Deno.serve(handler)
