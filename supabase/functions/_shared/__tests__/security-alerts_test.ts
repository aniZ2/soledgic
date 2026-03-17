import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// ==========================================================================
// Cross-ledger boundary violation scanner logic
// ==========================================================================
// The scanner in security-alerts/index.ts queries audit_log for
// `cross_ledger_violation` events and sets severity based on count.
// We test the classification logic extracted here.

function classifyBoundaryViolations(violations: Array<{
  id: string
  ip_address: string | null
  ledger_id: string | null
}>): { severity: 'critical' | 'warning'; count: number; uniqueIPs: number; uniqueLedgers: number } | null {
  if (violations.length === 0) return null

  const uniqueIPs = new Set(violations.map((v) => v.ip_address).filter(Boolean)).size
  const uniqueLedgers = new Set(violations.map((v) => v.ledger_id).filter(Boolean)).size

  return {
    severity: violations.length >= 5 ? 'critical' : 'warning',
    count: violations.length,
    uniqueIPs,
    uniqueLedgers,
  }
}

Deno.test('boundary scanner: zero violations returns null', () => {
  assertEquals(classifyBoundaryViolations([]), null)
})

Deno.test('boundary scanner: single violation is warning', () => {
  const result = classifyBoundaryViolations([
    { id: '1', ip_address: '1.2.3.4', ledger_id: 'ledger_a' },
  ])
  assertEquals(result?.severity, 'warning')
  assertEquals(result?.count, 1)
})

Deno.test('boundary scanner: 5 violations is critical', () => {
  const violations = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    ip_address: '1.2.3.4',
    ledger_id: 'ledger_a',
  }))
  const result = classifyBoundaryViolations(violations)
  assertEquals(result?.severity, 'critical')
  assertEquals(result?.count, 5)
})

Deno.test('boundary scanner: counts unique IPs correctly', () => {
  const violations = [
    { id: '1', ip_address: '1.1.1.1', ledger_id: 'a' },
    { id: '2', ip_address: '2.2.2.2', ledger_id: 'a' },
    { id: '3', ip_address: '1.1.1.1', ledger_id: 'b' },
    { id: '4', ip_address: null, ledger_id: 'a' },
  ]
  const result = classifyBoundaryViolations(violations)
  assertEquals(result?.uniqueIPs, 2)
  assertEquals(result?.uniqueLedgers, 2)
})

Deno.test('boundary scanner: 4 violations is warning, 5 is critical boundary', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: String(i), ip_address: '1.2.3.4', ledger_id: 'a',
  }))
  assertEquals(classifyBoundaryViolations(make(4))?.severity, 'warning')
  assertEquals(classifyBoundaryViolations(make(5))?.severity, 'critical')
})

// ==========================================================================
// Alert severity classification
// ==========================================================================

function overallSeverity(alerts: Array<{ severity: string }>): 'critical' | 'warning' | 'info' {
  if (alerts.some((a) => a.severity === 'critical')) return 'critical'
  if (alerts.some((a) => a.severity === 'warning')) return 'warning'
  return 'info'
}

Deno.test('overall severity: critical wins over warning', () => {
  assertEquals(overallSeverity([
    { severity: 'info' },
    { severity: 'warning' },
    { severity: 'critical' },
  ]), 'critical')
})

Deno.test('overall severity: warning wins over info', () => {
  assertEquals(overallSeverity([
    { severity: 'info' },
    { severity: 'warning' },
  ]), 'warning')
})

Deno.test('overall severity: info when only info', () => {
  assertEquals(overallSeverity([{ severity: 'info' }]), 'info')
})
