import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// Credits edge function logic is not a shared service, so we reimplement
// the pure conversion functions here (same pattern as transaction-graph_test.ts).

const CREDITS_PER_DOLLAR = 1000
const MIN_CONVERSION_CREDITS = 5000 // $5 minimum

function creditsToUsd(credits: number): number {
  return Math.round((credits / CREDITS_PER_DOLLAR) * 100) / 100
}

function creditsToUsdCents(credits: number): number {
  return Math.round((credits / CREDITS_PER_DOLLAR) * 100)
}

// ============================================================================
// creditsToUsd — conversion accuracy
// ============================================================================

Deno.test('creditsToUsd: 1000 credits = $1.00 (standard rate)', () => {
  assertEquals(creditsToUsd(1000), 1.00)
})

Deno.test('creditsToUsd: 5000 credits = $5.00', () => {
  assertEquals(creditsToUsd(5000), 5.00)
})

Deno.test('creditsToUsd: 100 credits = $0.10', () => {
  assertEquals(creditsToUsd(100), 0.10)
})

Deno.test('creditsToUsd: 1 credit = $0.00 (rounds down sub-cent)', () => {
  assertEquals(creditsToUsd(1), 0.00)
})

Deno.test('creditsToUsd: 5 credits = $0.01 (rounds to nearest cent)', () => {
  assertEquals(creditsToUsd(5), 0.01)
})

Deno.test('creditsToUsd: 10000 credits = $10.00', () => {
  assertEquals(creditsToUsd(10000), 10.00)
})

Deno.test('creditsToUsd: 1500 credits = $1.50', () => {
  assertEquals(creditsToUsd(1500), 1.50)
})

Deno.test('creditsToUsd: 999 credits = $1.00 (rounds up from 0.999)', () => {
  assertEquals(creditsToUsd(999), 1.00)
})

Deno.test('creditsToUsd: 0 credits = $0.00', () => {
  assertEquals(creditsToUsd(0), 0.00)
})

Deno.test('creditsToUsd: large amount 1000000 credits = $1000.00', () => {
  assertEquals(creditsToUsd(1000000), 1000.00)
})

// ============================================================================
// creditsToUsdCents — cent-precision conversion
// ============================================================================

Deno.test('creditsToUsdCents: 1000 credits = 100 cents', () => {
  assertEquals(creditsToUsdCents(1000), 100)
})

Deno.test('creditsToUsdCents: 5000 credits = 500 cents', () => {
  assertEquals(creditsToUsdCents(5000), 500)
})

Deno.test('creditsToUsdCents: 100 credits = 10 cents', () => {
  assertEquals(creditsToUsdCents(100), 10)
})

Deno.test('creditsToUsdCents: 1 credit = 0 cents (sub-cent rounds to 0)', () => {
  assertEquals(creditsToUsdCents(1), 0)
})

Deno.test('creditsToUsdCents: 10 credits = 1 cent', () => {
  assertEquals(creditsToUsdCents(10), 1)
})

Deno.test('creditsToUsdCents: 0 credits = 0 cents', () => {
  assertEquals(creditsToUsdCents(0), 0)
})

Deno.test('creditsToUsdCents: 10000 credits = 1000 cents', () => {
  assertEquals(creditsToUsdCents(10000), 1000)
})

Deno.test('creditsToUsdCents: 1500 credits = 150 cents', () => {
  assertEquals(creditsToUsdCents(1500), 150)
})

Deno.test('creditsToUsdCents: consistency with creditsToUsd', () => {
  for (const credits of [100, 500, 1000, 2500, 5000, 10000, 75000]) {
    const fromUsd = Math.round(creditsToUsd(credits) * 100)
    const fromCents = creditsToUsdCents(credits)
    assertEquals(fromUsd, fromCents, `Mismatch at ${credits} credits`)
  }
})

// ============================================================================
// MIN_CONVERSION_CREDITS enforcement
// ============================================================================

Deno.test('MIN_CONVERSION_CREDITS: 5000 credits is $5 minimum', () => {
  assertEquals(MIN_CONVERSION_CREDITS, 5000)
  assertEquals(creditsToUsd(MIN_CONVERSION_CREDITS), 5.00)
})

Deno.test('MIN_CONVERSION_CREDITS: below minimum rejected', () => {
  const credits = 4999
  const belowMinimum = credits < MIN_CONVERSION_CREDITS
  assertEquals(belowMinimum, true)
})

Deno.test('MIN_CONVERSION_CREDITS: exactly minimum accepted', () => {
  const credits = 5000
  const belowMinimum = credits < MIN_CONVERSION_CREDITS
  assertEquals(belowMinimum, false)
})

Deno.test('MIN_CONVERSION_CREDITS: above minimum accepted', () => {
  const credits = 5001
  const belowMinimum = credits < MIN_CONVERSION_CREDITS
  assertEquals(belowMinimum, false)
})

// ============================================================================
// Zero and negative credits — rejection logic
// ============================================================================

Deno.test('credits validation: zero credits rejected', () => {
  const credits = 0
  const invalid = !credits || credits <= 0
  assertEquals(invalid, true)
})

Deno.test('credits validation: negative credits rejected', () => {
  const credits = -100
  const invalid = !credits || credits <= 0
  assertEquals(invalid, true)
})

Deno.test('credits validation: positive credits accepted', () => {
  const credits = 1
  const invalid = !credits || credits <= 0
  assertEquals(invalid, false)
})

Deno.test('credits validation: null credits rejected', () => {
  const credits = null
  const invalid = !credits || credits <= 0
  assertEquals(invalid, true)
})

// ============================================================================
// Standard rate verification
// ============================================================================

Deno.test('standard rate: CREDITS_PER_DOLLAR is 1000', () => {
  assertEquals(CREDITS_PER_DOLLAR, 1000)
})

Deno.test('standard rate: inverse conversion holds (100 cents = 1000 credits)', () => {
  const usdCents = 100
  const credits = usdCents * (CREDITS_PER_DOLLAR / 100)
  assertEquals(credits, 1000)
})

Deno.test('standard rate: round-trip conversion is stable', () => {
  const originalCredits = 7500
  const usd = creditsToUsd(originalCredits)
  const cents = creditsToUsdCents(originalCredits)
  assertEquals(usd, 7.50)
  assertEquals(cents, 750)
  // Reverse: cents * 10 = credits
  assertEquals(cents * (CREDITS_PER_DOLLAR / 100), originalCredits)
})

// ============================================================================
// Edge cases — fractional credits from Math.round
// ============================================================================

Deno.test('creditsToUsdCents: 15 credits rounds to 2 cents (1.5 rounds to 2)', () => {
  // 15 / 1000 * 100 = 1.5, Math.round(1.5) = 2
  assertEquals(creditsToUsdCents(15), 2)
})

Deno.test('creditsToUsd: 4 credits rounds to $0.00 (0.4 cents rounds down)', () => {
  // 4 / 1000 * 100 = 0.4, Math.round(0.4) = 0, 0 / 100 = 0.00
  assertEquals(creditsToUsd(4), 0.00)
})

Deno.test('creditsToUsdCents: 4 credits = 0 cents', () => {
  assertEquals(creditsToUsdCents(4), 0)
})
