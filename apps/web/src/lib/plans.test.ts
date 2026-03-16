import { describe, expect, it } from 'vitest'
import { FUTURE_PRICING_SUGGESTION, PLANS, getPlanConfig } from './plans'

describe('getPlanConfig', () => {
  it('returns the active plan for "pro"', () => {
    const config = getPlanConfig('pro')
    expect(config).toBeDefined()
    expect(config!.name).toBe('Free')
    expect(config!.price_monthly).toBe(0)
  })

  it('falls back to FUTURE_PRICING_SUGGESTION for "business"', () => {
    const config = getPlanConfig('business')
    expect(config).toBeDefined()
    expect(config!.name).toBe('Business')
  })

  it('falls back to FUTURE_PRICING_SUGGESTION for "scale"', () => {
    const config = getPlanConfig('scale')
    expect(config).toBeDefined()
    expect(config!.contact_sales).toBe(true)
  })

  it('returns undefined for unknown plan IDs', () => {
    expect(getPlanConfig('nonexistent')).toBeUndefined()
    expect(getPlanConfig('')).toBeUndefined()
  })

  it('prefers active PLANS over FUTURE_PRICING_SUGGESTION', () => {
    // "pro" exists in both — PLANS should win
    const config = getPlanConfig('pro')
    expect(config).toBe(PLANS['pro'])
    expect(config).not.toBe(FUTURE_PRICING_SUGGESTION['pro'])
  })
})

describe('PLANS', () => {
  it('pro plan has overage pricing fields', () => {
    const pro = PLANS['pro']
    expect(pro.overage_ledger_price_monthly).toBe(2000)
    expect(pro.overage_team_member_price_monthly).toBe(2000)
    expect(pro.overage_transaction_price).toBe(2)
  })
})
