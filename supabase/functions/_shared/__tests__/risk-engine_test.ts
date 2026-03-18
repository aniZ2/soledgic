import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { recordRiskSignal, checkRefundRate, checkLargeTransaction } from '../risk-engine.ts'

// ==========================================================================
// RISK ENGINE — AUTO_ACTIONS mapping and recordRiskSignal behavior
// ==========================================================================

Deno.test('risk: recordRiskSignal inserts into risk_signals table', async () => {
  let insertedRow: Record<string, unknown> = {}

  const supabase = {
    from(table: string) {
      if (table === 'risk_signals') {
        return {
          insert(row: Record<string, unknown>) {
            insertedRow = row
            return {
              select() { return this },
              single() {
                return Promise.resolve({
                  data: { id: 'signal_1' },
                  error: null,
                })
              },
              update() { return { eq() { return { then(r: any) { r({ error: null }); return { catch() {} } } } } } },
            }
          },
          update() { return { eq() { return { then(r: any) { r({ error: null }); return { catch() {} } } } } } },
        }
      }
      if (table === 'audit_log') {
        return {
          insert() { return Promise.resolve({ error: null }) },
        }
      }
      if (table === 'organizations') {
        return {
          select() { return this },
          eq() { return this },
          single() { return Promise.resolve({ data: { capabilities: {} }, error: null }) },
          update() { return { eq() { return Promise.resolve({ error: null }) } } },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc() {
      return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
    },
  } as any

  await recordRiskSignal(supabase, {
    ledgerId: 'ledger_1',
    organizationId: 'org_1',
    signalType: 'velocity_spike',
    severity: 'low',
    description: 'Test signal',
    details: { foo: 'bar' },
  })

  assertEquals(insertedRow.signal_type, 'velocity_spike')
  assertEquals(insertedRow.severity, 'low')
  assertEquals(insertedRow.description, 'Test signal')
  assertEquals(insertedRow.ledger_id, 'ledger_1')
  assertEquals(insertedRow.organization_id, 'org_1')
})

Deno.test('risk: rapid_topup_withdraw:high triggers can_payout=false auto-action', async () => {
  let rpcCalls: { key: string; value: string }[] = []

  const supabase = {
    from(table: string) {
      if (table === 'risk_signals') {
        return {
          insert() {
            return {
              select() { return this },
              single() {
                return Promise.resolve({
                  data: { id: 'signal_rtw' },
                  error: null,
                })
              },
            }
          },
          update() { return { eq() { return { then(r: any) { r({ error: null }); return { catch() {} } } } } } },
        }
      }
      if (table === 'audit_log') {
        return {
          insert() { return Promise.resolve({ error: null }) },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'set_capability_with_authority') {
        rpcCalls.push({ key: args.p_key as string, value: args.p_value as string })
        return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
      }
      return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
    },
  } as any

  await recordRiskSignal(supabase, {
    ledgerId: 'ledger_1',
    organizationId: 'org_1',
    signalType: 'rapid_topup_withdraw',
    severity: 'high',
    description: 'Rapid topup-withdraw detected',
  })

  // Should have set can_payout=false and requires_payout_review=true
  const canPayoutCall = rpcCalls.find((c) => c.key === 'can_payout')
  const reviewCall = rpcCalls.find((c) => c.key === 'requires_payout_review')
  assertEquals(canPayoutCall?.value, 'false')
  assertEquals(reviewCall?.value, 'true')
})

Deno.test('risk: refund_abuse:high triggers requires_payout_review but NOT can_payout=false', async () => {
  let rpcCalls: { key: string; value: string }[] = []

  const supabase = {
    from(table: string) {
      if (table === 'risk_signals') {
        return {
          insert() {
            return {
              select() { return this },
              single() {
                return Promise.resolve({ data: { id: 'signal_ra' }, error: null })
              },
            }
          },
          update() { return { eq() { return { then(r: any) { r({ error: null }); return { catch() {} } } } } } },
        }
      }
      if (table === 'audit_log') {
        return { insert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'set_capability_with_authority') {
        rpcCalls.push({ key: args.p_key as string, value: args.p_value as string })
      }
      return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
    },
  } as any

  await recordRiskSignal(supabase, {
    ledgerId: 'ledger_1',
    organizationId: 'org_1',
    signalType: 'refund_abuse',
    severity: 'high',
    description: 'High refund rate',
  })

  // refund_abuse:high only sets requires_payout_review, not can_payout
  const canPayoutCall = rpcCalls.find((c) => c.key === 'can_payout')
  const reviewCall = rpcCalls.find((c) => c.key === 'requires_payout_review')
  assertEquals(canPayoutCall, undefined) // NOT set
  assertEquals(reviewCall?.value, 'true')
})

Deno.test('risk: low severity signals do NOT trigger auto-actions', async () => {
  let rpcCalls: string[] = []

  const supabase = {
    from(table: string) {
      if (table === 'risk_signals') {
        return {
          insert() {
            return {
              select() { return this },
              single() {
                return Promise.resolve({ data: { id: 'signal_low' }, error: null })
              },
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc(fn: string) {
      rpcCalls.push(fn)
      return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
    },
  } as any

  await recordRiskSignal(supabase, {
    ledgerId: 'ledger_1',
    organizationId: 'org_1',
    signalType: 'velocity_spike',
    severity: 'low',
    description: 'Minor velocity spike',
  })

  // No capability RPCs should have been called
  assertEquals(rpcCalls.filter((fn) => fn === 'set_capability_with_authority').length, 0)
})

Deno.test('risk: checkRefundRate fires signal when rate > 20% with 10+ transactions', async () => {
  let signalInserted = false
  let fromCallCount = 0

  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        fromCallCount++
        const callNum = fromCallCount
        const chain: any = {
          select() { return chain },
          eq() { return chain },
          gte() { return chain },
          then(resolve: any) {
            if (callNum === 1) {
              resolve({ count: 20, error: null }) // 20 total
            } else {
              resolve({ count: 5, error: null }) // 5 refunds = 25%
            }
            return { catch() {} }
          },
        }
        return chain
      }
      if (table === 'risk_signals') {
        return {
          insert() {
            signalInserted = true
            return {
              select() { return this },
              single() {
                return Promise.resolve({ data: { id: 'signal_refund_rate' }, error: null })
              },
            }
          },
          update() { return { eq() { return { then(r: any) { r({ error: null }); return { catch() {} } } } } } },
        }
      }
      if (table === 'audit_log') {
        return { insert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc() {
      return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
    },
  } as any

  await checkRefundRate(supabase, 'ledger_1', 'org_1', 'txn_trigger')

  assertEquals(signalInserted, true)
})

Deno.test('risk: checkRefundRate does NOT fire when rate <= 20%', async () => {
  let signalInserted = false
  let fromCallCount = 0

  const supabase = {
    from(table: string) {
      if (table === 'transactions') {
        fromCallCount++
        const callNum = fromCallCount
        const chain: any = {
          select() { return chain },
          eq() { return chain },
          gte() { return chain },
          then(resolve: any) {
            if (callNum === 1) {
              resolve({ count: 20, error: null }) // 20 total
            } else {
              resolve({ count: 3, error: null }) // 3 refunds = 15%
            }
            return { catch() {} }
          },
        }
        return chain
      }
      if (table === 'risk_signals') {
        return {
          insert() {
            signalInserted = true
            return { select() { return this }, single() { return Promise.resolve({ data: null, error: null }) } }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  await checkRefundRate(supabase, 'ledger_1', 'org_1')

  assertEquals(signalInserted, false)
})

Deno.test('risk: checkLargeTransaction fires signal at $10,000 threshold', async () => {
  let insertedSignal: Record<string, unknown> = {}

  const supabase = {
    from(table: string) {
      if (table === 'risk_signals') {
        return {
          insert(row: Record<string, unknown>) {
            insertedSignal = row
            return {
              select() { return this },
              single() { return Promise.resolve({ data: { id: 'signal_large' }, error: null }) },
            }
          },
          update() { return { eq() { return { then(r: any) { r({ error: null }); return { catch() {} } } } } } },
        }
      }
      if (table === 'audit_log') {
        return { insert() { return Promise.resolve({ error: null }) } }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    rpc() {
      return { then(resolve: any) { resolve(undefined); return { catch() {} } } }
    },
  } as any

  // $10,000 exactly = 1_000_000 cents — should trigger
  await checkLargeTransaction(supabase, 'ledger_1', 'org_1', 1_000_000, 'payout', 'ref_1', 'txn_1')
  assertEquals(insertedSignal.signal_type, 'large_single_txn')
  assertEquals(insertedSignal.severity, 'high')

  // $50,000 = 5_000_000 cents — should be critical
  await checkLargeTransaction(supabase, 'ledger_1', 'org_1', 5_000_000, 'payout', 'ref_2', 'txn_2')
  assertEquals(insertedSignal.severity, 'critical')
})

Deno.test('risk: checkLargeTransaction does NOT fire below threshold', async () => {
  let signalInserted = false

  const supabase = {
    from(table: string) {
      if (table === 'risk_signals') {
        return {
          insert() {
            signalInserted = true
            return { select() { return this }, single() { return Promise.resolve({ data: null, error: null }) } }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  // $9,999.99 = 999_999 cents — just below threshold
  await checkLargeTransaction(supabase, 'ledger_1', 'org_1', 999_999, 'payout', 'ref_1')
  assertEquals(signalInserted, false)
})
