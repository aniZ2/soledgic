import { describe, expect, it } from 'vitest'
import { summarizeIdentityPortfolio } from './identity'

describe('summarizeIdentityPortfolio', () => {
  it('aggregates balances and distinct ledgers correctly', () => {
    const summary = summarizeIdentityPortfolio([
      {
        linkId: 'link_1',
        participantId: 'creator_1',
        linkedUserId: '550e8400-e29b-41d4-a716-446655440000',
        linkedAt: '2026-03-13T00:00:00Z',
        ledgerId: 'ledger_a',
        ledgerName: 'Booklyverse',
        organizationId: 'org_1',
        organizationName: 'Osifo Labs',
        ledgerGroupId: null,
        livemode: false,
        name: 'Creator One',
        email: 'creator1@example.com',
        ledgerBalance: 120.55,
        heldAmount: 20.55,
        availableBalance: 100,
        currency: 'USD',
        linkSource: 'provisioned',
      },
      {
        linkId: 'link_2',
        participantId: 'creator_2',
        linkedUserId: '550e8400-e29b-41d4-a716-446655440000',
        linkedAt: '2026-03-13T00:00:00Z',
        ledgerId: 'ledger_b',
        ledgerName: 'Kinship Vault',
        organizationId: 'org_2',
        organizationName: 'Osifo Ventures',
        ledgerGroupId: null,
        livemode: true,
        name: 'Creator Two',
        email: 'creator2@example.com',
        ledgerBalance: 79.45,
        heldAmount: 4.45,
        availableBalance: 75,
        currency: 'USD',
        linkSource: 'manual',
      },
      {
        linkId: 'link_3',
        participantId: 'creator_3',
        linkedUserId: '550e8400-e29b-41d4-a716-446655440000',
        linkedAt: '2026-03-13T00:00:00Z',
        ledgerId: 'ledger_c',
        ledgerName: 'Vantage EU',
        organizationId: 'org_1',
        organizationName: 'Osifo Labs',
        ledgerGroupId: null,
        livemode: true,
        name: 'Creator Three',
        email: 'creator3@example.com',
        ledgerBalance: 10,
        heldAmount: 0,
        availableBalance: 10,
        currency: 'EUR',
        linkSource: 'manual',
      },
    ])

    expect(summary.participantCount).toBe(3)
    expect(summary.ledgerCount).toBe(3)
    expect(summary.organizationCount).toBe(2)
    expect(summary.totalsByCurrency).toEqual([
      {
        currency: 'EUR',
        participantCount: 1,
        ledgerCount: 1,
        ledgerBalance: 10,
        heldAmount: 0,
        availableBalance: 10,
      },
      {
        currency: 'USD',
        participantCount: 2,
        ledgerCount: 2,
        ledgerBalance: 200,
        heldAmount: 25,
        availableBalance: 175,
      },
    ])
  })
})
