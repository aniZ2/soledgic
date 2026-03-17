import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000

function getStripeWebhookSecret(): string | null {
  const secret = (process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '').trim()
  return secret.length > 0 ? secret : null
}

function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): { valid: boolean; error?: string } {
  const parts: Record<string, string> = {}
  for (const segment of signatureHeader.split(',')) {
    const idx = segment.indexOf('=')
    if (idx < 0) continue
    const k = segment.slice(0, idx).trim()
    const v = segment.slice(idx + 1).trim()
    if (k && v) parts[k] = v
  }

  const timestamp = parts['t']
  const sig = parts['v1']

  if (!timestamp || !sig) {
    return { valid: false, error: 'Malformed Stripe-Signature header' }
  }

  const tsMs = Number(timestamp) * 1000
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > SIGNATURE_MAX_AGE_MS) {
    return { valid: false, error: 'Webhook timestamp outside tolerance window' }
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  const sigBuf = Buffer.from(sig, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, error: 'Signature mismatch' }
  }

  return { valid: true }
}

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const POST = createApiHandler(
  async (request, { requestId }) => {
    const rawBody = await request.text()

    // Verify Stripe signature
    const secret = getStripeWebhookSecret()
    const signatureHeader = (request.headers.get('stripe-signature') || '').trim()

    if (!secret) {
      return NextResponse.json({ error: 'Stripe webhook secret not configured' }, { status: 503 })
    }

    if (!signatureHeader) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 401 })
    }

    const verification = verifyStripeSignature(rawBody, signatureHeader, secret)
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error || 'Invalid signature' }, { status: 401 })
    }

    let event: JsonRecord
    try {
      event = JSON.parse(rawBody) as JsonRecord
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const eventType = typeof event.type === 'string' ? event.type : ''
    const data = isJsonRecord(event.data) ? event.data : {}
    const obj = isJsonRecord(data.object) ? data.object : {}

    const supabase = createServiceRoleClient()

    switch (eventType) {
      // ================================================================
      // Subscription lifecycle
      // ================================================================
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const customerId = typeof obj.customer === 'string' ? obj.customer : null
        const subscriptionId = typeof obj.id === 'string' ? obj.id : null
        const status = typeof obj.status === 'string' ? obj.status : null

        if (customerId && subscriptionId) {
          const orgStatus = mapSubscriptionStatusToOrgStatus(status)
          await supabase
            .from('organizations')
            .update({
              stripe_subscription_id: subscriptionId,
              status: orgStatus,
            })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const customerId = typeof obj.customer === 'string' ? obj.customer : null
        if (customerId) {
          await supabase
            .from('organizations')
            .update({
              stripe_subscription_id: null,
              status: 'canceled',
            })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      // ================================================================
      // Invoice events
      // ================================================================
      case 'invoice.paid': {
        const customerId = typeof obj.customer === 'string' ? obj.customer : null
        if (customerId) {
          // Clear past_due status when invoice is paid
          await supabase
            .from('organizations')
            .update({ status: 'active' })
            .eq('stripe_customer_id', customerId)
            .eq('status', 'past_due')
        }
        break
      }

      case 'invoice.payment_failed': {
        const customerId = typeof obj.customer === 'string' ? obj.customer : null
        if (customerId) {
          await supabase
            .from('organizations')
            .update({ status: 'past_due' })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      default:
        // Acknowledge unknown events without error
        break
    }

    return NextResponse.json({ success: true, event_type: eventType })
  },
  {
    requireAuth: false,
    csrfProtection: false,
    rateLimit: false,
    routePath: '/api/webhooks/stripe-billing',
    readonlyExempt: true,
    maxBodySize: 2 * 1024 * 1024,
  }
)

function mapSubscriptionStatusToOrgStatus(
  stripeStatus: string | null
): string {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
      return 'canceled'
    case 'incomplete':
    case 'incomplete_expired':
      return 'suspended'
    default:
      return 'active'
  }
}
