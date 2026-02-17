// Soledgic Edge Function: Security Alerts
// POST /security-alerts - Process security events and send alerts
// Called by cron job or triggered by threshold breaches
// SECURITY HARDENED VERSION v2

import { 
  getCorsHeaders,
  getSupabaseClient,
  jsonResponse,
  errorResponse,
  getClientIp,
  generateRequestId,
  timingSafeEqual,
} from '../_shared/utils.ts'

interface AlertThresholds {
  rate_limit_hits_per_hour: number      // Alert if exceeded
  auth_failures_per_hour: number        // Alert if exceeded
  db_fallback_activations: number       // Alert if DB fallback used N times
  unique_ips_rate_limited: number       // Alert if many IPs hit limits
  high_risk_events: number              // Alert if high risk_score events
  preauth_rate_limit_hits: number       // SECURITY FIX: Pre-auth rate limit hits
  geo_blocked_requests: number          // SECURITY FIX: Geo-blocked requests
  estimated_fees_percent: number        // SECURITY FIX: % of transactions with estimated fees
}

const THRESHOLDS: AlertThresholds = {
  rate_limit_hits_per_hour: 100,        // 100+ rate limit hits = potential DDoS
  auth_failures_per_hour: 50,           // 50+ auth failures = credential stuffing
  db_fallback_activations: 5,           // 5+ DB fallbacks = Redis issues
  unique_ips_rate_limited: 20,          // 20+ unique IPs = distributed attack
  high_risk_events: 10,                 // 10+ high risk events
  preauth_rate_limit_hits: 50,          // 50+ pre-auth rate limits = brute force
  geo_blocked_requests: 20,             // 20+ geo-blocked = targeted from blocked region
  estimated_fees_percent: 10,           // 10%+ estimated fees = processor API issues
}

// Alert severity levels
type Severity = 'info' | 'warning' | 'critical'

interface SecurityAlert {
  type: string
  severity: Severity
  message: string
  details: Record<string, any>
  timestamp: string
}

async function sendEmailAlert(
  to: string,
  subject: string,
  alerts: SecurityAlert[]
): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  
  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured - cannot send alerts')
    return false
  }
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6;
            color: #1f2937;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header { 
            background: #1f2937; 
            color: white; 
            padding: 20px; 
            border-radius: 8px 8px 0 0;
            text-align: center;
          }
          .alert { padding: 16px; margin: 8px 0; border-radius: 8px; }
          .critical { background: #fee2e2; border-left: 4px solid #dc2626; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
          .info { background: #dbeafe; border-left: 4px solid #3b82f6; }
          .details { 
            font-family: 'SF Mono', Monaco, 'Courier New', monospace; 
            background: #f3f4f6; 
            padding: 12px; 
            margin-top: 8px; 
            border-radius: 4px;
            font-size: 12px;
            overflow-x: auto;
          }
          h2 { margin: 0 0 8px 0; font-size: 16px; }
          .timestamp { color: #6b7280; font-size: 12px; }
          .actions { 
            background: #f9fafb; 
            padding: 16px; 
            border-radius: 8px;
            margin-top: 16px;
          }
          .actions h2 { color: #374151; }
          .actions ol { margin: 0; padding-left: 20px; }
          .actions li { margin: 8px 0; }
          .links { 
            margin-top: 16px; 
            padding: 16px; 
            background: #1f2937; 
            border-radius: 8px;
            text-align: center;
          }
          .links a { 
            color: #60a5fa; 
            text-decoration: none; 
            margin: 0 12px;
          }
          .links a:hover { text-decoration: underline; }
          .footer { 
            margin-top: 24px; 
            padding-top: 16px; 
            border-top: 1px solid #e5e7eb;
            color: #6b7280; 
            font-size: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0;">🚨 Soledgic Security Alert</h1>
        </div>
        
        <p style="margin-top: 20px;">The following security events require your attention:</p>
        
        ${alerts.map(alert => `
          <div class="alert ${alert.severity}">
            <h2>${escapeHtml(alert.type)}</h2>
            <p>${escapeHtml(alert.message)}</p>
            <div class="details">
              <pre>${escapeHtml(JSON.stringify(alert.details, null, 2))}</pre>
            </div>
            <p class="timestamp">${escapeHtml(alert.timestamp)}</p>
          </div>
        `).join('')}
        
        <div class="actions">
          <h2>🛡️ Recommended Actions</h2>
          <ol>
            <li><strong>Check Upstash Console</strong> - Verify Redis health and quotas</li>
            <li><strong>Review Supabase Logs</strong> - Look for attack patterns</li>
            <li><strong>Check Cloudflare</strong> - Enable Under Attack mode if needed</li>
            <li><strong>Review IP addresses</strong> - Block malicious IPs if identified</li>
            <li><strong>Check the DDoS Playbook</strong> - Follow incident response procedures</li>
          </ol>
        </div>
        
        <div class="links">
          <a href="https://console.upstash.com">Upstash</a>
          <a href="https://supabase.com/dashboard">Supabase</a>
          <a href="https://dash.cloudflare.com">Cloudflare</a>
        </div>
        
        <div class="footer">
          <p>This alert was generated by Soledgic Security Monitoring</p>
          <p>Generated at ${new Date().toISOString()}</p>
        </div>
      </body>
    </html>
  `
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Soledgic Security <security@soledgic.com>',
        to: [to],
        subject: subject,
        html: htmlBody,
      }),
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to send email:', error)
      return false
    }
    
    return true
  } catch (err) {
    console.error('Email send error:', err)
    return false
  }
}

// HTML escape to prevent XSS in email
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, char => htmlEntities[char] || char)
}

async function checkSecurityMetrics(supabase: any, requestId: string): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = []
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  
  // 1. Check rate limit hits
  const { data: rateLimitHits, error: rlError } = await supabase
    .from('audit_log')
    .select('id, ip_address, request_body')
    .eq('action', 'rate_limited')
    .gte('created_at', oneHourAgo)
  
  if (!rlError && rateLimitHits) {
    const hitCount = rateLimitHits.length
    const uniqueIPs = new Set(rateLimitHits.map((h: any) => h.ip_address).filter(Boolean)).size
    const dbFallbacks = rateLimitHits.filter((h: any) => 
      h.request_body?.source === 'database'
    ).length
    
    if (hitCount >= THRESHOLDS.rate_limit_hits_per_hour) {
      alerts.push({
        type: 'High Rate Limit Activity',
        severity: hitCount >= THRESHOLDS.rate_limit_hits_per_hour * 3 ? 'critical' : 'warning',
        message: `${hitCount} rate limit hits in the last hour (threshold: ${THRESHOLDS.rate_limit_hits_per_hour})`,
        details: {
          total_hits: hitCount,
          unique_ips: uniqueIPs,
          db_fallbacks: dbFallbacks,
          top_endpoints: getTopEndpoints(rateLimitHits),
        },
        timestamp: new Date().toISOString(),
      })
    }
    
    if (uniqueIPs >= THRESHOLDS.unique_ips_rate_limited) {
      alerts.push({
        type: 'Distributed Attack Detected',
        severity: 'critical',
        message: `${uniqueIPs} unique IPs hit rate limits - possible DDoS`,
        details: {
          unique_ips: uniqueIPs,
          total_hits: hitCount,
          action_required: 'Consider enabling Cloudflare Under Attack Mode',
        },
        timestamp: new Date().toISOString(),
      })
    }
    
    if (dbFallbacks >= THRESHOLDS.db_fallback_activations) {
      alerts.push({
        type: 'Redis Failover Active',
        severity: 'warning',
        message: `Database fallback activated ${dbFallbacks} times - check Upstash health`,
        details: {
          db_fallback_count: dbFallbacks,
          redis_may_be_down: true,
          action_required: 'Check Upstash Console for Redis health',
        },
        timestamp: new Date().toISOString(),
      })
    }
  }
  
  // 2. Check auth failures
  const { data: authFailures, error: afError } = await supabase
    .from('audit_log')
    .select('id, ip_address, request_body')
    .eq('action', 'auth_failed')
    .gte('created_at', oneHourAgo)
  
  if (!afError && authFailures && authFailures.length >= THRESHOLDS.auth_failures_per_hour) {
    const uniqueIPs = new Set(authFailures.map((h: any) => h.ip_address).filter(Boolean)).size
    
    alerts.push({
      type: 'High Authentication Failures',
      severity: authFailures.length >= THRESHOLDS.auth_failures_per_hour * 2 ? 'critical' : 'warning',
      message: `${authFailures.length} failed auth attempts - possible credential stuffing`,
      details: {
        total_failures: authFailures.length,
        unique_ips: uniqueIPs,
        top_ips: getTopIPs(authFailures),
        action_required: 'Consider blocking top offending IPs',
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  // 3. Check for high-risk events
  const { data: highRiskEvents } = await supabase
    .from('audit_log')
    .select('id, action, ip_address, risk_score')
    .gte('risk_score', 70)
    .gte('created_at', oneHourAgo)
  
  if (highRiskEvents && highRiskEvents.length >= THRESHOLDS.high_risk_events) {
    alerts.push({
      type: 'Multiple High-Risk Events',
      severity: 'critical',
      message: `${highRiskEvents.length} high-risk security events detected`,
      details: {
        event_count: highRiskEvents.length,
        event_types: [...new Set(highRiskEvents.map((e: any) => e.action))],
        unique_ips: new Set(highRiskEvents.map((e: any) => e.ip_address).filter(Boolean)).size,
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  // 4. Check for handler errors (system health)
  const { data: handlerErrors } = await supabase
    .from('audit_log')
    .select('id, request_body')
    .eq('action', 'handler_error')
    .gte('created_at', oneHourAgo)
  
  if (handlerErrors && handlerErrors.length >= 10) {
    const errorTypes = handlerErrors.reduce((acc: Record<string, number>, e: any) => {
      const type = e.request_body?.error_type || 'unknown'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {})
    
    alerts.push({
      type: 'High Error Rate',
      severity: handlerErrors.length >= 50 ? 'critical' : 'warning',
      message: `${handlerErrors.length} handler errors in the last hour`,
      details: {
        error_count: handlerErrors.length,
        error_types: errorTypes,
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  // 5. Check for rate limit offenders (persistent bad actors)
  const { data: offenders } = await supabase
    .rpc('get_rate_limit_offenders', { p_min_violations: 10 })
  
  if (offenders && offenders.length > 0) {
    alerts.push({
      type: 'Persistent Rate Limit Offenders',
      severity: 'warning',
      message: `${offenders.length} API keys with 10+ rate limit violations`,
      details: {
        offender_count: offenders.length,
        top_offenders: offenders.slice(0, 5),
        action_required: 'Review and potentially revoke these API keys',
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  // 6. SECURITY FIX: Check for pre-auth rate limit hits (brute force detection)
  const { data: preauthHits } = await supabase
    .from('audit_log')
    .select('id, ip_address, request_body')
    .eq('action', 'preauth_rate_limited')
    .gte('created_at', oneHourAgo)
  
  if (preauthHits && preauthHits.length >= THRESHOLDS.preauth_rate_limit_hits) {
    const uniqueIPs = new Set(preauthHits.map((h: any) => h.ip_address).filter(Boolean)).size
    
    alerts.push({
      type: 'Pre-Auth Rate Limit Storm',
      severity: preauthHits.length >= THRESHOLDS.preauth_rate_limit_hits * 2 ? 'critical' : 'warning',
      message: `${preauthHits.length} pre-auth rate limit hits - possible API key brute force`,
      details: {
        total_hits: preauthHits.length,
        unique_ips: uniqueIPs,
        top_ips: getTopIPs(preauthHits),
        action_required: 'Review IPs and consider adding to blocklist',
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  // 7. SECURITY FIX: Check for geo-blocked requests
  const { data: geoBlocked } = await supabase
    .from('audit_log')
    .select('id, ip_address, request_body')
    .eq('action', 'blocked_country')
    .gte('created_at', oneHourAgo)
  
  if (geoBlocked && geoBlocked.length >= THRESHOLDS.geo_blocked_requests) {
    const countryCounts: Record<string, number> = {}
    for (const event of geoBlocked) {
      const country = event.request_body?.country || 'unknown'
      countryCounts[country] = (countryCounts[country] || 0) + 1
    }
    
    alerts.push({
      type: 'High Geo-Blocked Traffic',
      severity: 'info',
      message: `${geoBlocked.length} requests blocked by geo-IP restrictions`,
      details: {
        total_blocked: geoBlocked.length,
        by_country: countryCounts,
        unique_ips: new Set(geoBlocked.map((h: any) => h.ip_address).filter(Boolean)).size,
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  // 8. Check for SSRF attempts
  const { data: ssrfAttempts } = await supabase
    .from('audit_log')
    .select('id, ip_address, request_body')
    .eq('action', 'ssrf_attempt')
    .gte('created_at', oneHourAgo)
  
  if (ssrfAttempts && ssrfAttempts.length > 0) {
    alerts.push({
      type: 'SSRF Attempts Detected',
      severity: 'critical',
      message: `${ssrfAttempts.length} SSRF attempts blocked - active attack in progress`,
      details: {
        attempt_count: ssrfAttempts.length,
        unique_ips: new Set(ssrfAttempts.map((h: any) => h.ip_address).filter(Boolean)).size,
        top_ips: getTopIPs(ssrfAttempts),
        action_required: 'Immediately block offending IPs and review webhook URLs',
      },
      timestamp: new Date().toISOString(),
    })
  }
  
  return alerts
}

function getTopEndpoints(hits: any[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const hit of hits) {
    const endpoint = hit.request_body?.endpoint || 'unknown'
    counts[endpoint] = (counts[endpoint] || 0) + 1
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  )
}

function getTopIPs(hits: any[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const hit of hits) {
    const ip = hit.ip_address || 'unknown'
    counts[ip] = (counts[ip] || 0) + 1
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  )
}

Deno.serve(async (req) => {
  const requestId = generateRequestId()
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // Verify this is a cron job or authorized call
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    
    if (!cronSecret || !expectedSecret || !timingSafeEqual(cronSecret, expectedSecret)) {
      console.warn(`[${requestId}] Unauthorized security-alerts access attempt`)
      return errorResponse('Unauthorized', 401, req, requestId)
    }
    
    const supabase = getSupabaseClient()
    const alertEmail = Deno.env.get('SECURITY_ALERT_EMAIL') || 'security@soledgic.com'
    
    console.log(`[${requestId}] Running security metrics check`)
    
    // Check security metrics
    const alerts = await checkSecurityMetrics(supabase, requestId)
    
    if (alerts.length === 0) {
      console.log(`[${requestId}] No security alerts`)
      return jsonResponse({
        success: true,
        message: 'No security alerts',
        checked_at: new Date().toISOString(),
        request_id: requestId,
      }, 200, req, requestId)
    }
    
    // Determine overall severity
    const hasCritical = alerts.some(a => a.severity === 'critical')
    const hasWarning = alerts.some(a => a.severity === 'warning')
    const overallSeverity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'info'
    
    const subject = hasCritical
      ? '🚨 CRITICAL: Soledgic Security Alert'
      : hasWarning
        ? '⚠️ WARNING: Soledgic Security Alert'
        : 'ℹ️ Soledgic Security Notice'
    
    console.log(`[${requestId}] ${alerts.length} alerts found, severity: ${overallSeverity}`)
    
    // Send email
    const emailSent = await sendEmailAlert(alertEmail, subject, alerts)
    
    // Store alert in security_alerts table
    for (const alert of alerts) {
      await supabase.from('security_alerts').insert({
        severity: alert.severity,
        alert_type: alert.type,
        title: alert.message,
        metadata: alert.details,
      }).catch((err: any) => {
        console.error(`[${requestId}] Failed to store alert:`, err)
      })
    }
    
    // Log alert summary to audit_log
    await supabase.from('audit_log').insert({
      action: 'security_alert_sent',
      actor_type: 'system',
      actor_id: 'security-monitor',
      request_id: requestId,
      request_body: {
        alerts_count: alerts.length,
        severity: overallSeverity,
        email_sent: emailSent,
        recipient: alertEmail,
        alert_types: alerts.map(a => a.type),
      },
      risk_score: hasCritical ? 100 : hasWarning ? 70 : 30,
    })
    
    return jsonResponse({
      success: true,
      alerts_found: alerts.length,
      email_sent: emailSent,
      severity: overallSeverity,
      alerts: alerts,
      request_id: requestId,
    }, 200, req, requestId)
    
  } catch (error: any) {
    console.error(`[${requestId}] Security alert error:`, error.message)
    return errorResponse('An unexpected error occurred', 500, req, requestId)
  }
})
