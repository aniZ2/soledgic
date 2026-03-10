import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

describe('Refund Entry Method E2E', () => {
  let ledger: SoledgicTestClient
  const creatorId = `e2e_rem_creator_${Date.now()}`
  const saleRef = `e2e_rem_sale_${Date.now()}`

  beforeAll(async () => {
    ledger = createTestClient('booklyverse')

    try {
      await ledger.createCreator({
        creatorId,
        displayName: 'E2E Refund Entry Method Creator',
        email: 'e2e-rem@test.soledgic.com',
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
      amount: 10000, // $100
      description: 'Sale for refund entry method test',
    })
  })

  it('should record a ledger-only refund as entry_method=manual', async () => {
    const result = await ledger.recordRefund({
      originalSaleReference: saleRef,
      amount: 3000, // $30 partial
      reason: 'E2E test: ledger-only refund should be manual',
      mode: 'ledger_only',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
    expect(result.refunded_amount).toBe(30)

    // After this refund, provenance report should show manual entries increased
    const provenance = await ledger.getProvenanceReport()
    expect(provenance.report.counts.manual).toBeGreaterThan(0)
  })

  it('should reject over-refund beyond remaining balance', async () => {
    // Already refunded $30 of $100, so $70 remains
    await expect(
      ledger.recordRefund({
        originalSaleReference: saleRef,
        amount: 8000, // $80 > $70 remaining
        reason: 'E2E test: over-refund attempt',
        mode: 'ledger_only',
      })
    ).rejects.toThrow()
  })

  it('should allow remaining partial refund within balance', async () => {
    const result = await ledger.recordRefund({
      originalSaleReference: saleRef,
      amount: 7000, // $70 = exact remaining
      reason: 'E2E test: remaining balance refund',
      mode: 'ledger_only',
    })

    expect(result.success).toBe(true)
    expect(result.is_full_refund).toBe(true)
    expect(result.refunded_amount).toBe(70)
  })
})
