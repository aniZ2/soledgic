// Soledgic Edge Function: Ops Monitor
// POST /ops-monitor
// Production observability: monitors payment pipeline health
// Designed for cron invocation or manual ops checks

import {
  getCorsHeaders,
  jsonResponse,
  errorResponse,
  timingSafeEqual,
  getSupabaseClient,
  escapeHtml,
} from '../_shared/utils.ts'

interface MonitorResult {
  check: string
  status: 'ok' | 'warning' | 'critical'
  count: number
  details?: string
}

const SEVERITY_RANK: Record<string, number> = { ok: 0, warning: 1, critical: 2 }

function buildOpsSlackMessage(
  status: string,
  checks: MonitorResult[],
  isRecovery: boolean,
  requestId: string,
  appUrl: string,
): object {
  if (isRecovery) {
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '\u2705 Ops Monitor \u2014 All Clear', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'All health checks are passing. Previously alerted status has resolved.',
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Request ID: \`${requestId}\` \u2022 ${new Date().toISOString()}` },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Dashboard', emoji: true },
              url: `${appUrl}/dashboard`,
              style: 'primary',
            },
          ],
        },
      ],
      attachments: [{ color: '#22c55e', fallback: 'Ops Monitor: All Clear' }],
    }
  }

  const emoji = status === 'critical' ? '\ud83d\udea8' : '\u26a0\ufe0f'
  const label = status.toUpperCase()
  const color = status === 'critical' ? '#dc2626' : '#f59e0b'
  const nonOkChecks = checks.filter(r => r.status !== 'ok')

  const fields = nonOkChecks.map(r => ({
    type: 'mrkdwn' as const,
    text: `${r.status === 'critical' ? '\ud83d\udd34' : '\ud83d\udfe1'} *${r.check}*\n${r.details || `count=${r.count}`}`,
  }))

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} Ops Monitor Alert`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Overall Status:* ${label} \u2022 ${new Date().toISOString()}`,
      },
    },
    { type: 'divider' },
  ]

  // Slack allows max 10 fields per section
  for (let i = 0; i < fields.length; i += 10) {
    blocks.push({ type: 'section', fields: fields.slice(i, i + 10) })
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `Request ID: \`${requestId}\` \u2022 <${appUrl}/dashboard|View Dashboard>` },
    ],
  })

  return {
    blocks,
    attachments: [{ color, fallback: `Ops Monitor: ${label} \u2014 ${nonOkChecks.length} check(s) flagged` }],
  }
}

function buildOpsEmailHtml(
  status: string,
  checks: MonitorResult[],
  isRecovery: boolean,
  requestId: string,
  appUrl: string,
): { subject: string; html: string; text: string } {
  const dashboardUrl = `${appUrl}/dashboard`

  if (isRecovery) {
    return {
      subject: '\u2705 Soledgic Ops Monitor \u2014 All Clear',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-left: 4px solid #22c55e; padding-left: 20px; margin-bottom: 20px;">
    <h1 style="color: #22c55e; margin: 0 0 10px 0; font-size: 24px;">\u2705 All Clear</h1>
    <p style="margin: 0; color: #666;">All health checks are passing. Previously alerted status has resolved.</p>
  </div>
  <div style="margin-top: 30px;">
    <a href="${dashboardUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Dashboard</a>
  </div>
  <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
  <p style="color: #999; font-size: 12px;">Request ID: ${requestId}<br>Generated at ${new Date().toISOString()}<br>Soledgic Ops Monitor</p>
</body>
</html>`,
      text: `\u2705 OPS MONITOR \u2014 ALL CLEAR\n\nAll health checks are passing. Previously alerted status has resolved.\n\nDashboard: ${dashboardUrl}\nRequest ID: ${requestId}\nTimestamp: ${new Date().toISOString()}`,
    }
  }

  const emoji = status === 'critical' ? '\ud83d\udea8' : '\u26a0\ufe0f'
  const label = status.toUpperCase()
  const color = status === 'critical' ? '#dc2626' : '#f59e0b'
  const nonOkChecks = checks.filter(r => r.status !== 'ok')

  const tableRows = nonOkChecks.map(r => {
    const statusColor = r.status === 'critical' ? '#dc2626' : '#f59e0b'
    return `<tr>
      <td style="padding: 10px 12px; border: 1px solid #e9ecef;">${escapeHtml(r.check)}</td>
      <td style="padding: 10px 12px; border: 1px solid #e9ecef;"><span style="color: ${statusColor}; font-weight: bold;">${r.status.toUpperCase()}</span></td>
      <td style="padding: 10px 12px; border: 1px solid #e9ecef; text-align: center;">${r.count}</td>
      <td style="padding: 10px 12px; border: 1px solid #e9ecef;">${escapeHtml(r.details || '-')}</td>
    </tr>`
  }).join('\n')

  const subject = `${emoji} [${label}] Soledgic Ops Monitor Alert`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
  <div style="border-left: 4px solid ${color}; padding-left: 20px; margin-bottom: 20px;">
    <h1 style="color: ${color}; margin: 0 0 10px 0; font-size: 24px;">${emoji} Ops Monitor Alert</h1>
    <p style="margin: 0; color: #666;"><strong>Overall Status:</strong> ${label}</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <thead>
      <tr style="background: #f8f9fa;">
        <th style="padding: 10px 12px; border: 1px solid #e9ecef; text-align: left;">Check</th>
        <th style="padding: 10px 12px; border: 1px solid #e9ecef; text-align: left;">Status</th>
        <th style="padding: 10px 12px; border: 1px solid #e9ecef; text-align: center;">Count</th>
        <th style="padding: 10px 12px; border: 1px solid #e9ecef; text-align: left;">Details</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div style="margin-top: 30px;">
    <a href="${dashboardUrl}" style="display: inline-block; background: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Dashboard</a>
  </div>
  <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
  <p style="color: #999; font-size: 12px;">Request ID: ${requestId}<br>Generated at ${new Date().toISOString()}<br>Soledgic Ops Monitor</p>
</body>
</html>`

  const textChecks = nonOkChecks
    .map(r => `- [${r.status.toUpperCase()}] ${r.check}: ${r.details || `count=${r.count}`}`)
    .join('\n')

  const text = `${emoji} OPS MONITOR ALERT \u2014 ${label}\n\n${textChecks}\n\nDashboard: ${dashboardUrl}\nRequest ID: ${requestId}\nTimestamp: ${new Date().toISOString()}`

  return { subject, html, text }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  const requestId = crypto.randomUUID()

  // Auth: cron secret or service role JWT
  const cronSecret = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')
  const isCronJob = cronSecret && expectedSecret && timingSafeEqual(cronSecret, expectedSecret)

  const authHeader = (req.headers.get('authorization') || '').replace('Bearer ', '')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const isServiceRole = authHeader && serviceRoleKey && timingSafeEqual(authHeader, serviceRoleKey)

  if (!isCronJob && !isServiceRole) {
    return errorResponse('Unauthorized', 401, req, requestId)
  }

  const supabase = getSupabaseClient(req)
  const results: MonitorResult[] = []
  const thresholds = {
    failedPayouts: Number(Deno.env.get('MONITOR_FAILED_PAYOUTS_THRESHOLD') || 5),
    failedWebhooks: Number(Deno.env.get('MONITOR_FAILED_WEBHOOKS_THRESHOLD') || 10),
    stuckInbox: Number(Deno.env.get('MONITOR_STUCK_INBOX_THRESHOLD') || 20),
    unreconciledAge: Number(Deno.env.get('MONITOR_UNRECONCILED_AGE_HOURS') || 4),
  }

  // 1. Failed payouts in last 24h
  try {
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('transaction_type', 'payout')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Failed payouts check error:`, error.message)
      results.push({ check: 'failed_payouts_24h', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const failedPayouts = count ?? 0
      results.push({
        check: 'failed_payouts_24h',
        status: failedPayouts >= thresholds.failedPayouts ? 'critical' : failedPayouts > 0 ? 'warning' : 'ok',
        count: failedPayouts,
        details: failedPayouts > 0 ? `${failedPayouts} payout(s) failed in the last 24 hours` : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'failed_payouts_24h', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 2. Failed outbound webhook deliveries in last 24h
  try {
    const { count, error } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Failed webhooks check error:`, error.message)
      results.push({ check: 'failed_webhooks_24h', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const failedWebhooks = count ?? 0
      results.push({
        check: 'failed_webhooks_24h',
        status: failedWebhooks >= thresholds.failedWebhooks ? 'critical' : failedWebhooks > 0 ? 'warning' : 'ok',
        count: failedWebhooks,
        details: failedWebhooks > 0 ? `${failedWebhooks} webhook delivery(ies) failed in the last 24 hours` : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'failed_webhooks_24h', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 3. Stuck processor_webhook_inbox rows (pending for > 1h)
  try {
    const { count, error } = await supabase
      .from('processor_webhook_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('received_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Stuck inbox check error:`, error.message)
      results.push({ check: 'stuck_inbox_rows', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const stuckRows = count ?? 0
      results.push({
        check: 'stuck_inbox_rows',
        status: stuckRows >= thresholds.stuckInbox ? 'critical' : stuckRows > 0 ? 'warning' : 'ok',
        count: stuckRows,
        details: stuckRows > 0 ? `${stuckRows} inbox row(s) pending for over 1 hour` : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'stuck_inbox_rows', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 4. Unreconciled checkout sessions (charged but ledger write failed, older than threshold)
  try {
    const { count, error } = await supabase
      .from('checkout_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'charged_pending_ledger')
      .lt('updated_at', new Date(Date.now() - thresholds.unreconciledAge * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Unreconciled check error:`, error.message)
      results.push({ check: 'unreconciled_checkouts', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const unreconciledCount = count ?? 0
      results.push({
        check: 'unreconciled_checkouts',
        status: unreconciledCount > 10 ? 'critical' : unreconciledCount > 0 ? 'warning' : 'ok',
        count: unreconciledCount,
        details: unreconciledCount > 0
          ? `${unreconciledCount} checkout(s) stuck in charged_pending_ledger for over ${thresholds.unreconciledAge}h`
          : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'unreconciled_checkouts', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 5. Processor transaction failures in last 24h
  try {
    const { count, error } = await supabase
      .from('processor_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Processor tx check error:`, error.message)
      results.push({ check: 'failed_processor_transactions_24h', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const failedProcessorTx = count ?? 0
      results.push({
        check: 'failed_processor_transactions_24h',
        status: failedProcessorTx >= 5 ? 'critical' : failedProcessorTx > 0 ? 'warning' : 'ok',
        count: failedProcessorTx,
        details: failedProcessorTx > 0
          ? `${failedProcessorTx} processor transaction(s) failed in the last 24 hours`
          : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'failed_processor_transactions_24h', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 6. Webhook auth failures (from audit log)
  try {
    const { count, error } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'webhook_invalid_signature')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Auth failures check error:`, error.message)
      results.push({ check: 'webhook_auth_failures_24h', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const authFailures = count ?? 0
      results.push({
        check: 'webhook_auth_failures_24h',
        status: authFailures >= 10 ? 'critical' : authFailures > 0 ? 'warning' : 'ok',
        count: authFailures,
        details: authFailures > 0
          ? `${authFailures} webhook auth failure(s) in the last 24 hours`
          : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'webhook_auth_failures_24h', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 7. Webhook inbox depth (all pending rows)
  try {
    const { count, error } = await supabase
      .from('processor_webhook_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) {
      console.error(`[${requestId}] Inbox depth check error:`, error.message)
      results.push({ check: 'inbox_depth', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const depth = count ?? 0
      results.push({
        check: 'inbox_depth',
        status: depth >= 500 ? 'critical' : depth >= 100 ? 'warning' : 'ok',
        count: depth,
        details: depth > 0 ? `${depth} pending row(s) in processor webhook inbox` : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'inbox_depth', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 8. Oldest pending inbox row age (seconds)
  try {
    const { data, error } = await supabase
      .from('processor_webhook_inbox')
      .select('received_at')
      .eq('status', 'pending')
      .order('received_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(`[${requestId}] Inbox oldest pending check error:`, error.message)
      results.push({ check: 'inbox_oldest_pending_seconds', status: 'warning', count: -1, details: `Query error: ${error.message}` })
    } else {
      const ageSeconds = data
        ? Math.floor((Date.now() - new Date(data.received_at).getTime()) / 1000)
        : 0
      results.push({
        check: 'inbox_oldest_pending_seconds',
        status: ageSeconds >= 3600 ? 'critical' : ageSeconds >= 300 ? 'warning' : 'ok',
        count: ageSeconds,
        details: ageSeconds > 0 ? `Oldest pending inbox row is ${ageSeconds}s old` : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'inbox_oldest_pending_seconds', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 9. Inbox processing rate (processed in last hour) — informational
  try {
    const { count, error } = await supabase
      .from('processor_webhook_inbox')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processed')
      .gte('processed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if (error) {
      console.error(`[${requestId}] Inbox processing rate check error:`, error.message)
      results.push({ check: 'inbox_processing_rate_1h', status: 'ok', count: -1, details: `Query error: ${error.message}` })
    } else {
      const processed = count ?? 0
      results.push({
        check: 'inbox_processing_rate_1h',
        status: 'ok', // Informational only
        count: processed,
        details: `${processed} webhook(s) processed in the last hour`,
      })
    }
  } catch (err) {
    results.push({ check: 'inbox_processing_rate_1h', status: 'ok', count: -1, details: 'Check failed' })
  }

  // 10. Lock waits — active queries blocked on a lock
  try {
    const { data, error } = await supabase.rpc('get_lock_wait_count')

    if (error) {
      console.error(`[${requestId}] Lock waits check error:`, error.message)
      results.push({ check: 'lock_waits', status: 'warning', count: -1, details: `RPC error: ${error.message}` })
    } else {
      const lockWaits = Number(data) || 0
      results.push({
        check: 'lock_waits',
        status: lockWaits >= 10 ? 'critical' : lockWaits >= 3 ? 'warning' : 'ok',
        count: lockWaits,
        details: lockWaits > 0 ? `${lockWaits} active query(ies) waiting on locks` : undefined,
      })
    }
  } catch (err) {
    results.push({ check: 'lock_waits', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 11. Deadlocks — cumulative counter since last stats reset (informational)
  try {
    const { data, error } = await supabase.rpc('get_deadlock_count')

    if (error) {
      console.error(`[${requestId}] Deadlocks check error:`, error.message)
      results.push({ check: 'deadlocks_cumulative', status: 'warning', count: -1, details: `RPC error: ${error.message}` })
    } else {
      const deadlocks = Number(data) || 0
      results.push({
        check: 'deadlocks_cumulative',
        status: 'ok', // Informational — cumulative since stats reset, trend via ops_monitor_runs
        count: deadlocks,
        details: `${deadlocks} cumulative deadlock(s) since last stats reset`,
      })
    }
  } catch (err) {
    results.push({ check: 'deadlocks_cumulative', status: 'warning', count: -1, details: 'Check failed' })
  }

  // 12. Payout failure rate in last 24h
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { count: failedCount, error: failedError } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('transaction_type', 'payout')
      .eq('status', 'failed')
      .gte('created_at', twentyFourHoursAgo)

    const { count: completedCount, error: completedError } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('transaction_type', 'payout')
      .eq('status', 'completed')
      .gte('created_at', twentyFourHoursAgo)

    if (failedError || completedError) {
      const errMsg = (failedError || completedError)!.message
      console.error(`[${requestId}] Payout failure rate check error:`, errMsg)
      results.push({ check: 'payout_failure_rate_24h', status: 'warning', count: -1, details: `Query error: ${errMsg}` })
    } else {
      const failed = failedCount ?? 0
      const completed = completedCount ?? 0
      const total = failed + completed
      const rate = total > 0 ? Math.round((failed / total) * 100) : 0
      results.push({
        check: 'payout_failure_rate_24h',
        status: rate >= 25 ? 'critical' : rate >= 5 ? 'warning' : 'ok',
        count: rate,
        details: total > 0
          ? `${rate}% failure rate (${failed} failed / ${total} total payouts in 24h)`
          : 'No payouts in the last 24 hours',
      })
    }
  } catch (err) {
    results.push({ check: 'payout_failure_rate_24h', status: 'warning', count: -1, details: 'Check failed' })
  }

  // Aggregate status
  const overallStatus = results.some(r => r.status === 'critical')
    ? 'critical'
    : results.some(r => r.status === 'warning')
    ? 'warning'
    : 'ok'

  // --- Alerting: cooldown check, Slack, HTML email ---
  const cooldownMinutes = Number(Deno.env.get('OPS_ALERT_COOLDOWN_MINUTES') || 120)
  const appUrl = Deno.env.get('APP_URL') || 'https://app.soledgic.com'

  let shouldAlert = false
  let isRecovery = false

  try {
    const { data: lastAlertRun } = await supabase
      .from('ops_monitor_runs')
      .select('created_at, overall_status')
      .eq('alert_sent', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (overallStatus !== 'ok') {
      // Alert on warning or critical
      if (!lastAlertRun) {
        shouldAlert = true
      } else {
        const minutesSinceLastAlert =
          (Date.now() - new Date(lastAlertRun.created_at).getTime()) / 60000
        const escalated =
          SEVERITY_RANK[overallStatus] > SEVERITY_RANK[lastAlertRun.overall_status || 'ok']

        if (escalated || minutesSinceLastAlert >= cooldownMinutes) {
          shouldAlert = true
        }
        // Within cooldown and not escalated — suppress
      }
    } else if (lastAlertRun) {
      // Current status is ok but we previously alerted — send recovery
      const prev = lastAlertRun.overall_status
      if (prev === 'warning' || prev === 'critical') {
        shouldAlert = true
        isRecovery = true
      }
    }
  } catch (err) {
    // Cooldown check failed — err on the side of alerting
    console.error(`[${requestId}] Cooldown check failed:`, err)
    shouldAlert = overallStatus !== 'ok'
  }

  // Send alerts (Slack + email), track actual dispatch success
  let alertDispatched = false

  if (shouldAlert) {
    // Slack
    const slackWebhookUrl = Deno.env.get('OPS_SLACK_WEBHOOK_URL')
    if (slackWebhookUrl) {
      const slackMessage = buildOpsSlackMessage(overallStatus, results, isRecovery, requestId, appUrl)
      try {
        const slackResp = await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackMessage),
        })
        if (slackResp.ok) {
          alertDispatched = true
        } else {
          console.error(`[${requestId}] Slack alert failed (${slackResp.status}):`, await slackResp.text())
        }
      } catch (err) {
        console.error(`[${requestId}] Slack alert error:`, err)
      }
    }

    // Email (HTML)
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const alertEmail = Deno.env.get('OPS_ALERT_EMAIL') || Deno.env.get('FROM_EMAIL')
    if (resendKey && alertEmail) {
      const emailContent = buildOpsEmailHtml(overallStatus, results, isRecovery, requestId, appUrl)
      try {
        const emailResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Deno.env.get('FROM_EMAIL') || 'alerts@soledgic.com',
            to: alertEmail,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          }),
        })
        if (emailResp.ok) {
          alertDispatched = true
        } else {
          console.error(`[${requestId}] Alert email failed (${emailResp.status}):`, await emailResp.text())
        }
      } catch (err) {
        console.error(`[${requestId}] Alert email error:`, err)
      }
    }
  }

  // Persist to ops_monitor_runs (after dispatch so alert_sent reflects actual success)
  const okCount = results.filter(r => r.status === 'ok').length
  const warnCount = results.filter(r => r.status === 'warning').length
  const critCount = results.filter(r => r.status === 'critical').length

  const { error: persistError } = await supabase.from('ops_monitor_runs').insert({
    triggered_by: isCronJob ? 'cron' : 'manual',
    overall_status: overallStatus,
    checks: results.map(r => ({ check: r.check, status: r.status, count: r.count, details: r.details })),
    total_checks: results.length,
    ok_checks: okCount,
    warning_checks: warnCount,
    critical_checks: critCount,
    alert_sent: alertDispatched,
  })
  if (persistError) {
    console.error(`[${requestId}] ops_monitor_runs insert failed:`, persistError.message)
  }

  // Log to audit
  supabase.from('audit_log').insert({
    action: 'ops_monitor_run',
    entity_type: 'system',
    actor_type: 'system',
    actor_id: isCronJob ? 'cron' : 'manual',
    request_id: requestId,
    request_body: {
      overall_status: overallStatus,
      checks: results.map(r => ({ check: r.check, status: r.status, count: r.count })),
    },
  }).then(() => {}).catch(() => {})

  return jsonResponse({
    success: true,
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks: results,
  }, 200, req, requestId)
})
