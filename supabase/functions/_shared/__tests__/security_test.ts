import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  escapeHtml,
  timingSafeEqual,
  generateApiKey,
  hashApiKey,
  isPrivateIP,
  isBlockedHostname,
} from '../utils.ts'

// ============================================================================
// escapeHtml
// ============================================================================

Deno.test('escapeHtml: escapes all HTML entities', () => {
  assertEquals(escapeHtml('&'), '&amp;')
  assertEquals(escapeHtml('<'), '&lt;')
  assertEquals(escapeHtml('>'), '&gt;')
  assertEquals(escapeHtml('"'), '&quot;')
  assertEquals(escapeHtml("'"), '&#39;')
})

Deno.test('escapeHtml: escapes combined dangerous string', () => {
  assertEquals(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
  )
})

Deno.test('escapeHtml: returns empty string for null/undefined', () => {
  assertEquals(escapeHtml(null), '')
  assertEquals(escapeHtml(undefined), '')
})

Deno.test('escapeHtml: passes through safe text unchanged', () => {
  assertEquals(escapeHtml('Hello World 123'), 'Hello World 123')
})

// ============================================================================
// timingSafeEqual
// ============================================================================

Deno.test('timingSafeEqual: equal strings return true', () => {
  assertEquals(timingSafeEqual('abc', 'abc'), true)
  assertEquals(timingSafeEqual('', ''), true)
})

Deno.test('timingSafeEqual: different strings return false', () => {
  assertEquals(timingSafeEqual('abc', 'xyz'), false)
  assertEquals(timingSafeEqual('abc', 'ab'), false)
})

Deno.test('timingSafeEqual: different lengths return false', () => {
  assertEquals(timingSafeEqual('short', 'longer-string'), false)
  assertEquals(timingSafeEqual('a', ''), false)
})

Deno.test('timingSafeEqual: handles special characters', () => {
  assertEquals(timingSafeEqual('sk_live_abc123', 'sk_live_abc123'), true)
  assertEquals(timingSafeEqual('sk_live_abc123', 'sk_live_abc124'), false)
})

// ============================================================================
// generateApiKey
// ============================================================================

Deno.test('generateApiKey: test key has slk_test_ prefix', () => {
  const key = generateApiKey(false)
  assertEquals(key.startsWith('slk_test_'), true)
  assertEquals(key.length, 9 + 32) // prefix + 32 hex chars
})

Deno.test('generateApiKey: live key has slk_live_ prefix', () => {
  const key = generateApiKey(true)
  assertEquals(key.startsWith('slk_live_'), true)
  assertEquals(key.length, 9 + 32)
})

Deno.test('generateApiKey: generates unique keys', () => {
  const key1 = generateApiKey()
  const key2 = generateApiKey()
  assertNotEquals(key1, key2)
})

// ============================================================================
// hashApiKey
// ============================================================================

Deno.test('hashApiKey: produces 64-char hex string (SHA-256)', async () => {
  const hash = await hashApiKey('slk_test_abc123')
  assertEquals(hash.length, 64)
  assertEquals(/^[0-9a-f]{64}$/.test(hash), true)
})

Deno.test('hashApiKey: same input produces same hash', async () => {
  const hash1 = await hashApiKey('slk_test_abc123')
  const hash2 = await hashApiKey('slk_test_abc123')
  assertEquals(hash1, hash2)
})

Deno.test('hashApiKey: different inputs produce different hashes', async () => {
  const hash1 = await hashApiKey('slk_test_abc123')
  const hash2 = await hashApiKey('slk_test_abc124')
  assertNotEquals(hash1, hash2)
})

// ============================================================================
// isPrivateIP
// ============================================================================

Deno.test('isPrivateIP: detects 10.x.x.x range', () => {
  assertEquals(isPrivateIP('10.0.0.1'), true)
  assertEquals(isPrivateIP('10.255.255.255'), true)
})

Deno.test('isPrivateIP: detects 192.168.x.x range', () => {
  assertEquals(isPrivateIP('192.168.1.1'), true)
})

Deno.test('isPrivateIP: detects 172.16-31.x.x range', () => {
  assertEquals(isPrivateIP('172.16.0.1'), true)
  assertEquals(isPrivateIP('172.31.255.255'), true)
})

Deno.test('isPrivateIP: detects localhost', () => {
  assertEquals(isPrivateIP('127.0.0.1'), true)
  assertEquals(isPrivateIP('127.0.0.2'), true)
})

Deno.test('isPrivateIP: detects link-local (169.254.x.x)', () => {
  assertEquals(isPrivateIP('169.254.169.254'), true)
})

Deno.test('isPrivateIP: allows public IPs', () => {
  assertEquals(isPrivateIP('8.8.8.8'), false)
  assertEquals(isPrivateIP('1.1.1.1'), false)
  assertEquals(isPrivateIP('203.0.114.1'), false)
})

Deno.test('isPrivateIP: detects IPv6 loopback', () => {
  assertEquals(isPrivateIP('::1'), true)
})

Deno.test('isPrivateIP: detects IPv6 unique local', () => {
  assertEquals(isPrivateIP('fd00::1'), true)
})

// ============================================================================
// isBlockedHostname
// ============================================================================

Deno.test('isBlockedHostname: blocks localhost', () => {
  assertEquals(isBlockedHostname('localhost'), true)
})

Deno.test('isBlockedHostname: blocks metadata endpoints', () => {
  assertEquals(isBlockedHostname('metadata.google.internal'), true)
  assertEquals(isBlockedHostname('metadata'), true)
})

Deno.test('isBlockedHostname: blocks .internal domains', () => {
  assertEquals(isBlockedHostname('anything.internal'), true)
})

Deno.test('isBlockedHostname: blocks .local domains', () => {
  assertEquals(isBlockedHostname('server.local'), true)
})

Deno.test('isBlockedHostname: blocks Kubernetes service domains', () => {
  assertEquals(isBlockedHostname('api.default.svc.cluster.local'), true)
})

Deno.test('isBlockedHostname: allows public domains', () => {
  assertEquals(isBlockedHostname('example.com'), false)
  assertEquals(isBlockedHostname('api.soledgic.com'), false)
})

Deno.test('isBlockedHostname: case insensitive', () => {
  assertEquals(isBlockedHostname('LOCALHOST'), true)
  assertEquals(isBlockedHostname('Metadata.Google.Internal'), true)
})
