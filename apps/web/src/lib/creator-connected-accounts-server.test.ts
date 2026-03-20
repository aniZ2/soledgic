import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  listCreatorConnectedAccountsForIdentity,
} from './creator-connected-accounts-server'
import { createMockSupabase, type MockDb } from './test-support/mock-supabase'

describe('creator-connected-accounts-server', () => {
  it('syncs connected accounts from participant identity links', async () => {
    const db: MockDb = {
      participant_identity_links: [
        {
          ledger_id: 'ledger_alpha',
          participant_id: 'creator_alpha',
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'active',
          linked_at: '2026-03-20T15:00:00Z',
        },
      ],
      accounts: [
        {
          ledger_id: 'ledger_alpha',
          entity_id: 'creator_alpha',
          account_type: 'creator_balance',
          name: 'Creator Alpha',
          metadata: { email: 'alpha@example.com' },
        },
      ],
      connected_accounts: [],
    }

    const supabase = createMockSupabase(db) as unknown as SupabaseClient
    const rows = await listCreatorConnectedAccountsForIdentity(
      supabase,
      '550e8400-e29b-41d4-a716-446655440000',
      'alpha@example.com',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ledger_id: 'ledger_alpha',
      entity_id: 'creator_alpha',
      display_name: 'Creator Alpha',
      email: 'alpha@example.com',
      created_by: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(db.connected_accounts).toHaveLength(1)
    expect(db.connected_accounts[0]).toMatchObject({
      ledger_id: 'ledger_alpha',
      entity_id: 'creator_alpha',
      entity_type: 'creator',
      display_name: 'Creator Alpha',
      email: 'alpha@example.com',
      created_by: '550e8400-e29b-41d4-a716-446655440000',
    })
  })

  it('falls back to email-based connected accounts when no identity links exist', async () => {
    const db: MockDb = {
      connected_accounts: [
        {
          id: 'ca_legacy',
          ledger_id: 'ledger_legacy',
          entity_id: 'creator_legacy',
          entity_type: 'creator',
          display_name: 'Legacy Creator',
          email: 'legacy@example.com',
          payouts_enabled: false,
          is_active: true,
          created_at: '2026-03-20T15:05:00Z',
        },
      ],
    }

    const supabase = createMockSupabase(db) as unknown as SupabaseClient
    const rows = await listCreatorConnectedAccountsForIdentity(
      supabase,
      '550e8400-e29b-41d4-a716-446655440999',
      'legacy@example.com',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'ca_legacy',
      ledger_id: 'ledger_legacy',
      entity_id: 'creator_legacy',
      email: 'legacy@example.com',
      display_name: 'Legacy Creator',
    })
  })
})
