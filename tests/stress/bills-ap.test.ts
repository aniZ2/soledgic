import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

/**
 * ACCOUNTS PAYABLE STRESS TESTS
 * 
 * Tests bill recording, payment, and AP aging edge cases:
 * - Bill creation and payment
 * - Partial bill payments
 * - AP aging accuracy
 * - Balance sheet consistency
 * - Concurrent operations
 */

describe('Bill Recording & Payment', () => {
  let client: SoledgicTestClient

  beforeAll(() => {
    client = createTestClient('booklyverse')
  })

  it('should record a bill (unpaid expense)', async () => {
    const result = await client.request('record-bill', {
      amount: 50000, // $500 in cents
      description: 'AWS monthly hosting',
      vendor_name: 'Amazon Web Services',
      vendor_id: 'vendor_aws',
      expense_category: 'utilities', // Maps to IRS category
      due_date: '2025-02-15',
      paid: false,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(500) // Returned in dollars

    console.log(`Recorded bill: $500 to AWS, status: pending`)
  })

  it('should record a paid bill (immediate expense)', async () => {
    const result = await client.request('record-bill', {
      amount: 10000, // $100
      description: 'Office supplies',
      vendor_name: 'Staples',
      expense_category: 'office_expense',
      paid: true,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('paid')

    console.log(`Recorded paid bill: $100 to Staples`)
  })

  it('should pay an existing bill', async () => {
    // First create unpaid bill
    const bill = await client.request('record-bill', {
      amount: 25000, // $250
      description: 'Software subscription',
      vendor_name: 'Notion',
      paid: false,
    })

    // Now pay it
    const payment = await client.request('pay-bill', {
      bill_transaction_id: bill.transaction_id,
      amount: 25000,
      payment_method: 'credit_card',
      reference_id: 'CC-TXN-12345',
    })

    expect(payment.success).toBe(true)
    expect(payment.amount).toBe(250)

    console.log(`Paid bill: $250 to Notion`)
  })

  it('should record partial bill payment', async () => {
    // Create large bill
    const bill = await client.request('record-bill', {
      amount: 100000, // $1000
      description: 'Quarterly contractor payment',
      vendor_name: 'Freelance Dev',
      vendor_id: 'vendor_contractor_001',
      paid: false,
    })

    // Pay $400
    const payment1 = await client.request('pay-bill', {
      bill_transaction_id: bill.transaction_id,
      amount: 40000,
      payment_method: 'bank_transfer',
    })

    expect(payment1.success).toBe(true)

    // Pay remaining $600
    const payment2 = await client.request('pay-bill', {
      amount: 60000,
      vendor_name: 'Freelance Dev',
      payment_method: 'bank_transfer',
    })

    expect(payment2.success).toBe(true)

    console.log(`Partial payments completed for contractor`)
  })
})


describe('AP Aging Report', () => {
  let client: SoledgicTestClient

  beforeAll(() => {
    client = createTestClient('booklyverse')
  })

  it('should generate AP aging report', async () => {
    const aging = await client.requestGet('ap-aging')

    expect(aging.success).toBe(true)
    expect(aging.summary).toBeDefined()
    expect(aging.aging_buckets).toBeDefined()
    expect(aging.aging_buckets.length).toBe(4)

    console.log('AP Aging Summary:')
    console.log(`  Total payables: $${aging.summary.total_payables}`)
    console.log(`  Total current: $${aging.summary.total_current}`)
    console.log(`  Total overdue: $${aging.summary.total_overdue}`)
    console.log(`  Cash needed (30 days): $${aging.summary.cash_needed_30_days}`)
  })

  it('should show top vendors', async () => {
    const aging = await client.requestGet('ap-aging')

    if (aging.top_vendors?.length > 0) {
      console.log('Top vendors by amount owed:')
      aging.top_vendors.forEach((v: any) => {
        console.log(`  ${v.vendor_name}: $${v.total_owed} (${v.bill_count} bills)`)
      })
    }

    // Each vendor should have valid data
    aging.top_vendors?.forEach((v: any) => {
      expect(v.vendor_name).toBeDefined()
      expect(v.total_owed).toBeGreaterThanOrEqual(0)
    })
  })

  it('should show upcoming due bills', async () => {
    const aging = await client.requestGet('ap-aging')

    if (aging.upcoming_due?.length > 0) {
      console.log('Upcoming due:')
      aging.upcoming_due.forEach((b: any) => {
        console.log(`  $${b.amount} to ${b.vendor_name} - due in ${b.days_until_due} days`)
      })
    }
  })
})


describe('Bills & Balance Sheet Consistency', () => {
  let client: SoledgicTestClient

  beforeAll(async () => {
    client = createTestClient('booklyverse')
    // Clean up to ensure balance sheet consistency checks are isolated
    try {
      await client.cleanupTestData()
    } catch (e) {
      console.log('Cleanup skipped:', (e as Error).message)
    }
  })

  it('should show AP in current liabilities', async () => {
    const bs = await client.requestGet('balance-sheet')

    expect(bs.success).toBe(true)
    expect(bs.balance_check.is_balanced).toBe(true)

    const apAccount = bs.liabilities.current_liabilities.accounts.find(
      (a: any) => a.account_type === 'accounts_payable'
    )

    if (apAccount) {
      console.log(`AP on balance sheet: $${apAccount.balance}`)
      expect(apAccount.balance).toBeGreaterThanOrEqual(0)
    }
  })

  it('should maintain balance after bill operations', async () => {
    // Get before
    const before = await client.requestGet('balance-sheet')
    expect(before.balance_check.is_balanced).toBe(true)

    // Record a bill
    await client.request('record-bill', {
      amount: 10000,
      description: 'Balance test bill',
      vendor_name: 'Test Vendor',
      paid: false,
    })

    // Get after
    const after = await client.requestGet('balance-sheet')
    expect(after.balance_check.is_balanced).toBe(true)

    // Liabilities should have increased
    expect(after.liabilities.total_liabilities).toBeGreaterThanOrEqual(
      before.liabilities.total_liabilities
    )

    console.log(`Liabilities before: $${before.liabilities.total_liabilities}`)
    console.log(`Liabilities after: $${after.liabilities.total_liabilities}`)
  })
})


describe('Expense Categories & Tax Integration', () => {
  let client: SoledgicTestClient

  beforeAll(() => {
    client = createTestClient('booklyverse')
  })

  it('should record bills with IRS categories', async () => {
    const categories = [
      { code: 'advertising', description: 'Facebook Ads' },
      { code: 'office_expense', description: 'Desk supplies' },
      { code: 'professional_fees', description: 'Legal consultation' },
      { code: 'utilities', description: 'Internet service' },
      { code: 'rent', description: 'Co-working space' },
    ]

    for (const cat of categories) {
      const result = await client.request('record-bill', {
        amount: 10000 + Math.floor(Math.random() * 10000),
        description: cat.description,
        vendor_name: `Vendor for ${cat.code}`,
        expense_category: cat.code,
        paid: true,
      })

      expect(result.success).toBe(true)
    }

    console.log(`Recorded ${categories.length} bills with IRS categories`)
  })

  it('should reflect categorized expenses in P&L', async () => {
    const pl = await client.request('profit-loss', {})

    expect(pl.success).toBe(true)
    expect(pl.expenses?.by_category).toBeDefined()

    console.log('Expenses by category:')
    pl.expenses?.by_category?.forEach((cat: any) => {
      console.log(`  ${cat.name}: $${cat.amount} (${cat.transaction_count} transactions)`)
    })
  })
})


describe('Concurrent Bill Operations', () => {
  let client: SoledgicTestClient

  beforeAll(() => {
    client = createTestClient('booklyverse')
  })

  it('should handle concurrent bill creation', async () => {
    const promises = Array(10).fill(null).map((_, i) =>
      client.request('record-bill', {
        amount: 1000 + i * 100,
        description: `Concurrent bill ${i}`,
        vendor_name: `Vendor ${i}`,
        paid: false,
      }).catch(err => ({ error: err.message }))
    )

    const results = await Promise.all(promises)
    const successes = results.filter((r: any) => r.success)
    const failures = results.filter((r: any) => r.error)

    console.log(`Concurrent bills: ${successes.length} succeeded, ${failures.length} failed`)

    expect(successes.length).toBeGreaterThanOrEqual(8) // Most should succeed
  })

  it('should handle concurrent payments', async () => {
    // Create bills first
    const bills = await Promise.all(
      Array(5).fill(null).map((_, i) =>
        client.request('record-bill', {
          amount: 5000,
          description: `Concurrent payment test ${i}`,
          vendor_name: `Payment Test Vendor ${i}`,
          paid: false,
        })
      )
    )

    // Pay all concurrently
    const payments = await Promise.all(
      bills.map(bill =>
        client.request('pay-bill', {
          bill_transaction_id: bill.transaction_id,
          amount: 5000,
        }).catch(err => ({ error: err.message }))
      )
    )

    const successes = payments.filter((p: any) => p.success)
    console.log(`Concurrent payments: ${successes.length}/5 succeeded`)

    expect(successes.length).toBe(5) // All should succeed
  })
})
