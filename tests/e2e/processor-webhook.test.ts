import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'crypto'
import { createServiceClient, SoledgicServiceClient } from '../test-client'

/**
 * Processor Webhook Ingestion E2E
 *
 * Requires (set in .env.test to enable):
 * - NEXT_PUBLIC_APP_URL pointing to a running Next.js instance
 * - PROCESSOR_WEBHOOK_TOKEN for bearer-token auth tests
 * - PROCESSOR_WEBHOOK_SIGNING_KEY for Finix-Signature auth tests
 * - SUPABASE_SERVICE_ROLE_KEY for inbox processing tests
 *
 * Tests are skipped when the required env vars are not configured.
 */

const NEXT_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
const webhookToken = (process.env.PROCESSOR_WEBHOOK_TOKEN || '').trim()
const hasWebhookAuth = webhookToken.length > 0
const webhookSigningKey = (process.env.PROCESSOR_WEBHOOK_SIGNING_KEY || '').trim()
const hasSigningKey = webhookSigningKey.length > 0
const hasServiceRole = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

/**
 * Build a valid Finix-Signature header for a given body and signing key.
 * Format: "timestamp=<unix_seconds>, sig=<hmac_sha256_hex>"
 * HMAC payload: "<timestamp>:<rawBody>"
 */
function buildFinixSignature(rawBody: string, signingKey: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const sig = createHmac('sha256', signingKey)
    .update(`${timestamp}:${rawBody}`)
    .digest('hex')
  return `timestamp=${timestamp}, sig=${sig}`
}

// Probe the Next.js app before test registration.
// Resolved once at import time so it.skipIf can read it synchronously.
let hasNextApp = false
if (NEXT_APP_URL.length > 0) {
  try {
    const probe = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    })
    hasNextApp = true
  } catch {
    console.log(`Processor webhook tests skipped: ${NEXT_APP_URL} is not reachable`)
  }
}

describe('Processor Webhook Ingestion E2E', () => {
  let service: SoledgicServiceClient | null

  beforeAll(() => {
    service = createServiceClient()
  })

  it.skipIf(!hasNextApp)('should reject unauthenticated processor webhook', async () => {
    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'transfer',
        type: 'created',
        _embedded: { transfers: [{ id: 'TRtest_unauthenticated', state: 'SUCCEEDED', amount: 1000 }] },
      }),
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it.skipIf(!hasNextApp || !hasWebhookAuth || hasSigningKey)('should accept authenticated processor webhook (bearer token)', async () => {
    const transferId = `TRtest_e2e_${Date.now()}`

    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookToken}`,
      },
      body: JSON.stringify({
        entity: 'transfer',
        type: 'created',
        _embedded: {
          transfers: [{
            id: transferId,
            state: 'SUCCEEDED',
            amount: 5000,
            currency: 'USD',
            type: 'DEBIT',
            tags: {
              ledger_id: 'test-ledger-id',
              creator_id: 'test-creator-id',
            },
          }],
        },
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it.skipIf(!hasNextApp || !hasWebhookAuth || hasSigningKey)('should handle duplicate webhook delivery idempotently (bearer token)', async () => {
    const transferId = `TRtest_idempotent_${Date.now()}`
    const payload = {
      entity: 'transfer',
      type: 'created',
      _embedded: {
        transfers: [{
          id: transferId,
          state: 'SUCCEEDED',
          amount: 3000,
          currency: 'USD',
          type: 'DEBIT',
          tags: { ledger_id: 'test-ledger-id' },
        }],
      },
    }

    const first = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookToken}`,
      },
      body: JSON.stringify(payload),
    })

    const second = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookToken}`,
      },
      body: JSON.stringify(payload),
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })

  it.skipIf(!hasServiceRole)('should process ingested events from inbox (service role)', async () => {
    const result = await service!.processProcessorInbox({ limit: 10 })

    expect(result.success).toBe(true)
    expect(result.results).toBeDefined()

    console.log('Processor inbox results:', {
      claimed: result.results?.claimed,
      processed: result.results?.processed,
      failed: result.results?.failed,
      skipped: result.results?.skipped,
      webhooksQueued: result.results?.webhooks_queued,
    })
  })

  it.skipIf(!hasNextApp || !hasSigningKey)('should accept webhook with valid Finix-Signature', async () => {
    const transferId = `TRtest_sig_${Date.now()}`
    const body = JSON.stringify({
      entity: 'transfer',
      type: 'created',
      _embedded: {
        transfers: [{
          id: transferId,
          state: 'SUCCEEDED',
          amount: 7500,
          currency: 'USD',
          type: 'DEBIT',
          tags: { ledger_id: 'test-ledger-id' },
        }],
      },
    })

    const signature = buildFinixSignature(body, webhookSigningKey)

    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Finix-Signature': signature,
      },
      body,
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it.skipIf(!hasNextApp || !hasSigningKey)('should reject webhook with invalid Finix-Signature', async () => {
    const body = JSON.stringify({
      entity: 'transfer',
      type: 'created',
      _embedded: { transfers: [{ id: `TRtest_badsig_${Date.now()}`, state: 'SUCCEEDED', amount: 100 }] },
    })

    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Finix-Signature': 'timestamp=9999999999, sig=0000000000000000000000000000000000000000000000000000000000000000',
      },
      body,
    })

    expect(res.status).toBe(401)
  })

  it.skipIf(!hasNextApp || !hasSigningKey)('should reject webhook with expired Finix-Signature timestamp', async () => {
    const body = JSON.stringify({
      entity: 'transfer',
      type: 'created',
      _embedded: { transfers: [{ id: `TRtest_expired_${Date.now()}`, state: 'SUCCEEDED', amount: 100 }] },
    })

    // Timestamp from 10 minutes ago — outside the 5-minute tolerance window
    const staleTimestamp = (Math.floor(Date.now() / 1000) - 600).toString()
    const sig = createHmac('sha256', webhookSigningKey)
      .update(`${staleTimestamp}:${body}`)
      .digest('hex')

    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Finix-Signature': `timestamp=${staleTimestamp}, sig=${sig}`,
      },
      body,
    })

    expect(res.status).toBe(401)
  })

  it.skipIf(!hasNextApp || (!hasWebhookAuth && !hasSigningKey))('should reject oversized webhook payload', async () => {
    const largeBody = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024 + 1) })
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (hasSigningKey) {
      headers['Finix-Signature'] = buildFinixSignature(largeBody, webhookSigningKey)
    } else {
      headers['Authorization'] = `Bearer ${webhookToken}`
    }

    const res = await fetch(`${NEXT_APP_URL}/api/webhooks/processor`, {
      method: 'POST',
      headers,
      body: largeBody,
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
