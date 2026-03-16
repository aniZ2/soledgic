import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  createParticipantResponse,
  getParticipantBalanceResponse,
} from '../participants-service.ts'

const ledger = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  organization_id: 'org_1',
  business_name: 'Test Platform',
  settings: {},
} as any

const req = new Request('https://example.com')
const requestId = 'req_test'

// ==========================================================================
// createParticipantResponse — input validation
// ==========================================================================

Deno.test('create participant: rejects invalid participant_id', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: '',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('create participant: rejects participant_id with special chars', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'bad id!@#',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('create participant: rejects invalid email format', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    email: 'not-an-email',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_email')
})

Deno.test('create participant: rejects invalid user_id (not UUID)', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    user_id: 'not-a-uuid',
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_user_id')
})

Deno.test('create participant: rejects split percent out of range', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    default_split_percent: 150,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_default_split_percent')
})

Deno.test('create participant: rejects negative split percent', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    default_split_percent: -10,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_default_split_percent')
})

Deno.test('create participant: rejects non-number split percent', async () => {
  const supabase = {} as any
  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'creator1',
    default_split_percent: 'fifty' as any,
  }, requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_default_split_percent')
})

Deno.test('create participant: returns 409 when participant already exists', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({ data: { id: 'acct_existing' }, error: null })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await createParticipantResponse(req, supabase, ledger, {
    participant_id: 'creator1',
  }, requestId)
  assertEquals(result.status, 409)
  assertEquals(result.body.error_code, 'participant_already_exists')
})

// ==========================================================================
// getParticipantBalanceResponse — input validation
// ==========================================================================

Deno.test('get participant balance: rejects invalid participant_id', async () => {
  const supabase = {} as any
  const result = await getParticipantBalanceResponse(req, supabase, ledger, '', requestId)
  assertEquals(result.status, 400)
  assertEquals(result.body.error_code, 'invalid_participant_id')
})

Deno.test('get participant balance: returns 404 when not found', async () => {
  const supabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        single() {
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        },
      }
    },
  } as any

  const result = await getParticipantBalanceResponse(req, supabase, ledger, 'creator999', requestId)
  assertEquals(result.status, 404)
  assertEquals(result.body.error_code, 'participant_not_found')
})

// ==========================================================================
// calculateBalance — tested via getParticipantBalanceResponse
// ==========================================================================

Deno.test('get participant balance: correctly computes balance from entries', async () => {
  const supabase = {
    from(table: string) {
      if (table === 'accounts') {
        return {
          select() { return this },
          eq() { return this },
          single() {
            return Promise.resolve({
              data: { id: 'acct_1', name: 'Creator Alice', entity_id: 'alice', metadata: {} },
              error: null,
            })
          },
        }
      }
      if (table === 'entries') {
        return {
          select() { return this },
          eq() { return this },
          not() {
            return Promise.resolve({
              data: [
                { entry_type: 'credit', amount: '100.00', transaction_id: 'tx1', transactions: { status: 'completed' } },
                { entry_type: 'debit', amount: '30.00', transaction_id: 'tx2', transactions: { status: 'completed' } },
                { entry_type: 'credit', amount: '50.00', transaction_id: 'tx3', transactions: { status: 'completed' } },
              ],
              error: null,
            })
          },
        }
      }
      if (table === 'held_funds') {
        const heldResult = {
          data: [
            { held_amount: '20.00', released_amount: '5.00', hold_reason: 'review', release_eligible_at: null, status: 'held' },
          ],
          error: null,
        }
        const chainable: any = {
          select() { return chainable },
          eq() { return chainable },
          in() { return chainable },
          then: (resolve: any) => resolve(heldResult),
        }
        return chainable
      }
      if (table === 'participant_identity_links') {
        return {
          select() { return this },
          eq() { return this },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      return { select() { return this }, eq() { return this } }
    },
  } as any

  const result = await getParticipantBalanceResponse(req, supabase, ledger, 'alice', requestId)
  assertEquals(result.status, 200)
  assertEquals(result.body.success, true)

  const participant = result.body.participant as Record<string, unknown>
  // Balance: +100 - 30 + 50 = 120
  assertEquals(participant.ledger_balance, 120)
  // Held: 20 - 5 = 15
  assertEquals(participant.held_amount, 15)
  // Available: 120 - 15 = 105
  assertEquals(participant.available_balance, 105)
})
