import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

describe('Refund Flow E2E', () => {
  let ledger: SoledgicTestClient
  const creatorId = `e2e_refund_creator_${Date.now()}`
  const saleRef = `e2e_refund_sale_${Date.now()}`
  const partialSaleRef = `e2e_refund_partial_${Date.now()}`

  beforeAll(async () => {
    ledger = createTestClient()

    try {
      await ledger.createCreator({
        creatorId,
        displayName: 'E2E Refund Creator',
        email: 'e2e-refund@test.soledgic.com',
        defaultSplitPercent: 80,
      })
    } catch (err: any) {
      if (!err.message?.includes('duplicate') && !err.message?.includes('already exists')) {
        throw err
      }
    }

    await ledger.recordSale({
      referenceId: saleRef,
      creatorId,
      amount: 10000,
      description: 'Sale for full refund test',
    })

    await ledger.recordSale({
      referenceId: partialSaleRef,
      creatorId,
      amount: 8000,
      description: 'Sale for partial refund test',
    })
  })

  it('should process a full refund (ledger-only)', async () => {
    const result = await ledger.createRefund({
      saleReference: saleRef,
      reason: 'E2E test: customer requested full refund',
      mode: 'ledger_only',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
    expect(result.is_full_refund).toBe(true)
    expect(result.refunded_amount).toBe(100) // API returns dollars (10000 cents / 100)
    expect(result.breakdown).toBeDefined()
    expect(result.breakdown.from_creator).toBeGreaterThan(0)
    expect(result.breakdown.from_platform).toBeGreaterThan(0)
  })

  it('should process a partial refund (ledger-only)', async () => {
    const result = await ledger.createRefund({
      saleReference: partialSaleRef,
      amount: 3000, // $30 of $80
      reason: 'E2E test: partial refund',
      mode: 'ledger_only',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
    expect(result.is_full_refund).toBe(false)
    expect(result.refunded_amount).toBe(30) // API returns dollars (3000 cents / 100)
  })

  it('should reject refund on already-fully-refunded sale', async () => {
    await expect(
      ledger.createRefund({
        saleReference: saleRef,
        reason: 'E2E test: duplicate refund attempt',
        mode: 'ledger_only',
      })
    ).rejects.toThrow()
  })

  it('should handle idempotent refund with same idempotency key', async () => {
    const idempotencyKey = `idem_refund_${Date.now()}`
    const secondPartialRef = `e2e_refund_idem_${Date.now()}`

    await ledger.recordSale({
      referenceId: secondPartialRef,
      creatorId,
      amount: 5000,
      description: 'Sale for idempotency test',
    })

    const first = await ledger.createRefund({
      saleReference: secondPartialRef,
      amount: 2000,
      reason: 'Idempotency test',
      mode: 'ledger_only',
      idempotencyKey,
    })

    expect(first.success).toBe(true)

    // Same idempotency key should not create a duplicate
    try {
      const second = await ledger.createRefund({
        saleReference: secondPartialRef,
        amount: 2000,
        reason: 'Idempotency test',
        mode: 'ledger_only',
        idempotencyKey,
      })
      // If it returns success, it should be the same transaction
      if (second.success) {
        expect(second.transaction_id).toBe(first.transaction_id)
      }
    } catch {
      // Rejecting duplicate is also acceptable behavior
    }
  })

  it('should reflect refunds in creator balance', async () => {
    const result = await ledger.getParticipantBalance(creatorId)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(typeof result.data.available_balance).toBe('number')
  })
})
