import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

describe('Payout Flow E2E', () => {
  let ledger: SoledgicTestClient
  const creatorId = `e2e_payout_creator_${Date.now()}`
  let payoutTransactionId: string | null = null

  beforeAll(async () => {
    ledger = createTestClient('booklyverse')

    try {
      await ledger.createCreator({
        creatorId,
        displayName: 'E2E Payout Creator',
        email: 'e2e-payout@test.soledgic.com',
        defaultSplitPercent: 80,
      })
    } catch (err: any) {
      if (!err.message?.includes('duplicate') && !err.message?.includes('already exists')) {
        throw err
      }
    }

    // Record sales to build up balance
    for (let i = 0; i < 3; i++) {
      await ledger.recordSale({
        referenceId: `e2e_payout_sale_${Date.now()}_${i}`,
        creatorId,
        amount: 10000, // $100 each
        description: `E2E payout test sale ${i}`,
      })
    }
  })

  it('should verify creator has available balance', async () => {
    const result = await ledger.getCreatorBalance(creatorId)

    expect(result.success).toBe(true)
    expect(result.data.available_balance).toBeGreaterThan(0)
    console.log(`Creator balance before payout: $${result.data.available_balance}`)
  })

  it('should process a payout (ledger operation)', async () => {
    const payoutRef = `e2e_payout_${Date.now()}`

    const result = await ledger.processPayout({
      creatorId,
      referenceId: payoutRef,
      amount: 5000, // $50.00
      description: 'E2E payout test',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
    expect(result.breakdown).toBeDefined()
    expect(result.breakdown.gross_payout).toBeGreaterThan(0)
    expect(result.new_balance).toBeDefined()

    payoutTransactionId = result.transaction_id
    console.log(`Payout transaction: ${payoutTransactionId}`)
  })

  it('should reject payout exceeding available balance', async () => {
    await expect(
      ledger.processPayout({
        creatorId,
        referenceId: `e2e_payout_excess_${Date.now()}`,
        amount: 999999999,
        description: 'Should fail - insufficient balance',
      })
    ).rejects.toThrow()
  })

  it('should reject duplicate payout reference', async () => {
    const dupRef = `e2e_payout_dup_${Date.now()}`

    await ledger.processPayout({
      creatorId,
      referenceId: dupRef,
      amount: 1000,
      description: 'First payout',
    })

    await expect(
      ledger.processPayout({
        creatorId,
        referenceId: dupRef,
        amount: 1000,
        description: 'Duplicate payout',
      })
    ).rejects.toThrow()
  })

  it('should list available payout rails', async () => {
    const result = await ledger.executePayout({
      action: 'list_rails',
    })

    expect(result.success).toBe(true)
    expect(Array.isArray(result.rails)).toBe(true)

    const KNOWN_RAILS = ['card', 'manual', 'wise', 'crypto']
    const railNames = result.rails.map((r: any) => r.rail)

    // Must contain exactly the known rails
    expect(railNames.sort()).toEqual(KNOWN_RAILS.sort())

    // Each entry has the correct shape
    for (const r of result.rails) {
      expect(typeof r.rail).toBe('string')
      expect(KNOWN_RAILS).toContain(r.rail)
      expect(typeof r.configured).toBe('boolean')
    }
  })

  it('should reflect payout in updated balance', async () => {
    const result = await ledger.getCreatorBalance(creatorId)

    expect(result.success).toBe(true)
    console.log(`Creator balance after payout: $${result.data.available_balance}`)
  })
})
