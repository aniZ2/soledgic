import { describe, it, expect, beforeAll } from 'vitest'
import { createTestClient, SoledgicTestClient } from '../test-client'

describe('Large Volume Stress Test', () => {
  let ledger: SoledgicTestClient

  beforeAll(() => {
    ledger = createTestClient('booklyverse')
  })

  it('should handle 50 transactions in rapid succession', async () => {
    const baseRef = `stress_volume_${Date.now()}`
    const startTime = Date.now()

    // Reduce to 50 for faster testing
    const promises = Array(50).fill(null).map((_, i) =>
      ledger.recordSale({
        referenceId: `${baseRef}_${i}`,
        creatorId: `creator_volume_${i % 5}`,
        amount: 1000 + (i * 10),
        description: `Volume test transaction ${i}`,
      }).catch(err => ({ error: err.message, index: i }))
    )

    const results = await Promise.all(promises)
    const elapsed = Date.now() - startTime

    const successes = results.filter((r: any) => r.success)
    const failures = results.filter((r: any) => r.error)

    console.log(`50 transactions completed in ${elapsed}ms`)
    console.log(`Successes: ${successes.length}, Failures: ${failures.length}`)

    // At least 50% should succeed
    expect(successes.length).toBeGreaterThanOrEqual(25)
    expect(elapsed).toBeLessThan(120000) // 2 minutes max
  }, 180000)

  it('should retrieve trial balance after volume test', async () => {
    const trialBalance = await ledger.getTrialBalance()
    
    expect(trialBalance.success).toBe(true)
    expect(trialBalance.report).toBeDefined()
    
    console.log('Trial balance totals:', JSON.stringify(trialBalance.report.totals, null, 2))
  })

  it('should handle concurrent balance queries', async () => {
    const promises = Array(10).fill(null).map(() =>
      ledger.getBalances().catch(err => ({ error: err.message }))
    )

    const results = await Promise.all(promises)
    const successes = results.filter((r: any) => r.success)

    // Most should succeed
    expect(successes.length).toBeGreaterThanOrEqual(5)
  })
})

describe('Rate Limiting Behavior', () => {
  let ledger: SoledgicTestClient

  beforeAll(() => {
    ledger = createTestClient('booklyverse')
  })

  it('should handle high request volume', async () => {
    const baseRef = `stress_ratelimit_${Date.now()}`
    
    // Fire 100 requests
    const promises = Array(100).fill(null).map((_, i) =>
      ledger.recordSale({
        referenceId: `${baseRef}_${i}`,
        creatorId: 'creator_ratelimit_test',
        amount: 100,
      }).catch(err => ({ 
        error: err.message, 
        status: err.status,
        rateLimited: err.status === 429 
      }))
    )

    const results = await Promise.all(promises)
    
    const successes = results.filter((r: any) => r.success)
    const rateLimited = results.filter((r: any) => r.rateLimited)
    const otherErrors = results.filter((r: any) => r.error && !r.rateLimited)

    console.log(`Successes: ${successes.length}`)
    console.log(`Rate limited: ${rateLimited.length}`)
    console.log(`Other errors: ${otherErrors.length}`)

    // At least some should succeed
    expect(successes.length).toBeGreaterThan(0)
  }, 120000)
})

describe('Report Generation', () => {
  let ledger: SoledgicTestClient

  beforeAll(() => {
    ledger = createTestClient('booklyverse')
  })

  it('should generate P&L report', async () => {
    const startTime = Date.now()
    
    const report = await ledger.getProfitLoss('2024-01-01', '2024-12-31')
    
    const elapsed = Date.now() - startTime
    
    expect(report.success).toBe(true)
    expect(report.report).toBeDefined()
    
    console.log(`P&L report generated in ${elapsed}ms`)
    console.log(`Revenue: ${report.report.revenue?.total || 0}`)
    console.log(`Expenses: ${report.report.expenses?.total || 0}`)
    
    expect(elapsed).toBeLessThan(30000)
  })

  it('should handle multiple report requests', async () => {
    const promises = [
      ledger.getTrialBalance(),
      ledger.getProfitLoss('2024-01-01', '2024-12-31'),
      ledger.getBalances(),
    ]

    const results = await Promise.all(promises)
    
    // All should succeed
    const allSuccess = results.every(r => r.success)
    expect(allSuccess).toBe(true)
  })
})
