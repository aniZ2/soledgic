// Soledgic Edge Function: Process Webhooks
// Called by cron to deliver pending webhooks
// POST /process-webhooks (requires CRON_SECRET)
// SECURITY HARDENED VERSION v2 - with SSRF protection

import { 
  getCorsHeaders, 
  getSupabaseClient, 
  jsonResponse, 
  errorResponse,
  timingSafeEqual,
  validateWebhookUrl,
  isPrivateIP,
  logSecurityEvent
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req)

  try {
    // Verify cron secret - constant time comparison
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    
    if (!cronSecret || !expectedSecret) {
      return errorResponse('Unauthorized', 401, req)
    }

    if (!timingSafeEqual(cronSecret, expectedSecret)) {
      return errorResponse('Unauthorized', 401, req)
    }

    const supabase = getSupabaseClient()

    // Get pending webhooks
    const { data: pendingWebhooks, error } = await supabase.rpc('get_pending_webhooks', { p_limit: 50 })
    if (error) return errorResponse('Failed to get pending webhooks', 500, req)

    if (!pendingWebhooks?.length) {
      return jsonResponse({ success: true, message: 'No pending webhooks', processed: 0 }, 200, req)
    }

    const results = { processed: 0, delivered: 0, failed: 0, blocked: 0 }

    for (const webhook of pendingWebhooks) {
      results.processed++
      
      try {
        // ================================================================
        // SSRF PROTECTION: Validate URL before fetching
        // ================================================================
        const urlError = validateWebhookUrl(webhook.endpoint_url)
        if (urlError) {
          console.warn(`SSRF blocked: ${webhook.endpoint_url} - ${urlError}`)
          await logSecurityEvent(supabase, webhook.ledger_id, 'ssrf_attempt', {
            endpoint_url: webhook.endpoint_url,
            delivery_id: webhook.delivery_id,
            reason: urlError,
          })
          await supabase.rpc('mark_webhook_failed', {
            p_delivery_id: webhook.delivery_id,
            p_response_status: null,
            p_response_body: `Blocked: ${urlError}`,
            p_response_time_ms: null
          })
          results.blocked++
          continue
        }

        // DNS rebinding protection: resolve and validate
        const url = new URL(webhook.endpoint_url)
        let blockedByDns = false
        let dnsLookupSucceeded = false
        for (const recordType of ['A', 'AAAA'] as const) {
          try {
            const addresses = await Deno.resolveDns(url.hostname, recordType)
            if (!addresses || addresses.length === 0) {
              continue
            }
            dnsLookupSucceeded = true
            for (const addr of addresses) {
              if (!isPrivateIP(addr)) continue
              console.warn(`SSRF DNS rebinding blocked: ${url.hostname} -> ${addr}`)
              await logSecurityEvent(supabase, webhook.ledger_id, 'ssrf_attempt', {
                endpoint_url: webhook.endpoint_url,
                delivery_id: webhook.delivery_id,
                reason: `DNS resolves to private IP: ${addr}`,
              })
              await supabase.rpc('mark_webhook_failed', {
                p_delivery_id: webhook.delivery_id,
                p_response_status: null,
                p_response_body: `Blocked: DNS resolves to private IP`,
                p_response_time_ms: null
              })
              results.blocked++
              blockedByDns = true
              break
            }
            if (blockedByDns) break
          } catch (dnsErr) {
            // Some hosts may not publish both A and AAAA; continue with other record type.
            console.warn(`DNS ${recordType} lookup failed for ${url.hostname}:`, dnsErr)
          }
        }

        if (blockedByDns) {
          continue
        }

        // Fail-closed if we could not validate any DNS answer.
        if (!dnsLookupSucceeded) {
          console.warn(`SSRF DNS validation blocked: could not resolve ${url.hostname}`)
          await logSecurityEvent(supabase, webhook.ledger_id, 'ssrf_attempt', {
            endpoint_url: webhook.endpoint_url,
            delivery_id: webhook.delivery_id,
            reason: 'DNS validation failed: no A/AAAA answer',
          })
          await supabase.rpc('mark_webhook_failed', {
            p_delivery_id: webhook.delivery_id,
            p_response_status: null,
            p_response_body: 'Blocked: DNS validation failed',
            p_response_time_ms: null,
          })
          results.blocked++
          continue
        }

        const payloadStr = JSON.stringify(webhook.payload)
        
        // Generate HMAC signature
        const key = await crypto.subtle.importKey(
          'raw', 
          new TextEncoder().encode(webhook.endpoint_secret), 
          { name: 'HMAC', hash: 'SHA-256' }, 
          false, 
          ['sign']
        )
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr))
        const signature = Array.from(new Uint8Array(sig))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')

        const startTime = Date.now()
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        try {
          const response = await fetch(webhook.endpoint_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Soledgic-Signature': `sha256=${signature}`,
              'X-Soledgic-Event': webhook.event_type,
              'X-Soledgic-Delivery': webhook.delivery_id,
              'User-Agent': 'Soledgic-Webhook/1.0',
            },
            body: payloadStr,
            signal: controller.signal,
          })

          clearTimeout(timeoutId)
          const responseTime = Date.now() - startTime
          
          let responseBody = ''
          try {
            responseBody = await response.text()
            if (responseBody.length > 1000) {
              responseBody = responseBody.substring(0, 1000) + '...[truncated]'
            }
          } catch { 
            responseBody = '[Could not read response body]' 
          }

          if (response.ok) {
            await supabase.rpc('mark_webhook_delivered', { 
              p_delivery_id: webhook.delivery_id, 
              p_response_status: response.status, 
              p_response_body: responseBody, 
              p_response_time_ms: responseTime 
            })
            results.delivered++
          } else {
            await supabase.rpc('mark_webhook_failed', { 
              p_delivery_id: webhook.delivery_id, 
              p_response_status: response.status, 
              p_response_body: responseBody, 
              p_response_time_ms: responseTime 
            })
            results.failed++
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          await supabase.rpc('mark_webhook_failed', { 
            p_delivery_id: webhook.delivery_id, 
            p_response_status: null, 
            p_response_body: fetchError.name === 'AbortError' 
              ? 'Request timeout' 
              : fetchError.message, 
            p_response_time_ms: null 
          })
          results.failed++
        }
      } catch (err: any) {
        console.error(`Error processing webhook ${webhook.delivery_id}:`, err)
        results.failed++
      }
    }

    return jsonResponse({ 
      success: true, 
      message: `Processed ${results.processed} webhooks`, 
      results 
    }, 200, req)

  } catch (error: any) {
    console.error('Error:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
