import { describe, expect, it } from 'vitest'
import { getIdentityPortfolioForUser } from './identity-server'
import { createMockSupabase } from './test-support/mock-supabase'

describe('identity-server', () => {
  it('aggregates one identity linked across two platforms in the same ecosystem', async () => {
    const db = {
      participant_identity_links: [
        {
          id: 'link_alpha',
          ledger_id: 'ledger_alpha_test',
          participant_id: 'participant_alpha',
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          link_source: 'manual',
          linked_at: '2026-03-13T08:00:00Z',
          status: 'active',
          ledgers: {
            id: 'ledger_alpha_test',
            business_name: 'Platform Alpha Test',
            organization_id: 'org_alpha',
            ledger_group_id: 'group_alpha',
            livemode: false,
            default_currency: 'USD',
          },
        },
        {
          id: 'link_beta',
          ledger_id: 'ledger_beta_test',
          participant_id: 'participant_beta',
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          link_source: 'provisioned',
          linked_at: '2026-03-13T08:01:00Z',
          status: 'active',
          ledgers: {
            id: 'ledger_beta_test',
            business_name: 'Platform Beta Test',
            organization_id: 'org_beta',
            ledger_group_id: 'group_beta',
            livemode: false,
            default_currency: 'USD',
          },
        },
      ],
      accounts: [
        {
          ledger_id: 'ledger_alpha_test',
          entity_id: 'participant_alpha',
          account_type: 'creator_balance',
          name: 'Platform Alpha Creator',
          balance: 125.5,
          currency: 'USD',
          metadata: { email: 'alpha@example.com' },
        },
        {
          ledger_id: 'ledger_beta_test',
          entity_id: 'participant_beta',
          account_type: 'creator_balance',
          name: 'Platform Beta Creator',
          balance: 80,
          currency: 'USD',
          metadata: { email: 'beta@example.com' },
        },
      ],
      held_funds: [
        {
          ledger_id: 'ledger_alpha_test',
          creator_id: 'participant_alpha',
          held_amount: 25.5,
          released_amount: 0,
          status: 'held',
        },
        {
          ledger_id: 'ledger_beta_test',
          creator_id: 'participant_beta',
          held_amount: 10,
          released_amount: 2,
          status: 'partial',
        },
      ],
      organizations: [
        {
          id: 'org_alpha',
          name: 'Platform Alpha',
          ecosystem_id: 'eco_shared',
          ecosystem: {
            id: 'eco_shared',
            name: 'Example Platform Stack',
            slug: 'example-platform-stack',
          },
        },
        {
          id: 'org_beta',
          name: 'Platform Beta',
          ecosystem_id: 'eco_shared',
          ecosystem: {
            id: 'eco_shared',
            name: 'Example Platform Stack',
            slug: 'example-platform-stack',
          },
        },
      ],
    }

    const supabase = createMockSupabase(db as any)
    const portfolio = await getIdentityPortfolioForUser(
      supabase as any,
      '550e8400-e29b-41d4-a716-446655440000',
    )

    expect(portfolio.participants).toHaveLength(2)
    expect(portfolio.summary).toEqual({
      participantCount: 2,
      ledgerCount: 2,
      organizationCount: 2,
      ecosystemCount: 1,
      totalsByCurrency: [
        {
          currency: 'USD',
          participantCount: 2,
          ledgerCount: 2,
          ledgerBalance: 205.5,
          heldAmount: 33.5,
          availableBalance: 172,
        },
      ],
    })
    expect(portfolio.participants.map((participant) => participant.ecosystemSlug)).toEqual([
      'example-platform-stack',
      'example-platform-stack',
    ])
  })
})
