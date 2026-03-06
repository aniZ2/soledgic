// Soledgic Edge Function: Bank Aggregator Webhooks
// POST /bank-aggregator-webhooks - Handle incoming Teller webhook events
// Events: enrollment.disconnected, transactions.processed

import {
  getCorsHeaders,
  getSupabaseClient,
  jsonResponse,
  errorResponse,
  logSecurityEvent,
} from '../_shared/utils.ts'
import { captureException } from '../_shared/error-tracking.ts'

interface TellerWebhookEvent {
  id: string
  type: string
  timestamp: string
  payload: {
    enrollment_id?: string
    account_id?: string
    reason?: string
    status?: string
    transactions?: unknown[]
  }
}

/**
 * Verify Teller webhook signature using HMAC-SHA256.
 * Header format: t=<timestamp>,v1=<signature>[,v1=<signature>]
 */
async function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false

  // Parse t= and v1= from header
  const parts = signatureHeader.split(',')
  let timestamp: string | null = null
  const signatures: string[] = []

  for (const part of parts) {
    const [key, value] = part.split('=', 2)
    if (key === 't') timestamp = value
    if (key === 'v1') signatures.push(value)
  }

  if (!timestamp || signatures.length === 0) return false

  // Reject if timestamp is older than 3 minutes (replay protection)
  const eventTime = parseInt(timestamp, 10)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - eventTime) > 180) return false

  // Compute expected signature: HMAC-SHA256(secret, "{timestamp}.{body}")
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${body}`),
  )

  const expectedSignature = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Check if any v1 signature matches
  return signatures.some((sig) => sig === expectedSignature)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req)

  try {
    const rawBody = await req.text()

    // Verify webhook signature
    const webhookSecret = Deno.env.get('BANK_AGGREGATOR_WEBHOOK_SECRET')
    if (webhookSecret) {
      const signatureHeader = req.headers.get('teller-signature')
      const valid = await verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)
      if (!valid) {
        return errorResponse('Invalid webhook signature', 401, req)
      }
    }

    const body: TellerWebhookEvent = JSON.parse(rawBody)

    if (!body.type || !body.payload) {
      return errorResponse('Invalid webhook payload', 400, req)
    }

    const supabase = getSupabaseClient()
    const enrollmentId = body.payload.enrollment_id

    // Find connection by enrollment_id (stored as item_id)
    let connection: { id: string; ledger_id: string; status: string } | null = null
    if (enrollmentId) {
      const { data } = await supabase
        .from('bank_aggregator_connections')
        .select('id, ledger_id, status')
        .eq('item_id', enrollmentId)
        .single()
      connection = data
    }

    // Log all webhook events to audit_log
    await logSecurityEvent(supabase, connection?.ledger_id || null, 'bank_aggregator_webhook', {
      event_type: body.type,
      webhook_id: body.id,
      enrollment_id: enrollmentId,
      connection_id: connection?.id,
    }).catch(() => {})

    switch (body.type) {
      case 'enrollment.disconnected': {
        if (connection) {
          await supabase
            .from('bank_aggregator_connections')
            .update({
              status: 'disconnected',
              error_code: body.payload.reason || null,
              error_message: body.payload.reason
                ? `Disconnected: ${body.payload.reason}`
                : 'Enrollment disconnected',
            })
            .eq('id', connection.id)
        }

        return jsonResponse({ success: true, action: 'status_updated_disconnected' }, 200, req)
      }

      case 'transactions.processed': {
        // Teller has polled and enriched new transactions.
        // Flag connection for next sync cycle.
        if (connection) {
          await supabase
            .from('bank_aggregator_connections')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', connection.id)
        }

        return jsonResponse({ success: true, action: 'flagged_for_sync' }, 200, req)
      }

      case 'account.number_verification.processed': {
        // Microdeposit verification completed or expired
        return jsonResponse({ success: true, action: 'verification_noted' }, 200, req)
      }

      case 'webhook.test': {
        return jsonResponse({ success: true, action: 'test_acknowledged' }, 200, req)
      }

      default: {
        console.log(`Unhandled bank aggregator webhook: ${body.type}`)
        return jsonResponse({ success: true, action: 'ignored', event: body.type }, 200, req)
      }
    }
  } catch (error: unknown) {
    console.error('bank-aggregator-webhooks error:', error)
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: 'bank-aggregator-webhooks',
    })
    return errorResponse('Internal server error', 500, req)
  }
})
