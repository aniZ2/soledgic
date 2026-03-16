import { describe, expect, it } from 'vitest'
import {
  canCreateLiveLedger,
  canAddTeamMember,
  isOverLedgerLimit,
  isOverTeamMemberLimit,
  type EntitlementOrg,
  type TeamEntitlementOrg,
} from './entitlements'

function makeOrg(overrides: Partial<EntitlementOrg> = {}): EntitlementOrg {
  return {
    status: 'active',
    max_ledgers: 1,
    current_ledger_count: 0,
    plan: 'pro',
    settings: null,
    ...overrides,
  }
}

function makeTeamOrg(overrides: Partial<TeamEntitlementOrg> = {}): TeamEntitlementOrg {
  return {
    status: 'active',
    plan: 'pro',
    max_team_members: 1,
    current_member_count: 0,
    settings: null,
    ...overrides,
  }
}

describe('canCreateLiveLedger', () => {
  it('allows active org under ledger limit', () => {
    const result = canCreateLiveLedger(makeOrg())
    expect(result).toEqual({ allowed: true })
  })

  it('blocks past_due org', () => {
    const result = canCreateLiveLedger(makeOrg({ status: 'past_due' }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('payment_past_due')
      expect(result.httpStatus).toBe(402)
    }
  })

  it('blocks canceled org', () => {
    const result = canCreateLiveLedger(makeOrg({ status: 'canceled' }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('subscription_canceled')
      expect(result.httpStatus).toBe(403)
    }
  })

  it('requires billing method when at or over ledger limit (self_serve)', () => {
    const result = canCreateLiveLedger(
      makeOrg({
        max_ledgers: 1,
        current_ledger_count: 1,
        settings: { billing: {} },
      })
    )
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('billing_method_required')
    }
  })

  it('allows over limit when billing method exists', () => {
    const result = canCreateLiveLedger(
      makeOrg({
        max_ledgers: 1,
        current_ledger_count: 5,
        settings: { billing: { payment_method_id: 'pm_123' } },
      })
    )
    expect(result).toEqual({ allowed: true })
  })

  it('allows unlimited ledgers (max_ledgers = -1) without billing method', () => {
    const result = canCreateLiveLedger(
      makeOrg({
        max_ledgers: -1,
        current_ledger_count: 100,
        settings: { billing: {} },
      })
    )
    expect(result).toEqual({ allowed: true })
  })

  it('bypasses all checks for internal billing', () => {
    const result = canCreateLiveLedger(
      makeOrg({
        status: 'past_due',
        settings: { billing: { pricing_mode: 'internal', billing_bypass: true } },
      })
    )
    expect(result).toEqual({ allowed: true })
  })

  it('allows trialing org', () => {
    const result = canCreateLiveLedger(makeOrg({ status: 'trialing' }))
    expect(result).toEqual({ allowed: true })
  })

  it('skips billing method check for custom pricing mode', () => {
    const result = canCreateLiveLedger(
      makeOrg({
        max_ledgers: 1,
        current_ledger_count: 5,
        settings: { billing: { pricing_mode: 'custom' } },
      })
    )
    expect(result).toEqual({ allowed: true })
  })

  it('treats whitespace-only payment_method_id as missing', () => {
    const result = canCreateLiveLedger(
      makeOrg({
        max_ledgers: 1,
        current_ledger_count: 1,
        settings: { billing: { payment_method_id: '   ' } },
      })
    )
    expect(result.allowed).toBe(false)
  })
})

describe('isOverLedgerLimit', () => {
  it('returns false when under limit', () => {
    expect(isOverLedgerLimit(makeOrg({ max_ledgers: 3, current_ledger_count: 2 }))).toBe(false)
  })

  it('returns false when at limit (uses > not >=)', () => {
    expect(isOverLedgerLimit(makeOrg({ max_ledgers: 3, current_ledger_count: 3 }))).toBe(false)
  })

  it('returns true when over limit', () => {
    expect(isOverLedgerLimit(makeOrg({ max_ledgers: 3, current_ledger_count: 4 }))).toBe(true)
  })

  it('returns false for unlimited (-1)', () => {
    expect(isOverLedgerLimit(makeOrg({ max_ledgers: -1, current_ledger_count: 999 }))).toBe(false)
  })
})

describe('canAddTeamMember', () => {
  it('allows active org under member limit', () => {
    const result = canAddTeamMember(makeTeamOrg())
    expect(result).toEqual({ allowed: true })
  })

  it('blocks past_due org', () => {
    const result = canAddTeamMember(makeTeamOrg({ status: 'past_due' }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('payment_past_due')
      expect(result.httpStatus).toBe(402)
    }
  })

  it('blocks canceled org', () => {
    const result = canAddTeamMember(makeTeamOrg({ status: 'canceled' }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('subscription_canceled')
      expect(result.httpStatus).toBe(403)
    }
  })

  it('requires billing method when at member limit', () => {
    const result = canAddTeamMember(
      makeTeamOrg({
        max_team_members: 1,
        current_member_count: 1,
        settings: { billing: {} },
      })
    )
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.code).toBe('billing_method_required')
    }
  })

  it('allows over limit when billing method exists', () => {
    const result = canAddTeamMember(
      makeTeamOrg({
        max_team_members: 1,
        current_member_count: 10,
        settings: { billing: { payment_method_id: 'pm_abc' } },
      })
    )
    expect(result).toEqual({ allowed: true })
  })

  it('allows unlimited members (max_team_members = -1)', () => {
    const result = canAddTeamMember(
      makeTeamOrg({ max_team_members: -1, current_member_count: 100 })
    )
    expect(result).toEqual({ allowed: true })
  })

  it('bypasses all checks for internal billing', () => {
    const result = canAddTeamMember(
      makeTeamOrg({
        status: 'canceled',
        settings: { billing: { pricing_mode: 'internal', billing_bypass: true } },
      })
    )
    expect(result).toEqual({ allowed: true })
  })
})

describe('isOverTeamMemberLimit', () => {
  it('returns false when under limit', () => {
    expect(isOverTeamMemberLimit(makeTeamOrg({ max_team_members: 5, current_member_count: 3 }))).toBe(false)
  })

  it('returns false when at limit (uses > not >=)', () => {
    expect(isOverTeamMemberLimit(makeTeamOrg({ max_team_members: 5, current_member_count: 5 }))).toBe(false)
  })

  it('returns true when over limit', () => {
    expect(isOverTeamMemberLimit(makeTeamOrg({ max_team_members: 5, current_member_count: 6 }))).toBe(true)
  })

  it('returns false for unlimited (-1)', () => {
    expect(isOverTeamMemberLimit(makeTeamOrg({ max_team_members: -1, current_member_count: 999 }))).toBe(false)
  })
})
