import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { scrubPII, parseStackFrames } from '../error-tracking.ts'

// ============================================================================
// scrubPII
// ============================================================================

Deno.test('scrubPII: redacts SSN patterns', () => {
  assertEquals(scrubPII('SSN is 123-45-6789'), 'SSN is [SSN]')
})

Deno.test('scrubPII: redacts EIN patterns', () => {
  assertEquals(scrubPII('EIN is 12-3456789'), 'EIN is [EIN]')
})

Deno.test('scrubPII: redacts JWT tokens', () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  const result = scrubPII(`Bearer ${token}`)
  assertEquals(result.includes('eyJ'), false)
  assertEquals(result.includes('[TOKEN]'), true)
})

Deno.test('scrubPII: redacts API keys (sk_ prefix)', () => {
  const result = scrubPII('key is sk_live_abc123def456')
  assertEquals(result.includes('sk_'), false)
  assertEquals(result.includes('[KEY]'), true)
})

Deno.test('scrubPII: redacts webhook secrets (whsec_ prefix)', () => {
  const result = scrubPII('secret: whsec_abc123')
  assertEquals(result.includes('whsec_'), false)
  assertEquals(result.includes('[SECRET]'), true)
})

Deno.test('scrubPII: redacts IP addresses', () => {
  const result = scrubPII('client IP: 192.168.1.100')
  assertEquals(result.includes('192.168.1.100'), false)
  assertEquals(result.includes('[IP]'), true)
})

Deno.test('scrubPII: truncates to 500 characters', () => {
  const longString = 'a'.repeat(600)
  const result = scrubPII(longString)
  assertEquals(result.length, 500)
})

Deno.test('scrubPII: handles empty string', () => {
  assertEquals(scrubPII(''), '')
})

Deno.test('scrubPII: passes through safe text', () => {
  assertEquals(scrubPII('Hello World'), 'Hello World')
})

// ============================================================================
// parseStackFrames
// ============================================================================

Deno.test('parseStackFrames: parses named function frames', () => {
  const stack = `Error: something broke
    at functionName (file.ts:10:5)
    at anotherFn (other.ts:20:3)`

  const frames = parseStackFrames(stack)
  // Sentry expects reverse order (outermost first)
  assertEquals(frames.length, 2)
  assertEquals(frames[0].function, 'anotherFn')
  assertEquals(frames[0].filename, 'other.ts')
  assertEquals(frames[0].lineno, 20)
  assertEquals(frames[0].colno, 3)
  assertEquals(frames[1].function, 'functionName')
  assertEquals(frames[1].filename, 'file.ts')
  assertEquals(frames[1].lineno, 10)
  assertEquals(frames[1].colno, 5)
})

Deno.test('parseStackFrames: parses anonymous frames', () => {
  const stack = `Error: test
    at file:///path/to/file.ts:15:10`

  const frames = parseStackFrames(stack)
  assertEquals(frames.length, 1)
  assertEquals(frames[0].lineno, 15)
  assertEquals(frames[0].colno, 10)
})

Deno.test('parseStackFrames: limits to 10 frames', () => {
  let stack = 'Error: test\n'
  for (let i = 0; i < 20; i++) {
    stack += `    at fn${i} (file${i}.ts:${i + 1}:1)\n`
  }

  const frames = parseStackFrames(stack)
  assertEquals(frames.length, 10)
})

Deno.test('parseStackFrames: returns frames in reverse order (outermost first)', () => {
  const stack = `Error: test
    at inner (a.ts:1:1)
    at outer (b.ts:2:2)`

  const frames = parseStackFrames(stack)
  assertEquals(frames[0].function, 'outer')
  assertEquals(frames[1].function, 'inner')
})

Deno.test('parseStackFrames: handles empty stack', () => {
  const frames = parseStackFrames('Error: no stack')
  assertEquals(frames.length, 0)
})
