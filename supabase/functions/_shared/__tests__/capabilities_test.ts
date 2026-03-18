import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { loadOrgCapabilities, checkPayoutAllowed, checkDailyVolumeAllowed } from '../capabilities.ts'

// ==========================================================================
// CAPABILITIES — resolve() defaults, partial overrides, checkPayoutAllowed
// ==========================================================================

Deno.test('capabilities: loadOrgCapabilities returns defaults when org has no capabilities', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'organizations') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { capabilities: null },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const caps = await loadOrgCapabilities(supabase, 'org_1')

  assertEquals(caps.can_go_live, true)
  assertEquals(caps.can_payout, true)
  assertEquals(caps.max_daily_payout_cents, -1)
  assertEquals(caps.max_single_payout_cents, -1)
  assertEquals(caps.min_payout_delay_days, 7)
  assertEquals(caps.reserve_percent, 0)
  assertEquals(caps.requires_payout_review, false)
  assertEquals(caps.max_daily_volume_cents, -1)
})

Deno.test('capabilities: loadOrgCapabilities returns defaults when organizationId is undefined', async () => {
  const supabase = {} as any // Should not be called

  const caps = await loadOrgCapabilities(supabase, undefined)

  assertEquals(caps.can_payout, true)
  assertEquals(caps.max_daily_payout_cents, -1)
})

Deno.test('capabilities: resolve merges partial overrides with defaults', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'organizations') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: {
                capabilities: {
                  can_payout: false,
                  max_single_payout_cents: 50000,
                  // Other fields omitted — should use defaults
                },
              },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const caps = await loadOrgCapabilities(supabase, 'org_1')

  assertEquals(caps.can_payout, false) // overridden
  assertEquals(caps.max_single_payout_cents, 50000) // overridden
  assertEquals(caps.can_go_live, true) // default
  assertEquals(caps.max_daily_payout_cents, -1) // default
  assertEquals(caps.min_payout_delay_days, 7) // default
  assertEquals(caps.requires_payout_review, false) // default
})

Deno.test('capabilities: resolve ignores invalid types (string for boolean, etc.)', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'organizations') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: {
                capabilities: {
                  can_payout: 'yes', // string, not boolean
                  max_daily_payout_cents: 'unlimited', // string, not number
                  reserve_percent: true, // boolean, not number
                },
              },
              error: null,
            })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  } as any

  const caps = await loadOrgCapabilities(supabase, 'org_1')

  // Invalid types should fall back to defaults
  assertEquals(caps.can_payout, true) // default because 'yes' is not boolean
  assertEquals(caps.max_daily_payout_cents, -1) // default because 'unlimited' is not number
  assertEquals(caps.reserve_percent, 0) // default because true is not number
})

Deno.test('capabilities: checkPayoutAllowed returns false when can_payout is false', () => {
  const caps = {
    can_go_live: true,
    can_payout: false,
    max_daily_payout_cents: -1,
    max_single_payout_cents: -1,
    min_payout_delay_days: 7,
    reserve_percent: 0,
    requires_payout_review: false,
    max_daily_volume_cents: -1,
  }

  const result = checkPayoutAllowed(caps, 5000, 0)
  assertEquals(result.allowed, false)
  assertEquals(result.reason?.includes('disabled'), true)
})

Deno.test('capabilities: checkPayoutAllowed rejects single payout exceeding max', () => {
  const caps = {
    can_go_live: true,
    can_payout: true,
    max_daily_payout_cents: -1,
    max_single_payout_cents: 100000, // $1,000 max
    min_payout_delay_days: 7,
    reserve_percent: 0,
    requires_payout_review: false,
    max_daily_volume_cents: -1,
  }

  const result = checkPayoutAllowed(caps, 100001, 0) // $1,000.01
  assertEquals(result.allowed, false)
  assertEquals(result.reason?.includes('single payout limit'), true)

  // Exactly at limit should be allowed
  const resultAtLimit = checkPayoutAllowed(caps, 100000, 0)
  assertEquals(resultAtLimit.allowed, true)
})

Deno.test('capabilities: checkPayoutAllowed rejects when daily limit would be exceeded', () => {
  const caps = {
    can_go_live: true,
    can_payout: true,
    max_daily_payout_cents: 500000, // $5,000/day
    max_single_payout_cents: -1,
    min_payout_delay_days: 7,
    reserve_percent: 0,
    requires_payout_review: false,
    max_daily_volume_cents: -1,
  }

  // Already paid out $4,500 today, trying to pay $600 more
  const result = checkPayoutAllowed(caps, 60000, 450000)
  assertEquals(result.allowed, false)
  assertEquals(result.reason?.includes('Daily payout limit'), true)

  // $500 would be exactly at limit — allowed
  const resultAtLimit = checkPayoutAllowed(caps, 50000, 450000)
  assertEquals(resultAtLimit.allowed, true)
})

Deno.test('capabilities: checkPayoutAllowed allows when limits are unlimited (-1)', () => {
  const caps = {
    can_go_live: true,
    can_payout: true,
    max_daily_payout_cents: -1,
    max_single_payout_cents: -1,
    min_payout_delay_days: 7,
    reserve_percent: 0,
    requires_payout_review: false,
    max_daily_volume_cents: -1,
  }

  const result = checkPayoutAllowed(caps, 99999999, 99999999)
  assertEquals(result.allowed, true)
})

Deno.test('capabilities: checkDailyVolumeAllowed blocks when daily volume exceeded', () => {
  const caps = {
    can_go_live: true,
    can_payout: true,
    max_daily_payout_cents: -1,
    max_single_payout_cents: -1,
    min_payout_delay_days: 7,
    reserve_percent: 0,
    requires_payout_review: false,
    max_daily_volume_cents: 1000000, // $10,000/day
  }

  // Already $9,500 volume, adding $600 would exceed
  const result = checkDailyVolumeAllowed(caps, 950000, 60000)
  assertEquals(result.allowed, false)

  // $500 more is exactly at limit — allowed
  const resultAtLimit = checkDailyVolumeAllowed(caps, 950000, 50000)
  assertEquals(resultAtLimit.allowed, true)

  // Unlimited = always allowed
  const unlimitedCaps = { ...caps, max_daily_volume_cents: -1 }
  const resultUnlimited = checkDailyVolumeAllowed(unlimitedCaps, 99999999, 99999999)
  assertEquals(resultUnlimited.allowed, true)
})
