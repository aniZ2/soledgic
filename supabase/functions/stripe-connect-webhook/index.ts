// Soledgic Edge Function: Stripe Connect Webhook
// POST /stripe-connect-webhook - Connect account lifecycle events
// Handles: account.updated, account.application.deauthorized

import { getCorsHeaders, getSupabaseClient, getClientIp } from '../_shared/utils.ts'

const MAX_BODY_SIZE = 256 * 1024 // 256KB

function jsonResponse(data: any, status = 200, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parts = signature.split(',')
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
    const v1 = parts.find(p => p.startsWith('v1='))?.slice(3)
    if (!timestamp || !v1) return { valid: false, reason: 'missing_parts' }

    // Replay protection — 5-minute window
    const ts = parseInt(timestamp)
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return { valid: false, reason: 'timestamp_expired' }
    }

    const signedPayload = `${timestamp}.${payload}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Constant-time comparison
    if (computed.length !== v1.length) {
      return { valid: false, reason: 'length_mismatch' }
    }
    let result = 0
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ v1.charCodeAt(i)
    }
    return { valid: result === 0, reason: result === 0 ? undefined : 'signature_mismatch' }
  } catch {
    return { valid: false, reason: 'verification_error' }
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleAccountUpdated(supabase: any, obj: any): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('sync_connected_account_status', {
    p_stripe_account_id: obj.id,
    p_charges_enabled: obj.charges_enabled ?? false,
    p_payouts_enabled: obj.payouts_enabled ?? false,
    p_details_submitted: obj.details_submitted ?? false,
    p_requirements_current: obj.requirements?.currently_due ?? [],
    p_requirements_past_due: obj.requirements?.past_due ?? [],
    p_requirements_pending: obj.requirements?.pending_verification ?? [],
  })

  if (error) {
    console.error('sync_connected_account_status RPC failed:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

async function handleDeauthorized(supabase: any, stripeAccountId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('connected_accounts')
    .update({
      stripe_status: 'disabled',
      charges_enabled: false,
      payouts_enabled: false,
      can_receive_transfers: false,
      can_request_payouts: false,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', stripeAccountId)

  if (error) {
    console.error('Deauthorize update failed:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  const supabase = getSupabaseClient()
  const clientIp = getClientIp(req)

  try {
    // 1. Body size check
    const contentLength = parseInt(req.headers.get('content-length') || '0')
    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse({ error: 'Payload too large' }, 413, req)
    }

    const body = await req.text()
    if (body.length > MAX_BODY_SIZE) {
      return jsonResponse({ error: 'Payload too large' }, 413, req)
    }

    // 2. Verify signature
    const webhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('STRIPE_CONNECT_WEBHOOK_SECRET not configured')
      return jsonResponse({ error: 'Webhook secret not configured' }, 500, req)
    }

    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      await logSecurityEvent(supabase, null, 'webhook_missing_signature', {
        ip: clientIp,
        webhook: 'connect',
      })
      return jsonResponse({ error: 'Missing stripe-signature header' }, 401, req)
    }

    const verification = await verifyStripeSignature(body, signature, webhookSecret)
    if (!verification.valid) {
      await logSecurityEvent(supabase, null, 'webhook_invalid_signature', {
        ip: clientIp,
        reason: verification.reason,
        webhook: 'connect',
      })
      return jsonResponse({ error: 'Invalid signature' }, 401, req)
    }

    // 3. Parse event
    const event = JSON.parse(body)
    if (!event?.id || !event?.type || !event?.data) {
      return jsonResponse({ error: 'Invalid event structure' }, 400, req)
    }

    // 4. Extract stripe_account_id
    let stripeAccountId: string | null = null
    if (event.type === 'account.updated') {
      stripeAccountId = event.data?.object?.id ?? null
    } else if (event.type === 'account.application.deauthorized') {
      stripeAccountId = event.account ?? null
    } else {
      // Unknown event type — extract best-effort account id
      stripeAccountId = event.account ?? event.data?.object?.id ?? null
    }

    if (!stripeAccountId) {
      console.warn(`No stripe_account_id in event ${event.id} (${event.type})`)
      return jsonResponse({ received: true, skipped: true, reason: 'no_account_id' }, 200, req)
    }

    // 5. Look up ledger_id from connected_accounts
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('ledger_id')
      .eq('stripe_account_id', stripeAccountId)
      .single()

    if (!connectedAccount) {
      // Unknown account — return 200 to prevent Stripe retries
      console.warn(`Unknown connected account: ${stripeAccountId} for event ${event.id}`)
      return jsonResponse({ received: true, skipped: true, reason: 'unknown_account' }, 200, req)
    }

    const ledgerId = connectedAccount.ledger_id

    // 6. Idempotency check
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id, status')
      .eq('ledger_id', ledgerId)
      .eq('stripe_event_id', event.id)
      .single()

    if (existing) {
      return jsonResponse({
        received: true,
        processed: false,
        reason: 'duplicate',
        original_id: existing.id,
        original_status: existing.status,
      }, 200, req)
    }

    // 7. Store raw event (status: pending)
    const { data: storedEvent, error: storeError } = await supabase
      .from('stripe_events')
      .insert({
        ledger_id: ledgerId,
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        raw_data: event,
        status: 'pending',
      })
      .select('id')
      .single()

    if (storeError) {
      console.error('Failed to store event:', storeError.message)
      return jsonResponse({ error: 'Failed to store event' }, 500, req)
    }

    // 8. Process event
    let result: { success: boolean; skipped?: boolean; error?: string }

    switch (event.type) {
      case 'account.updated':
        result = await handleAccountUpdated(supabase, event.data.object)
        break

      case 'account.application.deauthorized':
        result = await handleDeauthorized(supabase, stripeAccountId)
        break

      default:
        result = { success: true, skipped: true }
        break
    }

    // 9. Update stripe_events status
    const status = result.success
      ? (result.skipped ? 'skipped' : 'processed')
      : 'failed'

    await supabase
      .from('stripe_events')
      .update({
        status,
        processed_at: new Date().toISOString(),
        error_message: result.error?.substring(0, 500),
      })
      .eq('id', storedEvent.id)

    // 10. Audit log (fire-and-forget)
    supabase.from('audit_log').insert({
      ledger_id: ledgerId,
      action: 'stripe_connect_webhook',
      entity_type: 'stripe_event',
      entity_id: event.id,
      actor_type: 'system',
      actor_id: 'stripe',
      ip_address: clientIp,
      request_body: {
        event_type: event.type,
        stripe_account_id: stripeAccountId,
        livemode: event.livemode,
        success: result.success,
        skipped: result.skipped,
        status,
      },
    }).catch(() => {})

    // 11. Return 200
    return jsonResponse({ received: true, processed: result.success, status }, 200, req)

  } catch (error: any) {
    console.error('Connect webhook error:', error.message)
    return jsonResponse({ error: 'Internal server error' }, 500, req)
  }
})

// ============================================================================
// SECURITY LOGGING
// ============================================================================

async function logSecurityEvent(
  supabase: any,
  ledgerId: string | null,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    const riskScores: Record<string, number> = {
      webhook_missing_signature: 80,
      webhook_invalid_signature: 80,
      webhook_replay_attempt: 70,
    }
    await supabase.from('audit_log').insert({
      ledger_id: ledgerId,
      action,
      actor_type: 'system',
      actor_id: 'stripe_connect_webhook',
      ip_address: details.ip,
      request_body: details,
      risk_score: riskScores[action] || 50,
    })
  } catch (err) {
    console.error('Failed to log security event:', err)
  }
}
