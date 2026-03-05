import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

describe('Delete Creator E2E', () => {
  let ledger: SoledgicTestClient
  const ts = Date.now()

  // Creators used across tests
  const freshCreatorId = `e2e_del_fresh_${ts}`
  const creatorWithTxId = `e2e_del_withtx_${ts}`
  const saleBlockedCreatorId = `e2e_del_saleblock_${ts}`
  const checkoutBlockedCreatorId = `e2e_del_coblock_${ts}`

  beforeAll(async () => {
    ledger = createTestClient('booklyverse')

    // Create all test creators in parallel
    await Promise.all([
      ledger.createCreator({ creatorId: freshCreatorId, displayName: 'Fresh Creator' }),
      ledger.createCreator({ creatorId: creatorWithTxId, displayName: 'Creator With TX' }),
      ledger.createCreator({ creatorId: saleBlockedCreatorId, displayName: 'Sale Blocked Creator' }),
      ledger.createCreator({ creatorId: checkoutBlockedCreatorId, displayName: 'Checkout Blocked Creator' }),
    ])

    // Give two creators a transaction so they can't be deleted
    await ledger.recordSale({
      referenceId: `e2e_del_sale_withtx_${ts}`,
      creatorId: creatorWithTxId,
      amount: 1000,
    })
  })

  // ========================================================================
  // Happy path: delete a creator with zero entries
  // ========================================================================

  it('should delete a creator with no transactions', async () => {
    const result = await ledger.deleteCreator(freshCreatorId)

    expect(result.success).toBe(true)
    expect(result.message).toBe('Creator deleted successfully')
    expect(result.deleted_at).toBeDefined()
  })

  it('should return 404 when deleting an already-deleted creator', async () => {
    try {
      await ledger.deleteCreator(freshCreatorId)
      expect.unreachable('should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  // ========================================================================
  // 409: cannot delete creator with existing transactions
  // ========================================================================

  it('should return 409 when deleting a creator with transactions', async () => {
    try {
      await ledger.deleteCreator(creatorWithTxId)
      expect.unreachable('should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(409)
      expect(err.message).toContain('existing transactions')
    }
  })

  // ========================================================================
  // 410/error: record-sale blocked for deleted creator
  // ========================================================================

  it('should block sales to a deleted creator', async () => {
    // Delete the creator first
    await ledger.deleteCreator(saleBlockedCreatorId)

    // Attempt a sale — should fail because record_sale_atomic rejects inactive creators
    try {
      await ledger.recordSale({
        referenceId: `e2e_del_sale_blocked_${ts}`,
        creatorId: saleBlockedCreatorId,
        amount: 2000,
      })
      expect.unreachable('should have thrown')
    } catch (err: any) {
      // record_sale_atomic raises a PL/pgSQL exception which the Edge Function
      // catches and returns as a 500 with a generic error message
      expect(err.status).toBeGreaterThanOrEqual(400)
    }
  })

  // ========================================================================
  // 410: create-checkout blocked for deleted creator
  // ========================================================================

  it('should block checkout creation for a deleted creator', async () => {
    // Delete the creator first
    await ledger.deleteCreator(checkoutBlockedCreatorId)

    // Attempt a checkout session — should fail with 410
    try {
      const result = await ledger.request('create-checkout', {
        creator_id: checkoutBlockedCreatorId,
        amount: 3000,
        success_url: 'https://example.com/success',
      })
      // If the request didn't throw, check the response for error indicators
      expect(result.success).not.toBe(true)
    } catch (err: any) {
      expect(err.status).toBe(410)
      expect(err.message).toContain('deleted')
    }
  })

  // ========================================================================
  // Validation: bad input
  // ========================================================================

  it('should return 400 for missing creator_id', async () => {
    try {
      await ledger.request('delete-creator', {})
      expect.unreachable('should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(400)
    }
  })

  it('should return 404 for non-existent creator', async () => {
    try {
      await ledger.deleteCreator(`nonexistent_${ts}`)
      expect.unreachable('should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })
})
