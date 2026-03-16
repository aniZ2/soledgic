/**
 * SDK Contract Tests
 *
 * These tests use the REAL Soledgic SDK class against the live test API.
 * Unlike the unit tests (which mock fetch), these validate the full contract:
 *   SDK method → HTTP request → Edge Function → Response → SDK parsing
 *
 * If the API changes its response shape, these tests break.
 * If the SDK sends wrong field names, these tests break.
 */

import { describe, it, expect } from 'vitest'
import { Soledgic, SoledgicError } from '../../sdk/typescript/src/index'

const API_KEY = process.env.TEST_API_KEY_PRIMARY!
const BASE_URL = process.env.SOLEDGIC_URL!

function createSdk(): Soledgic {
  if (!API_KEY || !BASE_URL) {
    throw new Error('TEST_API_KEY_PRIMARY and SOLEDGIC_URL must be set in .env.test')
  }
  return new Soledgic({ apiKey: API_KEY, baseUrl: BASE_URL })
}

describe('SDK Contract Tests', () => {
  const sdk = createSdk()
  const testRef = `sdk_contract_${Date.now()}`

  // ── Sales ──────────────────────────────────────────────────────────

  describe('recordSale', () => {
    it('should record a sale and return expected response shape', async () => {
      const result = await sdk.recordSale({
        referenceId: `${testRef}_sale`,
        creatorId: 'creator_sdk_contract',
        amount: 5000,
      })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.transaction_id).toBeDefined()
      expect(typeof result.transaction_id).toBe('string')
      expect(result.breakdown).toBeDefined()
      expect(typeof result.breakdown.gross_amount).toBe('number')
      expect(typeof result.breakdown.creator_amount).toBe('number')
      expect(typeof result.breakdown.platform_amount).toBe('number')
    })

    it('should return idempotent response for duplicate reference', async () => {
      const result = await sdk.recordSale({
        referenceId: `${testRef}_sale`,
        creatorId: 'creator_sdk_contract',
        amount: 5000,
      })

      // Should succeed (idempotent) or return the existing transaction
      expect(result).toBeDefined()
    })

    it('should reject invalid amount with SoledgicError', async () => {
      try {
        await sdk.recordSale({
          referenceId: `${testRef}_bad`,
          creatorId: 'creator_sdk_contract',
          amount: -100,
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(SoledgicError)
        expect((err as SoledgicError).status).toBeGreaterThanOrEqual(400)
      }
    })
  })

  // ── Refunds ────────────────────────────────────────────────────────

  describe('createRefund', () => {
    it('should refund a sale and return expected shape', async () => {
      const result = await sdk.createRefund({
        saleReference: `${testRef}_sale`,
        reason: 'SDK contract test',
        mode: 'ledger_only',
      })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.refund).toBeDefined()
      // SDK transforms to camelCase
      expect(result.refund.transactionId).toBeDefined()
      expect(typeof result.refund.refundedAmount).toBe('number')
      expect(typeof result.refund.isFullRefund).toBe('boolean')
    })
  })

  // ── Reports ────────────────────────────────────────────────────────

  describe('getTrialBalance', () => {
    it('should return trial balance with expected shape', async () => {
      const result = await sdk.getTrialBalance()

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.report).toBeDefined()
      expect(result.report.totals).toBeDefined()
      expect(typeof result.report.totals.debits).toBe('number')
      expect(typeof result.report.totals.credits).toBe('number')
      expect(typeof result.report.totals.balanced).toBe('boolean')
    })
  })

  describe('getBalanceSheet', () => {
    it('should return balance sheet with expected shape', async () => {
      const result = await sdk.getBalanceSheet()

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
  })

  describe('getProfitLoss', () => {
    it('should return P&L with expected shape', async () => {
      const result = await sdk.getProfitLoss()

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
  })

  // ── Webhooks ───────────────────────────────────────────────────────

  describe('listWebhookEndpoints', () => {
    it('should return data array', async () => {
      const result = await sdk.listWebhookEndpoints()

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      // SDK returns { data: [...] } not { endpoints: [...] }
      expect(Array.isArray(result.data)).toBe(true)
    })
  })

  // ── Health ─────────────────────────────────────────────────────────

  describe('getHealthStatus', () => {
    it('should return health check with expected shape', async () => {
      const result = await sdk.getHealthStatus() as any

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      // Health check returns latest result or empty state
      if (result.latest) {
        expect(['passed', 'warning', 'failed']).toContain(result.latest.status)
      }
    })
  })

  // ── Error Handling ─────────────────────────────────────────────────

  describe('error contract', () => {
    it('should throw SoledgicError with status and details on 400', async () => {
      try {
        await sdk.recordSale({
          referenceId: '',
          creatorId: '',
          amount: 0,
        })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(SoledgicError)
        const sdkErr = err as SoledgicError
        expect(sdkErr.status).toBeGreaterThanOrEqual(400)
        expect(sdkErr.message).toBeDefined()
        expect(typeof sdkErr.message).toBe('string')
      }
    })
  })
})
