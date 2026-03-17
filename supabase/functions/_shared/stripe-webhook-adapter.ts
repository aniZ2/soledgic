// SERVICE_ID: SVC_STRIPE_WEBHOOK_ADAPTER
// Soledgic: Stripe webhook event → NormalizedProcessorEvent mapper
// Maps Stripe event types to the shared normalization schema.

import type {
  ProcessorWebhookAdapter,
  ProcessorWebhookInboxRow,
  NormalizedProcessorEvent,
  NormalizedProcessorEventKind,
  NormalizedProcessorEventStatus,
} from './processor-webhook-adapters.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown, maxLen = 255): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function pickNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function pickBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function classifyStripeEventKind(eventType: string): NormalizedProcessorEventKind {
  const t = eventType.toLowerCase()

  if (t.startsWith('charge.dispute')) return 'dispute'
  if (t.startsWith('charge.refund') || t === 'refund.created' || t === 'refund.updated') return 'refund'
  if (t.startsWith('transfer.')) return 'payout'
  if (t.startsWith('payout.')) return 'payout'
  if (
    t.startsWith('payment_intent.') ||
    t.startsWith('charge.') ||
    t === 'checkout.session.completed'
  ) {
    return 'charge'
  }

  return 'unknown'
}

function mapStripeStatus(eventType: string, objStatus: string | null): NormalizedProcessorEventStatus {
  const t = eventType.toLowerCase()

  // Event type often encodes the status directly
  if (t.includes('.succeeded') || t.includes('.completed') || t.includes('.paid')) return 'completed'
  if (t.includes('_failed') || t.includes('.failed') || t.includes('.canceled') || t.includes('.cancelled')) return 'failed'
  if (t.includes('.processing') || t.includes('.pending') || t.includes('.created')) return 'processing'

  // Fall back to the object's status field
  if (objStatus) {
    const s = objStatus.toLowerCase()
    if (['succeeded', 'paid', 'completed'].includes(s)) return 'completed'
    if (['failed', 'canceled', 'cancelled'].includes(s)) return 'failed'
    if (['processing', 'pending', 'requires_capture', 'requires_action'].includes(s)) return 'processing'
  }

  return 'unknown'
}

function normalizeTags(metadata: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isObject(metadata)) return out
  for (const [k, v] of Object.entries(metadata)) {
    const key = pickString(k, 80)
    if (!key) continue
    if (typeof v === 'string') out[key] = v.slice(0, 500)
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = String(v)
  }
  return out
}

export class StripeWebhookAdapter implements ProcessorWebhookAdapter {
  name = 'stripe'

  normalize(row: ProcessorWebhookInboxRow): NormalizedProcessorEvent[] {
    const payload = isObject(row.payload) ? row.payload : {}

    // Stripe event structure: { id, type, data: { object: { ... } }, livemode }
    const eventId = pickString(row.event_id) || pickString(payload.id) || `inbox:${row.id}`
    const eventType = pickString(row.event_type) || pickString(payload.type) || ''
    const livemode = pickBool(row.livemode) ?? pickBool(payload.livemode) ?? null

    const data = isObject(payload.data) ? payload.data : {}
    const obj = isObject(data.object) ? data.object : {}

    const resourceId =
      pickString(row.resource_id) ||
      pickString(obj.id) ||
      pickString(obj.payment_intent) ||
      null

    const metadata = isObject(obj.metadata) ? obj.metadata : {}
    const tags = normalizeTags(metadata)

    const ledgerId =
      row.ledger_id ||
      pickString(tags.ledger_id, 64) ||
      pickString(tags.soledgic_ledger_id, 64) ||
      null

    // Extract amount (Stripe uses minor units)
    const amountMinorUnits =
      pickNumber(obj.amount) ??
      pickNumber(obj.amount_received) ??
      pickNumber(obj.amount_refunded) ??
      null

    const currency = pickString(obj.currency, 8)
      ? String(obj.currency).toUpperCase()
      : null

    // Timestamp: Stripe uses Unix seconds in `created`
    let occurredAt: string | null = null
    const created = pickNumber(obj.created) ?? pickNumber(payload.created)
    if (created !== null) {
      const ms = created > 2_000_000_000 ? created : created * 1000
      const d = new Date(ms)
      occurredAt = Number.isFinite(d.getTime()) ? d.toISOString() : null
    }

    const kind = classifyStripeEventKind(eventType)
    const objStatus = pickString(obj.status)
    const status = mapStripeStatus(eventType, objStatus)

    // For disputes, link back to the original charge/payment_intent
    const linkedPaymentIntent = pickString(obj.payment_intent, 64)
    const linkedCharge = pickString(obj.charge, 64)
    if (linkedPaymentIntent) tags['_linked_payment_intent'] = linkedPaymentIntent
    if (linkedCharge) tags['_linked_charge'] = linkedCharge

    return [
      {
        source_event_id: eventId,
        source_event_type: eventType,
        resource_id: resourceId,
        occurred_at: occurredAt,
        livemode,
        ledger_id: ledgerId,
        kind,
        status,
        amount_minor_units: amountMinorUnits,
        currency,
        tags,
        raw: row.payload,
      },
    ]
  }
}
