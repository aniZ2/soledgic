import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

import {
  buildWebhookReplayUpdate,
  normalizeWebhookDelivery,
} from '../webhook-management.ts'

Deno.test('normalizeWebhookDelivery flattens endpoint url and preserves delivery details', () => {
  const normalized = normalizeWebhookDelivery({
    id: 'delivery_1',
    endpoint_id: 'endpoint_1',
    event_type: 'payout.executed',
    status: 'failed',
    attempts: 5,
    max_attempts: 5,
    response_status: 500,
    response_body: 'upstream exploded',
    response_time_ms: 1250,
    created_at: '2026-03-13T10:00:00Z',
    delivered_at: null,
    next_retry_at: '2026-03-13T10:05:00Z',
    payload: { event: 'payout.executed' },
    webhook_endpoints: { url: 'https://example.com/webhooks' },
  })

  assertEquals(normalized.endpoint_url, 'https://example.com/webhooks')
  assertEquals(normalized.max_attempts, 5)
  assertEquals(normalized.response_body, 'upstream exploded')
  assertEquals(normalized.payload, { event: 'payout.executed' })
})

Deno.test('normalizeWebhookDelivery handles joined webhook endpoint arrays', () => {
  const normalized = normalizeWebhookDelivery({
    id: 'delivery_2',
    endpoint_id: 'endpoint_2',
    event_type: 'refund.created',
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    response_status: null,
    response_body: null,
    response_time_ms: null,
    created_at: '2026-03-13T10:00:00Z',
    delivered_at: null,
    next_retry_at: null,
    payload: { event: 'refund.created' },
    webhook_endpoints: [{ url: 'https://example.com/array-endpoint' }],
  })

  assertEquals(normalized.endpoint_url, 'https://example.com/array-endpoint')
})

Deno.test('buildWebhookReplayUpdate resets delivery state for manual replay', () => {
  const update = buildWebhookReplayUpdate(new Date('2026-03-13T10:00:00Z'))

  assertEquals(update.status, 'pending')
  assertEquals(update.attempts, 0)
  assertEquals(update.delivered_at, null)
  assertEquals(update.next_retry_at, null)
  assertEquals(update.response_status, null)
  assertEquals(update.response_body, null)
  assertEquals(update.response_time_ms, null)
  assertEquals(update.scheduled_at, '2026-03-13T10:00:00.000Z')
})
