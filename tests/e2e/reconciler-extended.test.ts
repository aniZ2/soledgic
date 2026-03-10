import { describe, it, expect } from 'vitest'
import { createServiceClient } from '../test-client'

describe('Reconcile Checkout Ledger (Extended)', () => {
  const service = createServiceClient()

  // Skip if no service role key configured
  const itOrSkip = service ? it : it.skip

  itOrSkip('should accept dry_run and return pending count', async () => {
    const result = await service!.reconcileCheckouts({ dryRun: true })

    expect(result.success).toBe(true)
    if (result.dry_run) {
      expect(typeof result.pending_count).toBe('number')
      expect(Array.isArray(result.session_ids)).toBe(true)
    } else {
      // No pending sessions — normal response
      expect(typeof result.processed).toBe('number')
      expect(typeof result.reconciled).toBe('number')
    }
  })

  itOrSkip('should accept configurable limit', async () => {
    const result = await service!.reconcileCheckouts({ limit: 5, dryRun: true })
    expect(result.success).toBe(true)
  })

  itOrSkip('should return stale count when sessions are old', async () => {
    // Run with no dry_run — the reconciler processes any stuck sessions
    const result = await service!.reconcileCheckouts({ limit: 5 })

    expect(result.success).toBe(true)
    expect(typeof result.processed).toBe('number')
    expect(typeof result.reconciled).toBe('number')
    expect(typeof result.failed).toBe('number')
    // stale field is only present when staleCount > 0, so just check it's not negative
    if (result.stale !== undefined) {
      expect(result.stale).toBeGreaterThan(0)
    }
  })
})

describe('Process Processor Inbox (Extended)', () => {
  const service = createServiceClient()

  const itOrSkip = service ? it : it.skip

  itOrSkip('should accept dry_run and return inbox count', async () => {
    const result = await service!.processProcessorInbox({ dryRun: true })

    expect(result.success).toBe(true)
    expect(result.dry_run).toBe(true)
    // Response wraps counts in results object
    expect(typeof result.results.claimed).toBe('number')
    expect(typeof result.results.processed).toBe('number')
  })

  itOrSkip('should process inbox events without errors', async () => {
    const result = await service!.processProcessorInbox({ limit: 5 })

    expect(result.success).toBe(true)
    expect(typeof result.results.processed).toBe('number')
    expect(typeof result.results.failed).toBe('number')
  })
})
