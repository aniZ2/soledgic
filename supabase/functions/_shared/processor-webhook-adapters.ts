// Soledgic: Processor Webhook Normalization
// Converts provider-specific webhook payloads into Soledgic-normalized events.
//
// This module is intentionally whitelabeled: it contains no vendor-specific
// identifiers. Any vendor-specific mapping should live in configuration (env)
// or in a dedicated adapter implementation.

export type NormalizedProcessorEventKind = 'charge' | 'payout' | 'refund' | 'dispute' | 'unknown'
export type NormalizedProcessorEventStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'unknown'

export interface ProcessorWebhookInboxRow {
  id: string
  received_at: string
  ledger_id: string | null
  event_id: string | null
  event_type: string | null
  resource_id: string | null
  livemode: boolean | null
  headers: Record<string, unknown>
  payload: unknown
  attempts: number
}

export interface NormalizedProcessorEvent {
  source_event_id: string
  source_event_type: string | null
  resource_id: string | null
  occurred_at: string | null
  livemode: boolean | null
  ledger_id: string | null
  kind: NormalizedProcessorEventKind
  status: NormalizedProcessorEventStatus
  amount_minor_units: number | null
  currency: string | null
  tags: Record<string, string>
  raw: unknown
}

export interface ProcessorWebhookAdapter {
  name: string
  normalize(row: ProcessorWebhookInboxRow): NormalizedProcessorEvent[]
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown, maxLen = 255): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function pickBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function pickNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function findKvObject(payload: unknown, maxDepth = 7): Record<string, unknown> | null {
  const visited = new Set<any>()
  const stack: Array<{ node: any; depth: number }> = [{ node: payload, depth: 0 }]

  while (stack.length > 0) {
    const next = stack.pop()
    if (!next) break
    const { node, depth } = next
    if (!isObject(node)) continue
    if (visited.has(node)) continue
    visited.add(node)

    if (isObject(node.tags)) return node.tags as Record<string, unknown>
    if (isObject(node.metadata)) return node.metadata as Record<string, unknown>

    if (depth >= maxDepth) continue
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') stack.push({ node: v, depth: depth + 1 })
    }
  }

  return null
}

function normalizeTags(obj: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    const key = pickString(k, 80)
    if (!key) continue
    if (typeof v === 'string') out[key] = v.slice(0, 500)
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = String(v)
  }
  return out
}

function extractLedgerId(row: ProcessorWebhookInboxRow, tags: Record<string, string>): string | null {
  return (
    row.ledger_id ||
    pickString(tags.ledger_id, 64) ||
    pickString(tags.soledgic_ledger_id, 64) ||
    null
  )
}

function extractStatusCandidate(payload: any): string | null {
  return (
    pickString(payload?.data?.object?.state) ||
    pickString(payload?.data?.object?.status) ||
    pickString(payload?.resource?.state) ||
    pickString(payload?.resource?.status) ||
    pickString(payload?.state) ||
    pickString(payload?.status) ||
    null
  )
}

function mapStatus(value: string | null): NormalizedProcessorEventStatus {
  const normalized = String(value || '').toUpperCase().trim()
  if (['SUCCEEDED', 'SETTLED', 'COMPLETED', 'SUCCESS'].includes(normalized)) return 'completed'
  if (['FAILED', 'CANCELED', 'CANCELLED', 'REJECTED', 'DECLINED', 'RETURNED', 'ERROR'].includes(normalized)) return 'failed'
  if (['PROCESSING', 'PENDING', 'CREATED', 'SENT', 'IN_PROGRESS'].includes(normalized)) return 'processing'
  return value ? 'unknown' : 'unknown'
}

function extractCurrency(payload: any): string | null {
  const c =
    pickString(payload?.data?.object?.currency, 8) ||
    pickString(payload?.resource?.currency, 8) ||
    pickString(payload?.currency, 8) ||
    null
  return c ? c.toUpperCase() : null
}

function extractAmountMinorUnits(payload: any): number | null {
  // Most provider APIs use minor units in event payloads.
  const candidates = [
    pickNumber(payload?.data?.object?.amount),
    pickNumber(payload?.resource?.amount),
    pickNumber(payload?.amount),
  ].filter((v) => typeof v === 'number') as number[]

  if (!candidates.length) return null
  // Prefer the first candidate; downstream can reference raw payload if needed.
  return Math.trunc(candidates[0] as number)
}

function extractOccurredAtIso(payload: any): string | null {
  const raw =
    payload?.data?.object?.created_at ??
    payload?.data?.object?.createdAt ??
    payload?.created_at ??
    payload?.createdAt ??
    payload?.occurred_at ??
    payload?.timestamp ??
    null

  if (typeof raw === 'string') {
    const d = new Date(raw)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Heuristic: seconds vs ms.
    const ms = raw > 2_000_000_000 ? raw : raw * 1000
    const d = new Date(ms)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  return null
}

function classifyKind(row: ProcessorWebhookInboxRow, tags: Record<string, string>): NormalizedProcessorEventKind {
  const t = (row.event_type || '').toLowerCase()

  if (pickString(tags.soledgic_payout_id, 128)) return 'payout'
  if (t.includes('dispute')) return 'dispute'
  if (t.includes('refund') || t.includes('reversal')) return 'refund'

  // Heuristics based on tag intent.
  if (pickString(tags.soledgic_original_sale_reference, 255)) return 'refund'

  return 'charge'
}

class GenericJsonAdapter implements ProcessorWebhookAdapter {
  name = 'generic_json'

  normalize(row: ProcessorWebhookInboxRow): NormalizedProcessorEvent[] {
    const payload = row.payload
    const payloadObj = isObject(payload) ? payload : {}

    const tagsRaw = findKvObject(payload)
    const tags = normalizeTags(tagsRaw)

    const ledgerId = extractLedgerId(row, tags)
    const sourceEventId = pickString(row.event_id, 255) || `inbox:${row.id}`
    const sourceEventType = pickString(row.event_type, 255)
    const livemode = pickBool(row.livemode) ?? null
    const occurredAt = extractOccurredAtIso(payloadObj) || null

    const resourceId =
      pickString(row.resource_id, 255) ||
      pickString((payloadObj as any)?.resource?.id, 255) ||
      pickString((payloadObj as any)?.data?.object?.id, 255) ||
      pickString((payloadObj as any)?.data?.id, 255) ||
      null

    const statusCandidate = extractStatusCandidate(payloadObj)
    const status = mapStatus(statusCandidate)
    const currency = extractCurrency(payloadObj)
    const amountMinorUnits = extractAmountMinorUnits(payloadObj)

    const kind = classifyKind(row, tags)

    return [
      {
        source_event_id: sourceEventId,
        source_event_type: sourceEventType,
        resource_id: resourceId,
        occurred_at: occurredAt,
        livemode,
        ledger_id: ledgerId,
        kind,
        status,
        amount_minor_units: amountMinorUnits,
        currency,
        tags,
        raw: payload,
      },
    ]
  }
}

export function getProcessorWebhookAdapter(): ProcessorWebhookAdapter {
  const configured = (Deno.env.get('PROCESSOR_WEBHOOK_ADAPTER') || '').toLowerCase().trim()
  if (!configured || configured === 'auto' || configured === 'generic') return new GenericJsonAdapter()

  // Future: plug in additional adapters behind this switch.
  return new GenericJsonAdapter()
}

