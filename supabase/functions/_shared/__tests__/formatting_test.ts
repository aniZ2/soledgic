import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  sanitizeForAudit,
  getEndpointBodySizeLimit,
  generateRequestId,
} from '../utils.ts'

// ============================================================================
// sanitizeForAudit
// ============================================================================

Deno.test('sanitizeForAudit: redacts sensitive field names', () => {
  const input = {
    name: 'John',
    account_number: '123456789',
    routing_number: '021000021',
    ssn: '123-45-6789',
    api_key: 'sk_live_secret',
    password: 'hunter2',
  }
  const result = sanitizeForAudit(input)
  assertEquals(result.name, 'John')
  assertEquals(result.account_number, '[REDACTED]')
  assertEquals(result.routing_number, '[REDACTED]')
  assertEquals(result.ssn, '[REDACTED]')
  assertEquals(result.api_key, '[REDACTED]')
  assertEquals(result.password, '[REDACTED]')
})

Deno.test('sanitizeForAudit: redacts keys containing sensitive substrings', () => {
  const input = {
    bank_account_number: '9876',
    user_token: 'abc',
    webhook_secret: 'whsec_123',
  }
  const result = sanitizeForAudit(input)
  assertEquals(result.bank_account_number, '[REDACTED]')
  assertEquals(result.user_token, '[REDACTED]')
  assertEquals(result.webhook_secret, '[REDACTED]')
})

Deno.test('sanitizeForAudit: preserves non-sensitive fields', () => {
  const input = { amount: 1000, description: 'Test payment', status: 'completed' }
  const result = sanitizeForAudit(input)
  assertEquals(result.amount, 1000)
  assertEquals(result.description, 'Test payment')
  assertEquals(result.status, 'completed')
})

Deno.test('sanitizeForAudit: handles nested objects', () => {
  const input = {
    user: {
      name: 'Alice',
      secret: 'shh',
    },
  }
  const result = sanitizeForAudit(input)
  assertEquals(result.user.name, 'Alice')
  assertEquals(result.user.secret, '[REDACTED]')
})

Deno.test('sanitizeForAudit: handles arrays', () => {
  const input = [{ password: 'abc' }, { name: 'Bob' }]
  const result = sanitizeForAudit(input)
  assertEquals(result[0].password, '[REDACTED]')
  assertEquals(result[1].name, 'Bob')
})

Deno.test('sanitizeForAudit: handles null and undefined', () => {
  assertEquals(sanitizeForAudit(null), null)
  assertEquals(sanitizeForAudit(undefined), undefined)
})

Deno.test('sanitizeForAudit: handles primitive types', () => {
  assertEquals(sanitizeForAudit('hello'), 'hello')
  assertEquals(sanitizeForAudit(42), 42)
  assertEquals(sanitizeForAudit(true), true)
})

Deno.test('sanitizeForAudit: caps recursion depth', () => {
  // Build a deeply nested object (>10 levels)
  let obj: any = { value: 'deep' }
  for (let i = 0; i < 15; i++) {
    obj = { nested: obj }
  }
  const result = sanitizeForAudit(obj)
  // Should reach max depth and return '[max depth]' instead of crashing
  let current = result
  let foundMaxDepth = false
  for (let i = 0; i < 20; i++) {
    if (current === '[max depth]') {
      foundMaxDepth = true
      break
    }
    current = current?.nested
  }
  assertEquals(foundMaxDepth, true)
})

// ============================================================================
// getEndpointBodySizeLimit
// ============================================================================

Deno.test('getEndpointBodySizeLimit: returns specific limit for known endpoints', () => {
  assertEquals(getEndpointBodySizeLimit('record-sale'), 64 * 1024)
  assertEquals(getEndpointBodySizeLimit('import-bank-statement'), 2 * 1024 * 1024)
  assertEquals(getEndpointBodySizeLimit('import-transactions'), 5 * 1024 * 1024)
})

Deno.test('getEndpointBodySizeLimit: returns default for unknown endpoints', () => {
  assertEquals(getEndpointBodySizeLimit('unknown-endpoint'), 512 * 1024)
  assertEquals(getEndpointBodySizeLimit(''), 512 * 1024)
})

// ============================================================================
// generateRequestId
// ============================================================================

Deno.test('generateRequestId: has req_ prefix', () => {
  const id = generateRequestId()
  assertEquals(id.startsWith('req_'), true)
})

Deno.test('generateRequestId: generates unique IDs', () => {
  const id1 = generateRequestId()
  const id2 = generateRequestId()
  assertEquals(id1 !== id2, true)
})

Deno.test('generateRequestId: correct length (req_ + 32 hex chars)', () => {
  const id = generateRequestId()
  assertEquals(id.length, 4 + 32)
})
