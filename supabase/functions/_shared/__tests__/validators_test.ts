import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  validateAmount,
  validateId,
  validateUUID,
  validateEmail,
  validateString,
  validateDate,
  validateInteger,
} from '../utils.ts'

// ============================================================================
// validateAmount
// ============================================================================

Deno.test('validateAmount: valid integer cents', () => {
  assertEquals(validateAmount(1000), 1000)
  assertEquals(validateAmount(0), 0)
  assertEquals(validateAmount(99999999), 99999999)
})

Deno.test('validateAmount: rounds fractional cents', () => {
  assertEquals(validateAmount(10.6), 11)
  assertEquals(validateAmount(10.4), 10)
})

Deno.test('validateAmount: rejects negative', () => {
  assertEquals(validateAmount(-1), null)
  assertEquals(validateAmount(-0.01), null)
})

Deno.test('validateAmount: rejects over $1M (100_000_000 cents)', () => {
  assertEquals(validateAmount(100_000_001), null)
})

Deno.test('validateAmount: rejects non-number types', () => {
  assertEquals(validateAmount('100'), null)
  assertEquals(validateAmount(null), null)
  assertEquals(validateAmount(undefined), null)
  assertEquals(validateAmount({}), null)
})

Deno.test('validateAmount: rejects NaN and Infinity', () => {
  assertEquals(validateAmount(NaN), null)
  assertEquals(validateAmount(Infinity), null)
  assertEquals(validateAmount(-Infinity), null)
})

// ============================================================================
// validateId
// ============================================================================

Deno.test('validateId: valid alphanumeric with hyphens/underscores', () => {
  assertEquals(validateId('abc-123'), 'abc-123')
  assertEquals(validateId('user_001'), 'user_001')
  assertEquals(validateId('A'), 'A')
})

Deno.test('validateId: rejects empty string', () => {
  assertEquals(validateId(''), null)
})

Deno.test('validateId: rejects over maxLength', () => {
  assertEquals(validateId('a'.repeat(101)), null)
  assertEquals(validateId('a'.repeat(100)), 'a'.repeat(100))
})

Deno.test('validateId: custom maxLength', () => {
  assertEquals(validateId('abcde', 4), null)
  assertEquals(validateId('abcd', 4), 'abcd')
})

Deno.test('validateId: rejects SQL injection characters', () => {
  assertEquals(validateId("admin'; DROP TABLE--"), null)
  assertEquals(validateId('user@domain'), null)
  assertEquals(validateId('id with spaces'), null)
  assertEquals(validateId('id<script>'), null)
})

Deno.test('validateId: rejects non-string types', () => {
  assertEquals(validateId(123), null)
  assertEquals(validateId(null), null)
  assertEquals(validateId(undefined), null)
})

// ============================================================================
// validateUUID
// ============================================================================

Deno.test('validateUUID: valid v4 UUID', () => {
  assertEquals(
    validateUUID('550e8400-e29b-41d4-a716-446655440000'),
    '550e8400-e29b-41d4-a716-446655440000'
  )
})

Deno.test('validateUUID: normalizes to lowercase', () => {
  assertEquals(
    validateUUID('550E8400-E29B-41D4-A716-446655440000'),
    '550e8400-e29b-41d4-a716-446655440000'
  )
})

Deno.test('validateUUID: rejects non-v4 UUIDs', () => {
  // v1 UUID (first nibble of third group is 1, not 4)
  assertEquals(validateUUID('550e8400-e29b-11d4-a716-446655440000'), null)
})

Deno.test('validateUUID: rejects invalid format', () => {
  assertEquals(validateUUID('not-a-uuid'), null)
  assertEquals(validateUUID(''), null)
  assertEquals(validateUUID(123), null)
})

// ============================================================================
// validateEmail
// ============================================================================

Deno.test('validateEmail: valid emails', () => {
  assertEquals(validateEmail('user@example.com'), 'user@example.com')
  assertEquals(validateEmail('User@Example.COM'), 'user@example.com')
})

Deno.test('validateEmail: rejects invalid formats', () => {
  assertEquals(validateEmail('not-an-email'), null)
  assertEquals(validateEmail('@example.com'), null)
  assertEquals(validateEmail('user@'), null)
  assertEquals(validateEmail(''), null)
})

Deno.test('validateEmail: rejects too-long addresses', () => {
  const longEmail = 'a'.repeat(250) + '@b.co'
  assertEquals(validateEmail(longEmail), null)
})

Deno.test('validateEmail: rejects non-string types', () => {
  assertEquals(validateEmail(123), null)
  assertEquals(validateEmail(null), null)
})

// ============================================================================
// validateString
// ============================================================================

Deno.test('validateString: valid string', () => {
  assertEquals(validateString('hello world'), 'hello world')
})

Deno.test('validateString: strips angle brackets (XSS prevention)', () => {
  assertEquals(validateString('<script>alert(1)</script>'), 'scriptalert(1)/script')
})

Deno.test('validateString: strips javascript: protocol', () => {
  assertEquals(validateString('javascript:alert(1)'), 'alert(1)')
})

Deno.test('validateString: strips event handlers', () => {
  const result = validateString('text onerror=alert(1)')
  assertEquals(result?.includes('onerror='), false)
})

Deno.test('validateString: rejects over maxLength', () => {
  assertEquals(validateString('a'.repeat(1001)), null)
  assertEquals(validateString('a'.repeat(1000), 1000)?.length, 1000)
})

Deno.test('validateString: custom maxLength', () => {
  assertEquals(validateString('abcde', 4), null)
  assertEquals(validateString('abcd', 4), 'abcd')
})

Deno.test('validateString: trims whitespace', () => {
  assertEquals(validateString('  hello  '), 'hello')
})

Deno.test('validateString: rejects non-string types', () => {
  assertEquals(validateString(123), null)
  assertEquals(validateString(null), null)
})

// ============================================================================
// validateDate
// ============================================================================

Deno.test('validateDate: valid ISO 8601 date', () => {
  const result = validateDate('2025-06-15T10:30:00.000Z')
  assertEquals(result, '2025-06-15T10:30:00.000Z')
})

Deno.test('validateDate: valid date-only string', () => {
  const result = validateDate('2025-01-01')
  assertEquals(typeof result, 'string')
  assertEquals(result!.startsWith('2025-01-01'), true)
})

Deno.test('validateDate: rejects before 1970', () => {
  assertEquals(validateDate('1969-12-31'), null)
})

Deno.test('validateDate: rejects after 2100', () => {
  assertEquals(validateDate('2101-01-01'), null)
})

Deno.test('validateDate: rejects invalid date strings', () => {
  assertEquals(validateDate('not-a-date'), null)
  assertEquals(validateDate(''), null)
})

Deno.test('validateDate: rejects non-string types', () => {
  assertEquals(validateDate(123), null)
  assertEquals(validateDate(null), null)
})

// ============================================================================
// validateInteger
// ============================================================================

Deno.test('validateInteger: valid integers', () => {
  assertEquals(validateInteger(0), 0)
  assertEquals(validateInteger(42), 42)
  assertEquals(validateInteger(100), 100)
})

Deno.test('validateInteger: respects min/max bounds', () => {
  assertEquals(validateInteger(5, 1, 10), 5)
  assertEquals(validateInteger(0, 1, 10), null)
  assertEquals(validateInteger(11, 1, 10), null)
})

Deno.test('validateInteger: rejects non-integers', () => {
  assertEquals(validateInteger(1.5), null)
  assertEquals(validateInteger(NaN), null)
})

Deno.test('validateInteger: rejects negative by default (min=0)', () => {
  assertEquals(validateInteger(-1), null)
})

Deno.test('validateInteger: rejects non-number types', () => {
  assertEquals(validateInteger('5'), null)
  assertEquals(validateInteger(null), null)
})
