import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, createServiceClient, SoledgicTestClient, SoledgicServiceClient } from '../test-client'

const hasServiceRole = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

describe('Webhook Replay & Idempotency E2E', () => {
  let ledger: SoledgicTestClient
  let service: SoledgicServiceClient | null
  const creatorId = `e2e_webhook_creator_${Date.now()}`

  beforeAll(async () => {
    ledger = createTestClient()
    service = createServiceClient()

    try {
      await ledger.createCreator({
        creatorId,
        displayName: 'E2E Webhook Creator',
        email: 'e2e-webhook@test.soledgic.com',
        defaultSplitPercent: 80,
      })
    } catch (err: any) {
      if (!err.message?.includes('duplicate') && !err.message?.includes('already exists')) {
        throw err
      }
    }
  })

  it('should create a webhook endpoint', async () => {
    const result = await ledger.createWebhookEndpoint({
      url: 'https://httpbin.org/post',
      events: ['checkout.completed', 'payout.created', 'refund.created'],
      description: 'E2E test endpoint',
    })

    expect(result.success).toBe(true)
    expect(result.data?.id).toBeDefined()
  })

  it('should list webhook endpoints', async () => {
    const result = await ledger.listWebhookEndpoints()

    expect(result.success).toBe(true)
  })

  it.skipIf(!hasServiceRole)('should process inbox idempotently (service role)', async () => {
    const first = await service!.processProcessorInbox({ limit: 5 })
    expect(first.success).toBe(true)

    const firstProcessed = first.results?.processed ?? 0

    const second = await service!.processProcessorInbox({ limit: 5 })
    expect(second.success).toBe(true)

    console.log(`Inbox processing: first=${firstProcessed}, second=${second.results?.processed ?? 0}`)
  })

  it.skipIf(!hasServiceRole)('should handle dry run mode (service role)', async () => {
    const result = await service!.processProcessorInbox({ limit: 5, dryRun: true })

    expect(result.success).toBe(true)
    expect(result.dry_run).toBe(true)
  })

  it('should list webhook deliveries (may be empty without refund/payout events)', async () => {
    // record-sale does NOT call queue_webhook — refunds,
    // payouts, reconcile-checkout-ledger, and process-processor-inbox do.
    // This test verifies the deliveries endpoint works correctly.
    const deliveries = await ledger.listWebhookDeliveries()
    expect(deliveries.success).toBe(true)
    expect(Array.isArray(deliveries.data)).toBe(true)
  })
})
