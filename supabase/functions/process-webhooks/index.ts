// Soledgic Edge Function: Process Webhooks
// Called by cron to deliver pending webhooks
// POST /process-webhooks (requires CRON_SECRET)
// SECURITY HARDENED VERSION v2 - with SSRF protection

import { 
  getCorsHeaders, 
  getSupabaseClient, 
  jsonResponse, 
  errorResponse,
  validateWebhookUrl,
  isPrivateIP,
  logSecurityEvent
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  try {
    // Verify cron secret - constant time comparison
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    
    if (!cronSecret || !expectedSecret) {
      return errorResponse('Unauthorized', 401, req)
    }

    // Constant-time comparison
    const encoder = new TextEncoder()
    const a = encoder.encode(cronSecret)
    const b = encoder.encode(expectedSecret)
    if (a.length !== b.length) return errorResponse('Unauthorized', 401, req)
    let mismatch = 0
    for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i]
    if (mismatch !== 0) return errorResponse('Unauthorized', 401, req)

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
        try {
          const addresses = await Deno.resolveDns(url.hostname, 'A')
          for (const addr of addresses) {
            if (isPrivateIP(addr)) {
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
              continue
            }
          }
        } catch (dnsErr) {
          // DNS resolution failed - allow but it will fail on fetch
          console.warn(`DNS resolution failed for ${url.hostname}:`, dnsErr)
        }

        const payloadStr = JSON.stringify(webhook.payload)
        
        // Generate HMAC signature
        const key = await crypto.subtle.importKey(
          'raw', 
          encoder.encode(webhook.endpoint_secret), 
          { name: 'HMAC', hash: 'SHA-256' }, 
          false, 
          ['sign']
        )
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr))
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
