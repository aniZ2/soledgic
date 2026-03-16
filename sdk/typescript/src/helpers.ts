/**
 * Soledgic SDK Internal Helpers
 * Response mapping utilities
 */

import type { WebhookEndpoint, WebhookDelivery } from './types'

export function mapWebhookEndpoint(endpoint: any): WebhookEndpoint {
  return {
    id: String(endpoint?.id ?? ''),
    url: typeof endpoint?.url === 'string' ? endpoint.url : '',
    description: typeof endpoint?.description === 'string' ? endpoint.description : null,
    events: Array.isArray(endpoint?.events)
      ? endpoint.events.filter((event: unknown): event is string => typeof event === 'string')
      : [],
    isActive: Boolean(endpoint?.is_active),
    createdAt: typeof endpoint?.created_at === 'string' ? endpoint.created_at : '',
    secretRotatedAt:
      typeof endpoint?.secret_rotated_at === 'string' ? endpoint.secret_rotated_at : null,
  }
}

export function resolveWebhookEndpointUrl(webhookEndpoints: unknown, endpointUrl: unknown): string | null {
  if (typeof endpointUrl === 'string') {
    return endpointUrl
  }

  if (Array.isArray(webhookEndpoints)) {
    const first = webhookEndpoints[0]
    return typeof first?.url === 'string' ? first.url : null
  }

  if (webhookEndpoints && typeof webhookEndpoints === 'object' && typeof (webhookEndpoints as any).url === 'string') {
    return (webhookEndpoints as any).url
  }

  return null
}

export function mapWebhookDelivery(delivery: any): WebhookDelivery {
  return {
    id: String(delivery?.id ?? ''),
    endpointId: typeof delivery?.endpoint_id === 'string' ? delivery.endpoint_id : null,
    endpointUrl: resolveWebhookEndpointUrl(delivery?.webhook_endpoints, delivery?.endpoint_url),
    eventType: typeof delivery?.event_type === 'string' ? delivery.event_type : 'unknown',
    status: typeof delivery?.status === 'string' ? delivery.status : 'unknown',
    attempts: Number(delivery?.attempts || 0),
    maxAttempts:
      typeof delivery?.max_attempts === 'number' ? delivery.max_attempts : null,
    responseStatus:
      typeof delivery?.response_status === 'number' ? delivery.response_status : null,
    responseBody: typeof delivery?.response_body === 'string' ? delivery.response_body : null,
    responseTimeMs:
      typeof delivery?.response_time_ms === 'number' ? delivery.response_time_ms : null,
    createdAt: typeof delivery?.created_at === 'string' ? delivery.created_at : '',
    deliveredAt: typeof delivery?.delivered_at === 'string' ? delivery.delivered_at : null,
    nextRetryAt: typeof delivery?.next_retry_at === 'string' ? delivery.next_retry_at : null,
    payload:
      delivery?.payload && typeof delivery.payload === 'object'
        ? delivery.payload as Record<string, unknown>
        : null,
  }
}
