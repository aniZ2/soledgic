// Soledgic Edge Function: Webhooks Management
// POST /webhooks
// Manage webhook endpoints and view delivery history
// SECURITY HARDENED VERSION

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateUrl,
  validateString,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'

interface WebhookRequest {
  action: 'list' | 'create' | 'update' | 'delete' | 'test' | 'deliveries' | 'retry' | 'rotate_secret'
  endpoint_id?: string
  delivery_id?: string
  url?: string
  description?: string
  events?: string[]
  is_active?: boolean
}

// SECURITY: HMAC signature generation
async function generateHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// SECURITY: Check if an IP address is private/internal
function isPrivateIP(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%')[0]
  const parts = normalized.split('.')
  if (parts.length !== 4) {
    // IPv6 loopback / unspecified / private / link-local / multicast / docs
    if (normalized === '::1' || normalized === '::') {
      return true
    }
    if (/^fe[89ab]/.test(normalized)) {
      return true
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true
    }
    if (normalized.startsWith('ff')) {
      return true
    }
    if (normalized.startsWith('2001:db8:')) {
      return true
    }
    const mappedIpv4Match = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mappedIpv4Match && mappedIpv4Match[1]) {
      return isPrivateIP(mappedIpv4Match[1])
    }
    return false
  }
  
  const first = parseInt(parts[0])
  const second = parseInt(parts[1])
  
  if (first === 10) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 168) return true
  if (first === 169 && second === 254) return true // Link-local
  if (first === 127) return true // Loopback
  if (first === 0) return true
  
  return false
}

// SECURITY: Check if URL is safe (not internal/private)
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()
    
    // Block localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false
    }
    
    // Block internal IPs directly in hostname
    if (isPrivateIP(hostname)) {
      return false
    }
    
    // Block metadata endpoints
    if (hostname === '169.254.169.254' || hostname.includes('metadata')) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}

// SECURITY: Async URL safety check with DNS resolution (for DNS rebinding protection)
async function isUrlSafeWithDNS(urlString: string): Promise<{ safe: boolean; error?: string }> {
  // First do the basic check
  if (!isUrlSafe(urlString)) {
    return { safe: false, error: 'URL blocked: internal or private address' }
  }
  
  try {
    const url = new URL(urlString)
    const hostname = url.hostname
    
    // Skip DNS check for IP addresses (already validated above)
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
    if (ipv4Regex.test(hostname)) {
      return { safe: true }
    }
    
    // Resolve DNS and check if it points to a private IP.
    // This prevents DNS rebinding attacks.
    let validatedAny = false
    for (const recordType of ['A', 'AAAA'] as const) {
      const addresses = await Deno.resolveDns(hostname, recordType).catch(() => [])
      for (const addr of addresses) {
        validatedAny = true
        if (isPrivateIP(addr)) {
          return { safe: false, error: `DNS resolves to private IP: ${addr}` }
        }
      }
    }

    if (!validatedAny) {
      return { safe: false, error: 'DNS validation failed for webhook host' }
    }

    return { safe: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`DNS resolution failed for webhook URL: ${message}`)
    return { safe: false, error: 'DNS validation failed for webhook host' }
  }
}

const handler = createHandler(
  { endpoint: 'webhooks', requireAuth: true, rateLimit: true },
  async (req: Request, supabase, ledger: LedgerContext | null, body: WebhookRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    switch (body.action) {
      case 'list': {
        const { data: endpoints } = await supabase
          .from('webhook_endpoints')
          .select('id, url, description, events, is_active, created_at, secret_rotated_at')
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })

        return jsonResponse({ 
          success: true, 
          data: endpoints || [] 
        }, 200, req)
      }

      case 'create': {
        if (!body.url) {
          return errorResponse('URL is required', 400, req)
        }

        // SECURITY: Validate URL format
        const validatedUrl = validateUrl(body.url)
        if (!validatedUrl) {
          return errorResponse('Invalid URL. HTTPS required in production.', 400, req)
        }

        // SECURITY: Block internal/private URLs with DNS rebinding protection
        const urlSafetyCheck = await isUrlSafeWithDNS(validatedUrl)
        if (!urlSafetyCheck.safe) {
          return errorResponse(`URL not allowed: ${urlSafetyCheck.error}`, 400, req)
        }

        const { data: endpoint, error } = await supabase
          .from('webhook_endpoints')
          .insert({
            ledger_id: ledger.id,
            url: validatedUrl,
            description: body.description ? validateString(body.description, 500) : null,
            events: body.events || ['*'],
            is_active: true,
          })
          .select('id, url, secret, events')
          .single()

        if (error) {
          console.error('Failed to create webhook:', error)
          return errorResponse('Failed to create webhook endpoint', 500, req)
        }

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'webhook_created',
          entity_type: 'webhook_endpoint',
          entity_id: endpoint.id,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_body: { url: validatedUrl, events: body.events },
        })

        return jsonResponse({ 
          success: true, 
          data: {
            id: endpoint.id,
            url: endpoint.url,
            secret: endpoint.secret, // Show once on creation
            events: endpoint.events,
          },
          message: 'Webhook endpoint created. Save the secret - it will not be shown again.'
        }, 201, req)
      }

      case 'update': {
        if (!body.endpoint_id) {
          return errorResponse('endpoint_id is required', 400, req)
        }

        const updates: any = { updated_at: new Date().toISOString() }
        
        if (body.url) {
          const validatedUrl = validateUrl(body.url)
          if (!validatedUrl) {
            return errorResponse('Invalid URL', 400, req)
          }
          // SECURITY: DNS rebinding protection on update
          const urlSafetyCheck = await isUrlSafeWithDNS(validatedUrl)
          if (!urlSafetyCheck.safe) {
            return errorResponse(`URL not allowed: ${urlSafetyCheck.error}`, 400, req)
          }
          updates.url = validatedUrl
        }
        
        if (body.description !== undefined) {
          updates.description = body.description ? validateString(body.description, 500) : null
        }
        if (body.events) updates.events = body.events
        if (body.is_active !== undefined) updates.is_active = body.is_active

        const { data: endpoint, error } = await supabase
          .from('webhook_endpoints')
          .update(updates)
          .eq('id', body.endpoint_id)
          .eq('ledger_id', ledger.id)
          .select('id, url, description, events, is_active')
          .single()

        if (error) {
          return errorResponse('Failed to update endpoint', 500, req)
        }

        return jsonResponse({ success: true, data: endpoint }, 200, req)
      }

      case 'delete': {
        if (!body.endpoint_id) {
          return errorResponse('endpoint_id is required', 400, req)
        }

        const { error } = await supabase
          .from('webhook_endpoints')
          .delete()
          .eq('id', body.endpoint_id)
          .eq('ledger_id', ledger.id)

        if (error) {
          return errorResponse('Failed to delete endpoint', 500, req)
        }

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'webhook_deleted',
          entity_type: 'webhook_endpoint',
          entity_id: body.endpoint_id,
          actor_type: 'api',
          ip_address: getClientIp(req),
        })

        return jsonResponse({ success: true, message: 'Endpoint deleted' }, 200, req)
      }

      case 'rotate_secret': {
        if (!body.endpoint_id) {
          return errorResponse('endpoint_id is required', 400, req)
        }

        // Use the database function for secure rotation
        const { data: newSecret, error } = await supabase.rpc('rotate_webhook_secret', {
          p_endpoint_id: body.endpoint_id
        })

        if (error) {
          return errorResponse('Failed to rotate secret', 500, req)
        }

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'webhook_secret_rotated',
          entity_type: 'webhook_endpoint',
          entity_id: body.endpoint_id,
          actor_type: 'api',
          ip_address: getClientIp(req),
        })

        return jsonResponse({ 
          success: true, 
          data: { secret: newSecret },
          message: 'Secret rotated. Previous secret valid for 24 hours.' 
        }, 200, req)
      }

      case 'test': {
        if (!body.endpoint_id) {
          return errorResponse('endpoint_id is required', 400, req)
        }

        const { data: endpoint } = await supabase
          .from('webhook_endpoints')
          .select('url, secret')
          .eq('id', body.endpoint_id)
          .eq('ledger_id', ledger.id)
          .single()

        if (!endpoint) {
          return errorResponse('Endpoint not found', 404, req)
        }

        // SECURITY: Re-validate URL before making request (with DNS check)
        const urlSafetyCheck = await isUrlSafeWithDNS(endpoint.url)
        if (!urlSafetyCheck.safe) {
          return errorResponse(`Endpoint URL no longer allowed: ${urlSafetyCheck.error}`, 400, req)
        }

        const testPayload = {
          event: 'test',
          data: {
            message: 'This is a test webhook from Soledgic',
            ledger_id: ledger.id,
            timestamp: new Date().toISOString(),
          }
        }

        const payloadStr = JSON.stringify(testPayload)
        const signature = await generateHmacSignature(payloadStr, endpoint.secret)

        const startTime = Date.now()
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

          const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Soledgic-Signature': `sha256=${signature}`,
              'X-Soledgic-Event': 'test',
              'X-Soledgic-Delivery-Id': crypto.randomUUID(),
            },
            body: payloadStr,
            signal: controller.signal,
          })

          clearTimeout(timeout)
          const responseTime = Date.now() - startTime

          return jsonResponse({
            success: true,
            data: {
              delivered: response.ok,
              status: response.status,
              response_time_ms: responseTime,
            }
          }, 200, req)

        } catch (err: any) {
          const responseTime = Date.now() - startTime
          return jsonResponse({
            success: false,
            error: err.name === 'AbortError' ? 'Request timed out' : 'Failed to deliver',
            data: { 
              delivered: false,
              response_time_ms: responseTime,
            }
          }, 200, req)
        }
      }

      case 'deliveries': {
        const query = supabase
          .from('webhook_deliveries')
          .select(`
            id,
            event_type,
            status,
            attempts,
            response_status,
            response_time_ms,
            created_at,
            delivered_at,
            webhook_endpoints(url)
          `)
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })
          .limit(100)

        if (body.endpoint_id) {
          query.eq('endpoint_id', body.endpoint_id)
        }

        const { data: deliveries } = await query

        return jsonResponse({ success: true, data: deliveries || [] }, 200, req)
      }

      case 'retry': {
        if (!body.delivery_id) {
          return errorResponse('delivery_id is required', 400, req)
        }

        const { error } = await supabase
          .from('webhook_deliveries')
          .update({
            status: 'pending',
            scheduled_at: new Date().toISOString(),
            next_retry_at: null,
          })
          .eq('id', body.delivery_id)
          .eq('ledger_id', ledger.id)

        if (error) {
          return errorResponse('Failed to retry delivery', 500, req)
        }

        return jsonResponse({ success: true, message: 'Delivery queued for retry' }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req)
    }
  }
)

Deno.serve(handler)
