import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  getLinkedUserIdsForParticipants,
  getLinkedUserIdForParticipant,
  upsertSharedTaxProfile,
  upsertSharedPayoutProfile,
} from '../identity-service.ts'

// ==========================================================================
// getLinkedUserIdsForParticipants — empty input returns empty map
// ==========================================================================

Deno.test('getLinkedUserIdsForParticipants: empty array returns empty map', async () => {
  const supabase = {} as any // Should not be called
  const result = await getLinkedUserIdsForParticipants(supabase, 'ledger-1', [])
  assertEquals(result.size, 0)
})

Deno.test('getLinkedUserIdsForParticipants: maps participant_id to user_id', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        in() {
          return Promise.resolve({
            data: [
              { participant_id: 'p1', user_id: 'u1' },
              { participant_id: 'p2', user_id: 'u2' },
            ],
            error: null,
          })
        },
      }
    },
  } as any

  const result = await getLinkedUserIdsForParticipants(supabase, 'ledger-1', ['p1', 'p2'])
  assertEquals(result.size, 2)
  assertEquals(result.get('p1'), 'u1')
  assertEquals(result.get('p2'), 'u2')
})

Deno.test('getLinkedUserIdsForParticipants: skips rows with null values', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        in() {
          return Promise.resolve({
            data: [
              { participant_id: 'p1', user_id: 'u1' },
              { participant_id: null, user_id: 'u2' },
              { participant_id: 'p3', user_id: null },
            ],
            error: null,
          })
        },
      }
    },
  } as any

  const result = await getLinkedUserIdsForParticipants(supabase, 'ledger-1', ['p1', 'p3'])
  assertEquals(result.size, 1)
  assertEquals(result.get('p1'), 'u1')
})

// ==========================================================================
// getLinkedUserIdForParticipant — single lookup
// ==========================================================================

Deno.test('getLinkedUserIdForParticipant: returns user_id when found', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({ data: { user_id: 'u_abc' }, error: null })
        },
      }
    },
  } as any

  const result = await getLinkedUserIdForParticipant(supabase, 'ledger-1', 'p_123')
  assertEquals(result, 'u_abc')
})

Deno.test('getLinkedUserIdForParticipant: returns null when not found', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  const result = await getLinkedUserIdForParticipant(supabase, 'ledger-1', 'p_unknown')
  assertEquals(result, null)
})

// ==========================================================================
// upsertSharedTaxProfile — skips when no data
// ==========================================================================

Deno.test('upsertSharedTaxProfile: skips upsert when no meaningful tax data provided', async () => {
  let upsertCalled = false
  const supabase = {
    from() {
      return {
        upsert() {
          upsertCalled = true
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  await upsertSharedTaxProfile(supabase, 'user_1', {})
  assertEquals(upsertCalled, false)
})

Deno.test('upsertSharedTaxProfile: calls upsert when legal_name is present', async () => {
  let upsertCalled = false
  const supabase = {
    from() {
      return {
        upsert() {
          upsertCalled = true
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  await upsertSharedTaxProfile(supabase, 'user_1', { legal_name: 'John Doe' })
  assertEquals(upsertCalled, true)
})

// ==========================================================================
// upsertSharedPayoutProfile — skips when no data
// ==========================================================================

Deno.test('upsertSharedPayoutProfile: skips upsert when no meaningful payout data provided', async () => {
  let upsertCalled = false
  const supabase = {
    from() {
      return {
        upsert() {
          upsertCalled = true
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  await upsertSharedPayoutProfile(supabase, 'user_1', {})
  assertEquals(upsertCalled, false)
})

Deno.test('upsertSharedPayoutProfile: calls upsert when method is present', async () => {
  let upsertCalled = false
  const supabase = {
    from() {
      return {
        upsert() {
          upsertCalled = true
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  await upsertSharedPayoutProfile(supabase, 'user_1', { method: 'card' })
  assertEquals(upsertCalled, true)
})

Deno.test('upsertSharedPayoutProfile: detects minimum_amount presence (including 0)', async () => {
  let upsertCalled = false
  const supabase = {
    from() {
      return {
        upsert() {
          upsertCalled = true
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  } as any

  await upsertSharedPayoutProfile(supabase, 'user_1', { minimum_amount: 0 })
  assertEquals(upsertCalled, true)
})
