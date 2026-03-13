import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

describe('Provenance Report & Expense Flow E2E', () => {
  let ledger: SoledgicTestClient
  const creatorId = `e2e_prov_creator_${Date.now()}`
  const saleRef = `e2e_prov_sale_${Date.now()}`
  const expenseRef = `e2e_prov_expense_${Date.now()}`

  beforeAll(async () => {
    ledger = createTestClient()

    try {
      await ledger.createCreator({
        creatorId,
        displayName: 'E2E Provenance Creator',
        email: 'e2e-provenance@test.soledgic.com',
        defaultSplitPercent: 80,
      })
    } catch (err: any) {
      if (!err.message?.includes('duplicate') && !err.message?.includes('already exists')) {
        throw err
      }
    }

    // Record a processor-verified sale (default entry_method = 'processor')
    await ledger.recordSale({
      referenceId: saleRef,
      creatorId,
      amount: 5000,
      description: 'Provenance test sale',
    })
  })

  // =========================================================================
  // Provenance Report
  // =========================================================================

  it('should generate a provenance report with counts', async () => {
    const result = await ledger.getProvenanceReport()

    expect(result.success).toBe(true)
    expect(result.report).toBeDefined()
    expect(result.report.type).toBe('provenance')
    expect(result.report.counts).toBeDefined()
    expect(typeof result.report.counts.processor).toBe('number')
    expect(typeof result.report.counts.manual).toBe('number')
    expect(typeof result.report.counts.system).toBe('number')
  })

  it('should include health indicator in provenance report', async () => {
    const result = await ledger.getProvenanceReport()

    expect(result.report.health).toBeDefined()
    expect(['green', 'yellow', 'red']).toContain(result.report.health)
    expect(typeof result.report.manual_revenue_ratio).toBe('number')
    expect(result.report.manual_revenue_ratio).toBeGreaterThanOrEqual(0)
    expect(result.report.manual_revenue_ratio).toBeLessThanOrEqual(100)
  })

  it('should include revenue totals in provenance report', async () => {
    const result = await ledger.getProvenanceReport()

    expect(result.report.totals).toBeDefined()
    expect(typeof result.report.totals.manual_revenue).toBe('number')
    expect(typeof result.report.totals.processor_revenue).toBe('number')
  })

  it('should include manual_revenue and system_repaired arrays', async () => {
    const result = await ledger.getProvenanceReport()

    expect(Array.isArray(result.report.manual_revenue)).toBe(true)
    expect(Array.isArray(result.report.system_repaired)).toBe(true)
  })

  it('should accept date range filters', async () => {
    const today = new Date().toISOString().split('T')[0]
    const result = await ledger.getProvenanceReport(today, today)

    expect(result.success).toBe(true)
    expect(result.report.period.start).toBe(today)
    expect(result.report.period.end).toBe(today)
  })

  // =========================================================================
  // Expense Recording
  // =========================================================================

  it('should record an expense with category and vendor', async () => {
    const result = await ledger.recordExpense({
      referenceId: expenseRef,
      amount: 2500, // $25.00 in cents
      description: 'E2E test: office supplies',
      category: 'office_expense',
      vendorName: 'Staples',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
    expect(result.amount).toBe(25) // API returns dollars
    expect(result.category).toBe('office_expense')
  })

  it('should record an expense with receipt URL', async () => {
    const receiptRef = `e2e_prov_receipt_${Date.now()}`
    const result = await ledger.recordExpense({
      referenceId: receiptRef,
      amount: 1500,
      description: 'E2E test: software subscription',
      category: 'software',
      vendorName: 'Vercel',
      receiptUrl: 'https://example.com/receipt.pdf',
    })

    expect(result.success).toBe(true)
    expect(result.transaction_id).toBeDefined()
  })

  it('should reject duplicate expense reference', async () => {
    await expect(
      ledger.recordExpense({
        referenceId: expenseRef, // same as above
        amount: 2500,
        description: 'Duplicate expense',
      })
    ).rejects.toThrow()
  })

  it('should reject expense with invalid amount', async () => {
    await expect(
      ledger.recordExpense({
        referenceId: `e2e_prov_bad_${Date.now()}`,
        amount: -100,
        description: 'Negative amount',
      })
    ).rejects.toThrow()
  })

  // =========================================================================
  // Provenance after manual expense
  // =========================================================================

  it('should show manual entries in provenance after expense recording', async () => {
    const result = await ledger.getProvenanceReport()

    // Expenses are entry_method='manual', so manual count should be > 0
    expect(result.report.counts.manual).toBeGreaterThan(0)
  })
})
