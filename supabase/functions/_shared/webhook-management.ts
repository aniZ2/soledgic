export interface WebhookEndpointRelation {
  url?: string | null
}

export interface WebhookDeliveryRow {
  id: string
  endpoint_id: string | null
  event_type: string
  status: string
  attempts: number | null
  max_attempts: number | null
  response_status: number | null
  response_body: string | null
  response_time_ms: number | null
  created_at: string
  delivered_at: string | null
  next_retry_at: string | null
  payload: unknown
  webhook_endpoints?: WebhookEndpointRelation | WebhookEndpointRelation[] | null
}

export interface NormalizedWebhookDelivery {
  id: string
  endpoint_id: string | null
  endpoint_url: string | null
  event_type: string
  status: string
  attempts: number
  max_attempts: number | null
  response_status: number | null
  response_body: string | null
  response_time_ms: number | null
  created_at: string
  delivered_at: string | null
  next_retry_at: string | null
  payload: unknown
}

function extractEndpointUrl(
  relation: WebhookEndpointRelation | WebhookEndpointRelation[] | null | undefined,
): string | null {
  if (!relation) return null
  if (Array.isArray(relation)) {
    return relation[0]?.url ?? null
  }
  return relation.url ?? null
}

export function normalizeWebhookDelivery(row: WebhookDeliveryRow): NormalizedWebhookDelivery {
  return {
    id: row.id,
    endpoint_id: row.endpoint_id,
    endpoint_url: extractEndpointUrl(row.webhook_endpoints),
    event_type: row.event_type,
    status: row.status,
    attempts: Number(row.attempts || 0),
    max_attempts: row.max_attempts ?? null,
    response_status: row.response_status ?? null,
    response_body: row.response_body ?? null,
    response_time_ms: row.response_time_ms ?? null,
    created_at: row.created_at,
    delivered_at: row.delivered_at ?? null,
    next_retry_at: row.next_retry_at ?? null,
    payload: row.payload ?? null,
  }
}

export function buildWebhookReplayUpdate(now = new Date()) {
  return {
    status: 'pending',
    attempts: 0,
    delivered_at: null,
    scheduled_at: now.toISOString(),
    next_retry_at: null,
    response_status: null,
    response_body: null,
    response_time_ms: null,
  }
}
