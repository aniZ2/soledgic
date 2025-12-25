# Soledgic Stress Test Suite

## Overview

This document defines failure scenarios and stress tests to validate Soledgic's resilience. Each scenario includes the failure condition, expected behavior, test procedure, and acceptance criteria.

---

## 1. Bank Feed Mismatches

### Scenario 1.1: Amount Mismatch

**Condition:** Bank transaction amount doesn't match any ledger transaction.

**Expected Behavior:**
- Transaction remains unmatched
- Warning surfaced in reconciliation UI
- No automatic matching occurs
- User can manually investigate and either:
  - Find the correct match
  - Create an adjusting entry
  - Flag as bank error

**Test Procedure:**

```javascript
// test/stress/bank-feed-mismatch.test.js

describe('Bank Feed Amount Mismatch', () => {
  it('should not auto-match transactions with amount differences', async () => {
    // Create ledger transaction
    const sale = await ledger.recordSale({
      referenceId: 'test_mismatch_001',
      creatorId: 'creator_test',
      amount: 10000, // $100.00
    })

    // Simulate bank feed with different amount
    const bankTx = {
      id: 'bank_001',
      amount: 9950, // $99.50 (bank may have deducted fee)
      description: 'STRIPE TRANSFER',
      date: new Date().toISOString(),
    }

    // Attempt auto-match
    const result = await ledger.reconcile({
      action: 'auto_match',
      bankTransactions: [bankTx]
    })

    // Should not match
    expect(result.matched).toHaveLength(0)
    expect(result.unmatched.ledger).toContain(sale.transactionId)
    expect(result.unmatched.bank).toContain(bankTx.id)
    expect(result.warnings).toContain('Amount mismatch: $100.00 vs $99.50')
  })

  it('should allow manual matching with amount difference and note', async () => {
    const result = await ledger.reconcile({
      action: 'match',
      transactionId: sale.transactionId,
      bankTransactionId: 'bank_001',
      allowAmountDifference: true,
      differenceReason: 'Bank processing fee deducted',
    })

    expect(result.success).toBe(true)
    expect(result.match.hasAmountDifference).toBe(true)
    expect(result.match.differenceAmount).toBe(-50) // $0.50 difference
  })
})
```

### Scenario 1.2: Duplicate Bank Entries

**Condition:** Same bank transaction appears twice in feed.

**Expected Behavior:**
- Detect duplicate by bank transaction ID
- Warn user
- Prevent double-matching
- Log for investigation

**Test Procedure:**

```javascript
describe('Duplicate Bank Entries', () => {
  it('should detect and reject duplicate bank transactions', async () => {
    const bankTx = {
      id: 'bank_duplicate_001',
      amount: 5000,
      description: 'PAYMENT',
      date: new Date().toISOString(),
    }

    // First import succeeds
    const result1 = await ledger.importBankFeed([bankTx])
    expect(result1.imported).toBe(1)

    // Second import of same transaction
    const result2 = await ledger.importBankFeed([bankTx])
    expect(result2.imported).toBe(0)
    expect(result2.duplicates).toBe(1)
    expect(result2.warnings).toContain('Duplicate bank transaction: bank_duplicate_001')
  })
})
```

### Scenario 1.3: Missing Bank Entries

**Condition:** Ledger shows transactions that never appear in bank feed.

**Expected Behavior:**
- Flag as "unreconciled" indefinitely
- Surface in reconciliation report
- Block period close until addressed
- User can mark as "expected missing" with reason

**Test Procedure:**

```javascript
describe('Missing Bank Entries', () => {
  it('should flag unreconciled transactions when closing period', async () => {
    // Create sales
    await ledger.recordSale({ referenceId: 'has_bank_match', ... })
    await ledger.recordSale({ referenceId: 'no_bank_match', ... })

    // Import partial bank feed (missing one)
    await ledger.importBankFeed([
      { id: 'bank_1', amount: ..., ... }
      // Missing entry for 'no_bank_match'
    ])

    // Auto-match what we can
    await ledger.reconcile({ action: 'auto_match' })

    // Attempt to close period
    const closeResult = await ledger.closePeriod(2024, 12)

    expect(closeResult.success).toBe(false)
    expect(closeResult.error).toBe('UNRECONCILED_TRANSACTIONS')
    expect(closeResult.unreconciledCount).toBe(1)
    expect(closeResult.unreconciledIds).toContain('no_bank_match_tx_id')
  })

  it('should allow marking transaction as expected missing', async () => {
    await ledger.reconcile({
      action: 'mark_expected_missing',
      transactionId: 'no_bank_match_tx_id',
      reason: 'Cash payment - no bank deposit',
    })

    // Now close should succeed
    const closeResult = await ledger.closePeriod(2024, 12)
    expect(closeResult.success).toBe(true)
  })
})
```

---

## 2. Partial Imports

### Scenario 2.1: Import Interrupted Mid-Batch

**Condition:** Network failure during bulk import of historical data.

**Expected Behavior:**
- Atomic batches - all or nothing per batch
- Resume capability from last successful batch
- Clear reporting of what was imported vs pending
- No duplicate entries on retry

**Test Procedure:**

```javascript
describe('Import Interruption Recovery', () => {
  it('should handle interrupted import and resume', async () => {
    const historicalSales = generateTestSales(1000) // 1000 sales to import
    const batchSize = 100

    // Simulate interruption at batch 5
    let importedCount = 0
    for (let i = 0; i < 10; i++) {
      const batch = historicalSales.slice(i * batchSize, (i + 1) * batchSize)
      
      if (i === 5) {
        // Simulate network failure
        throw new Error('Network timeout')
      }

      const result = await ledger.bulkImport(batch, {
        batchId: `import_${Date.now()}_batch_${i}`,
        idempotencyKey: batch.map(s => s.referenceId).join(','),
      })
      
      importedCount += result.imported
    }

    // Verify partial import state
    const status = await ledger.getImportStatus(`import_${Date.now()}`)
    expect(status.completedBatches).toBe(5)
    expect(status.pendingBatches).toBe(5)
    expect(status.importedCount).toBe(500)

    // Resume import
    const resumeResult = await ledger.resumeImport(`import_${Date.now()}`)
    
    // Should only import remaining 500, not duplicates
    expect(resumeResult.imported).toBe(500)
    expect(resumeResult.duplicatesSkipped).toBe(0)

    // Total should be 1000
    const finalStatus = await ledger.getImportStatus(`import_${Date.now()}`)
    expect(finalStatus.importedCount).toBe(1000)
  })
})
```

### Scenario 2.2: Invalid Records in Batch

**Condition:** Some records in import batch have invalid data.

**Expected Behavior:**
- Valid records import successfully
- Invalid records logged with specific error
- Clear report of success vs failure
- No partial transactions (all entries or none)

**Test Procedure:**

```javascript
describe('Invalid Records in Import', () => {
  it('should import valid records and report invalid ones', async () => {
    const mixedBatch = [
      { referenceId: 'valid_001', creatorId: 'creator_1', amount: 1000 },
      { referenceId: 'invalid_negative', creatorId: 'creator_1', amount: -500 }, // Invalid
      { referenceId: 'valid_002', creatorId: 'creator_1', amount: 2000 },
      { referenceId: 'invalid_missing_creator', amount: 1500 }, // Invalid
      { referenceId: 'valid_003', creatorId: 'creator_1', amount: 3000 },
    ]

    const result = await ledger.bulkImport(mixedBatch)

    expect(result.imported).toBe(3)
    expect(result.failed).toBe(2)
    expect(result.errors).toEqual([
      { referenceId: 'invalid_negative', error: 'Amount must be positive' },
      { referenceId: 'invalid_missing_creator', error: 'creatorId is required' },
    ])

    // Verify only valid records exist
    const transactions = await ledger.getTransactions()
    expect(transactions.map(t => t.referenceId)).toEqual([
      'valid_001', 'valid_002', 'valid_003'
    ])
  })
})
```

### Scenario 2.3: Reference ID Collision

**Condition:** Import contains duplicate reference IDs.

**Expected Behavior:**
- First occurrence imports
- Subsequent occurrences rejected as duplicates
- Clear reporting
- Idempotent - re-running same import is safe

**Test Procedure:**

```javascript
describe('Reference ID Collision', () => {
  it('should reject duplicate reference IDs', async () => {
    const batch = [
      { referenceId: 'dupe_001', creatorId: 'creator_1', amount: 1000 },
      { referenceId: 'dupe_001', creatorId: 'creator_1', amount: 2000 }, // Duplicate
      { referenceId: 'unique_001', creatorId: 'creator_1', amount: 3000 },
    ]

    const result = await ledger.bulkImport(batch)

    expect(result.imported).toBe(2)
    expect(result.duplicates).toBe(1)
    expect(result.duplicateIds).toContain('dupe_001')

    // First occurrence should have the original amount
    const tx = await ledger.getTransaction('dupe_001')
    expect(tx.amount).toBe(1000) // First one wins
  })

  it('should be idempotent on re-import', async () => {
    const batch = [
      { referenceId: 'idempotent_001', creatorId: 'creator_1', amount: 1000 },
    ]

    // Import twice
    const result1 = await ledger.bulkImport(batch)
    const result2 = await ledger.bulkImport(batch)

    expect(result1.imported).toBe(1)
    expect(result2.imported).toBe(0)
    expect(result2.duplicates).toBe(1)

    // Only one transaction exists
    const count = await ledger.getTransactionCount()
    expect(count).toBe(1)
  })
})
```

---

## 3. Corrupted Snapshots

### Scenario 3.1: Integrity Hash Mismatch

**Condition:** Frozen statement hash doesn't match data (tampering detected).

**Expected Behavior:**
- Verification fails with clear error
- Statement flagged as potentially tampered
- Alert generated to administrators
- Original data preserved for forensics
- Block any dependent operations

**Test Procedure:**

```javascript
describe('Integrity Hash Mismatch', () => {
  it('should detect tampering in frozen statement', async () => {
    // Close a period (creates frozen statements)
    await ledger.closePeriod(2024, 10)

    // Directly modify statement data in database (simulating tampering)
    await supabase
      .from('frozen_statements')
      .update({ 
        statement_data: { ...originalData, net_income: 999999 } 
      })
      .eq('period_id', periodId)
      .eq('statement_type', 'profit_loss')

    // Verify should fail
    const verification = await ledger.verifyFrozenStatements(periodId)

    expect(verification.valid).toBe(false)
    expect(verification.statements.profit_loss.valid).toBe(false)
    expect(verification.statements.profit_loss.error).toBe('INTEGRITY_HASH_MISMATCH')
    expect(verification.statements.profit_loss.expectedHash).not.toEqual(
      verification.statements.profit_loss.computedHash
    )
  })

  it('should block operations dependent on tampered statement', async () => {
    // Try to generate PDF from tampered statement
    const pdfResult = await ledger.generatePDF({
      reportType: 'profit_loss',
      periodId: tamperedPeriodId,
    })

    expect(pdfResult.success).toBe(false)
    expect(pdfResult.error).toBe('INTEGRITY_VERIFICATION_FAILED')
    expect(pdfResult.message).toContain('Statement data has been modified')
  })

  it('should log tampering detection', async () => {
    // Check audit log
    const logs = await supabase
      .from('audit_log')
      .select('*')
      .eq('action', 'integrity_verification_failed')
      .eq('entity_id', periodId)

    expect(logs.data).toHaveLength(1)
    expect(logs.data[0].details.statement_type).toBe('profit_loss')
  })
})
```

### Scenario 3.2: Missing Snapshot

**Condition:** Frozen statement record missing (deleted or never created).

**Expected Behavior:**
- Detection of missing statement
- Attempt regeneration from transaction data
- Log anomaly
- Alert if regeneration differs from expected

**Test Procedure:**

```javascript
describe('Missing Snapshot', () => {
  it('should detect missing frozen statement', async () => {
    // Close period
    await ledger.closePeriod(2024, 11)

    // Delete statement (simulating data loss)
    await supabase
      .from('frozen_statements')
      .delete()
      .eq('period_id', periodId)
      .eq('statement_type', 'trial_balance')

    // List frozen statements
    const statements = await ledger.listFrozenStatements(periodId)

    expect(statements.available).toEqual(['profit_loss', 'balance_sheet'])
    expect(statements.missing).toEqual(['trial_balance'])
    expect(statements.warnings).toContain('trial_balance statement missing')
  })

  it('should regenerate missing statement with warning', async () => {
    const result = await ledger.regenerateFrozenStatement(periodId, 'trial_balance')

    expect(result.success).toBe(true)
    expect(result.regenerated).toBe(true)
    expect(result.warning).toContain('Statement regenerated from transaction data')
    expect(result.originalHashKnown).toBe(false)
  })
})
```

### Scenario 3.3: Corrupted Trial Balance (Unbalanced)

**Condition:** Trial balance snapshot shows debits ≠ credits.

**Expected Behavior:**
- Fail verification immediately
- This should be impossible if system is working correctly
- Indicates serious bug - escalate immediately
- Block all financial operations until resolved

**Test Procedure:**

```javascript
describe('Corrupted Trial Balance', () => {
  it('should detect unbalanced trial balance in snapshot', async () => {
    // Manually corrupt (this should never happen naturally)
    await supabase
      .from('accounting_periods')
      .update({
        closing_trial_balance: {
          accounts: [...],
          totals: { debits: 10000, credits: 9500, balanced: false }
        }
      })
      .eq('id', periodId)

    // Any operation should fail
    const result = await ledger.getBalances()

    expect(result.success).toBe(false)
    expect(result.error).toBe('CRITICAL_INTEGRITY_ERROR')
    expect(result.message).toContain('Trial balance is unbalanced')

    // Check alert was generated
    const alerts = await getSystemAlerts()
    expect(alerts).toContainEqual({
      severity: 'critical',
      type: 'unbalanced_trial_balance',
      ledgerId: ledger.id,
      periodId: periodId,
    })
  })
})
```

---

## 4. Concurrency Failures

### Scenario 4.1: Simultaneous Period Close

**Condition:** Two requests attempt to close the same period simultaneously.

**Expected Behavior:**
- One succeeds, one fails
- No partial state
- Idempotent - second request recognizes already closed

**Test Procedure:**

```javascript
describe('Simultaneous Period Close', () => {
  it('should handle concurrent close requests', async () => {
    // Fire two close requests simultaneously
    const [result1, result2] = await Promise.all([
      ledger.closePeriod(2024, 12),
      ledger.closePeriod(2024, 12),
    ])

    // Exactly one should succeed
    const successes = [result1, result2].filter(r => r.success)
    const failures = [result1, result2].filter(r => !r.success)

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0].error).toBe('PERIOD_ALREADY_CLOSING')

    // Period should be closed exactly once
    const period = await ledger.getPeriod(2024, 12)
    expect(period.status).toBe('closed')
  })
})
```

### Scenario 4.2: Transaction During Period Close

**Condition:** New transaction submitted while period is being closed.

**Expected Behavior:**
- Transaction either succeeds (before close) or fails (after close)
- No transactions in "limbo" state
- Clear error message if period just closed

**Test Procedure:**

```javascript
describe('Transaction During Period Close', () => {
  it('should handle transaction during close window', async () => {
    // Start closing period (but don't await)
    const closePromise = ledger.closePeriod(2024, 12)

    // Immediately try to record transaction
    const salePromise = ledger.recordSale({
      referenceId: 'during_close',
      creatorId: 'creator_1',
      amount: 1000,
      transactionDate: '2024-12-31', // In the closing period
    })

    const [closeResult, saleResult] = await Promise.all([closePromise, salePromise])

    // One of these scenarios:
    if (saleResult.success) {
      // Transaction made it in before close
      expect(closeResult.transactionCount).toBeGreaterThan(0)
    } else {
      // Transaction blocked by close
      expect(saleResult.error).toMatch(/PERIOD_CLOSING|PERIOD_LOCKED/)
    }

    // Either way, system is consistent
    const balance = await ledger.getTrialBalance()
    expect(balance.totals.balanced).toBe(true)
  })
})
```

### Scenario 4.3: Duplicate Payout Request

**Condition:** Same payout requested twice (network retry, user double-click).

**Expected Behavior:**
- First request processes
- Second request returns same result (idempotent)
- Creator paid exactly once
- Both requests return same payout ID

**Test Procedure:**

```javascript
describe('Duplicate Payout Request', () => {
  it('should handle duplicate payout requests idempotently', async () => {
    // Ensure creator has balance
    await ledger.recordSale({
      referenceId: 'for_payout',
      creatorId: 'creator_1',
      amount: 10000,
    })

    const payoutRef = `payout_${Date.now()}`

    // Fire two payout requests simultaneously
    const [result1, result2] = await Promise.all([
      ledger.processPayout({ creatorId: 'creator_1', referenceId: payoutRef }),
      ledger.processPayout({ creatorId: 'creator_1', referenceId: payoutRef }),
    ])

    // Both should "succeed" (second is idempotent)
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)

    // Same payout ID
    expect(result1.payoutId).toEqual(result2.payoutId)

    // Only one payout transaction exists
    const payouts = await ledger.getTransactions({ type: 'payout', creatorId: 'creator_1' })
    expect(payouts).toHaveLength(1)
  })
})
```

---

## 5. Resource Exhaustion

### Scenario 5.1: Rate Limit Exceeded

**Condition:** API requests exceed rate limit.

**Expected Behavior:**
- 429 response with Retry-After header
- Request queue doesn't grow unbounded
- Other tenants unaffected
- Metrics logged for analysis

**Test Procedure:**

```javascript
describe('Rate Limit Handling', () => {
  it('should return 429 when rate limited', async () => {
    const requests = Array(200).fill().map((_, i) => 
      ledger.recordSale({
        referenceId: `rate_limit_test_${i}`,
        creatorId: 'creator_1',
        amount: 100,
      })
    )

    const results = await Promise.allSettled(requests)

    // Some should succeed, some should be rate limited
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success)
    const rateLimited = results.filter(r => 
      r.status === 'rejected' || 
      (r.status === 'fulfilled' && r.value.error === 'Rate limit exceeded')
    )

    expect(succeeded.length).toBeGreaterThan(0)
    expect(succeeded.length).toBeLessThan(200)
    expect(rateLimited.length).toBeGreaterThan(0)

    // Rate limited responses should have retry info
    const limitedResponse = rateLimited[0]
    expect(limitedResponse.retryAfter).toBeDefined()
  })

  it('should not affect other tenants', async () => {
    // While tenant A is rate limited
    const tenantA = new Soledgic('sk_test_tenant_a')
    const tenantB = new Soledgic('sk_test_tenant_b')

    // Exhaust tenant A's rate limit
    await Promise.all(Array(200).fill().map(() => 
      tenantA.recordSale({ ... }).catch(() => {})
    ))

    // Tenant B should still work
    const result = await tenantB.recordSale({
      referenceId: 'tenant_b_works',
      creatorId: 'creator_1',
      amount: 1000,
    })

    expect(result.success).toBe(true)
  })
})
```

### Scenario 5.2: Large Transaction Volume

**Condition:** Very large number of transactions in single period.

**Expected Behavior:**
- System continues functioning (may slow down)
- Trial balance computes correctly
- Period close completes (may take longer)
- No memory exhaustion

**Test Procedure:**

```javascript
describe('Large Transaction Volume', () => {
  it('should handle 100k transactions in period', async () => {
    const startTime = Date.now()

    // Create 100k transactions in batches
    for (let batch = 0; batch < 1000; batch++) {
      const transactions = Array(100).fill().map((_, i) => ({
        referenceId: `volume_test_${batch}_${i}`,
        creatorId: `creator_${i % 10}`,
        amount: 1000 + (i * 10),
      }))

      await ledger.bulkImport(transactions)

      // Progress logging
      if (batch % 100 === 0) {
        console.log(`Imported ${(batch + 1) * 100} transactions`)
      }
    }

    const importTime = Date.now() - startTime
    console.log(`Import took ${importTime}ms`)

    // Trial balance should still compute
    const balanceStart = Date.now()
    const balance = await ledger.getTrialBalance()
    const balanceTime = Date.now() - balanceStart

    expect(balance.totals.balanced).toBe(true)
    console.log(`Trial balance computed in ${balanceTime}ms`)

    // Period close should complete
    const closeStart = Date.now()
    const closeResult = await ledger.closePeriod(2024, 12)
    const closeTime = Date.now() - closeStart

    expect(closeResult.success).toBe(true)
    expect(closeResult.transactionCount).toBe(100000)
    console.log(`Period close took ${closeTime}ms`)

    // Performance assertions
    expect(balanceTime).toBeLessThan(30000) // < 30 seconds
    expect(closeTime).toBeLessThan(60000) // < 60 seconds
  }, 300000) // 5 minute timeout
})
```

---

## 6. Edge Cases

### Scenario 6.1: Zero-Amount Transaction

**Expected Behavior:** Reject with clear error.

```javascript
it('should reject zero-amount transaction', async () => {
  const result = await ledger.recordSale({
    referenceId: 'zero_amount',
    creatorId: 'creator_1',
    amount: 0,
  })

  expect(result.success).toBe(false)
  expect(result.error).toBe('Amount must be greater than zero')
})
```

### Scenario 6.2: Negative Amount

**Expected Behavior:** Reject (use refund flow instead).

```javascript
it('should reject negative amount', async () => {
  const result = await ledger.recordSale({
    referenceId: 'negative',
    creatorId: 'creator_1',
    amount: -1000,
  })

  expect(result.success).toBe(false)
  expect(result.error).toBe('Amount must be positive. Use refund flow for returns.')
})
```

### Scenario 6.3: Payout Exceeds Balance

**Expected Behavior:** Reject with balance info.

```javascript
it('should reject payout exceeding balance', async () => {
  // Creator with $50 balance
  const result = await ledger.processPayout({
    creatorId: 'creator_with_50_balance',
    amount: 10000, // $100
  })

  expect(result.success).toBe(false)
  expect(result.error).toBe('INSUFFICIENT_BALANCE')
  expect(result.available).toBe(5000)
  expect(result.requested).toBe(10000)
})
```

### Scenario 6.4: Backdate Beyond Policy

**Expected Behavior:** Reject or require approval based on policy.

```javascript
it('should reject backdating beyond max days', async () => {
  const result = await ledger.recordSale({
    referenceId: 'ancient_sale',
    creatorId: 'creator_1',
    amount: 1000,
    transactionDate: '2023-01-01', // Over a year ago
  })

  expect(result.success).toBe(false)
  expect(result.error).toBe('BACKDATE_EXCEEDS_POLICY')
  expect(result.maxBackdateDays).toBe(30)
  expect(result.requestedDays).toBeGreaterThan(365)
})
```

---

## 7. Running the Test Suite

```bash
# Install dependencies
npm install

# Run all stress tests
npm run test:stress

# Run specific scenario
npm run test:stress -- --grep "Bank Feed"

# Run with extended timeout for volume tests
npm run test:stress -- --timeout 300000

# Generate coverage report
npm run test:stress:coverage
```

### CI/CD Integration

```yaml
# .github/workflows/stress-tests.yml
name: Stress Tests

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM
  workflow_dispatch:

jobs:
  stress-test:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run stress tests
        run: npm run test:stress
        env:
          SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.TEST_SUPABASE_KEY }}
          
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: stress-test-results
          path: test-results/
```
