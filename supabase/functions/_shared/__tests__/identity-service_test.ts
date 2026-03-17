import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  getLinkedUserIdsForParticipants,
  getLinkedUserIdForParticipant,
  linkParticipantToUser,
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

// ==========================================================================
// linkParticipantToUser — cross-ledger guard
// ==========================================================================

function mockChain(terminalResult: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = () => Promise.resolve(terminalResult)
  chain.upsert = () => Promise.resolve({ data: null, error: null })
  return chain
}

function mockSupabaseForLink(opts: {
  accountExists: boolean
  membershipExists?: boolean
  upsertError?: string | null
}) {
  let auditInserted = false
  let auditAction = ''
  const calls: string[] = []

  const supabase = {
    from(table: string) {
      calls.push(table)
      if (table === 'accounts') {
        return mockChain(
          opts.accountExists
            ? { data: { id: 'acct_123' }, error: null }
            : { data: null, error: null },
        )
      }
      if (table === 'organization_members') {
        return mockChain(
          opts.membershipExists
            ? { data: { id: 'mem_456' }, error: null }
            : { data: null, error: null },
        )
      }
      if (table === 'participant_identity_links') {
        return {
          upsert() {
            return Promise.resolve({
              data: null,
              error: opts.upsertError ? { message: opts.upsertError } : null,
            })
          },
        }
      }
      if (table === 'audit_log') {
        return {
          insert(entry: Record<string, unknown>) {
            auditInserted = true
            auditAction = entry.action as string
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      return mockChain({ data: null, error: null })
    },
  } as any

  return { supabase, getAudit: () => ({ inserted: auditInserted, action: auditAction }), getCalls: () => calls }
}

const mockLedger = { id: 'ledger_1', organization_id: 'org_1' } as any
const mockReq = new Request('http://localhost/test')

Deno.test('linkParticipantToUser: rejects when participant not in ledger', async () => {
  const { supabase } = mockSupabaseForLink({ accountExists: false })

  const result = await linkParticipantToUser(
    supabase, mockLedger, 'p_foreign', 'u_1', 'provisioned', {}, mockReq,
  )

  assertEquals(result.error, 'Participant does not belong to this ledger')
})

Deno.test('linkParticipantToUser: succeeds when participant belongs to ledger', async () => {
  const { supabase } = mockSupabaseForLink({ accountExists: true, membershipExists: true })

  const result = await linkParticipantToUser(
    supabase, mockLedger, 'p_local', 'u_1', 'provisioned', {}, mockReq,
  )

  assertEquals(result.error, null)
})

Deno.test('linkParticipantToUser: returns upsert error when DB fails', async () => {
  const { supabase } = mockSupabaseForLink({ accountExists: true, upsertError: 'conflict' })

  const result = await linkParticipantToUser(
    supabase, mockLedger, 'p_local', 'u_1',
  )

  assertEquals(result.error, 'conflict')
})

Deno.test('linkParticipantToUser: queries accounts table for ownership check', async () => {
  const { supabase, getCalls } = mockSupabaseForLink({ accountExists: true, membershipExists: false })

  await linkParticipantToUser(supabase, mockLedger, 'p_local', 'u_1')

  const calls = getCalls()
  assertEquals(calls[0], 'accounts')
})

Deno.test('linkParticipantToUser: skips org membership lookup when no organization_id', async () => {
  const ledgerNoOrg = { id: 'ledger_1', organization_id: null } as any
  const { supabase, getCalls } = mockSupabaseForLink({ accountExists: true })

  await linkParticipantToUser(supabase, ledgerNoOrg, 'p_local', 'u_1')

  const calls = getCalls()
  assertEquals(calls.includes('organization_members'), false)
})
