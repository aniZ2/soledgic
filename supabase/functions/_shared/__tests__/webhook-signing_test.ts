import {
  assertEquals,
  assertMatch,
} from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  buildWebhookHeaders,
  buildWebhookSignatureHeader,
} from '../webhook-signing.ts'

Deno.test('buildWebhookSignatureHeader: emits timestamped v1 signature', async () => {
  const header = await buildWebhookSignatureHeader('{"event":"refund.created"}', 'whsec_test', {
    timestamp: 1_762_000_000,
  })

  assertMatch(header, /^t=1762000000,v1=[a-f0-9]{64}$/)
})

Deno.test('buildWebhookSignatureHeader: includes previous secret signature during grace period', async () => {
  const header = await buildWebhookSignatureHeader('{"event":"payout.created"}', 'whsec_current', {
    timestamp: 1_762_000_000,
    previousSecret: 'whsec_previous',
    secretRotatedAt: new Date().toISOString(),
  })

  const matches = header.match(/v1=/g) || []
  assertEquals(matches.length, 2)
})

Deno.test('buildWebhookHeaders: emits normalized delivery headers', async () => {
  const headers = await buildWebhookHeaders('{"event":"test"}', 'whsec_test', {
    eventType: 'test',
    deliveryId: 'del_123',
    attempt: 3,
    timestamp: 1_762_000_000,
  })

  assertEquals(headers['X-Soledgic-Event'], 'test')
  assertEquals(headers['X-Soledgic-Delivery-Id'], 'del_123')
  assertEquals(headers['X-Soledgic-Attempt'], '3')
  assertEquals(headers['X-Soledgic-Timestamp'], '1762000000')
  assertMatch(headers['X-Soledgic-Signature'], /^t=1762000000,v1=[a-f0-9]{64}$/)
})
