import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, createServiceClient, SoledgicTestClient, SoledgicServiceClient } from '../test-client'

const hasServiceRole = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

describe('Checkout Flow E2E', () => {
  let ledger: SoledgicTestClient
  let service: SoledgicServiceClient | null
  const creatorId = `e2e_checkout_creator_${Date.now()}`
  const saleRef = `e2e_checkout_sale_${Date.now()}`

  beforeAll(async () => {
    ledger = createTestClient('booklyverse')
    service = createServiceClient()

    // Create a test creator
    try {
      await ledger.createCreator({
        creatorId,
        displayName: 'E2E Checkout Creator',
        email: 'e2e-checkout@test.soledgic.com',
        defaultSplitPercent: 80,
      })
    } catch (err: any) {
      if (!err.message?.includes('duplicate') && !err.message?.includes('already exists')) {
        throw err
      }
    }
  })

  it('should record a sale with correct breakdown', async () => {
    const result = await ledger.recordSale({
      referenceId: saleRef,
      creatorId,
      amount: 5000, // $50.00
      description: 'E2E checkout test sale',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
    expect(result.breakdown).toBeDefined()
    expect(result.breakdown.total).toBe(50.00)
    // 80% split
    expect(result.breakdown.creator_amount).toBeCloseTo(40.00, 2)
    expect(result.breakdown.platform_amount).toBeCloseTo(10.00, 2)
  })

  it('should reject duplicate sale reference', async () => {
    await expect(
      ledger.recordSale({
        referenceId: saleRef,
        creatorId,
        amount: 5000,
        description: 'Duplicate sale attempt',
      })
    ).rejects.toThrow()
  })

  it('should reflect sale in creator balance', async () => {
    const result = await ledger.getCreatorBalance(creatorId)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data.available_balance).toBeGreaterThan(0)
  })

  it('should reflect sale in trial balance', async () => {
    const report = await ledger.getTrialBalance()

    expect(report.success).toBe(true)
    expect(report.report).toBeDefined()
    expect(report.report.totals).toBeDefined()
  })

  it.skipIf(!hasServiceRole)('should reconcile pending checkouts (service role)', async () => {
    const result = await service!.reconcileCheckouts({ limit: 10 })

    expect(result.success).toBe(true)
    expect(typeof result.processed).toBe('number')
    expect(typeof result.reconciled).toBe('number')
  })
})
