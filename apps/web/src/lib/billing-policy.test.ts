import { describe, expect, it } from 'vitest'
import {
  isAutoChargeEnabled,
  isBillingBypassed,
  parseBillingSettings,
  resolveBillingMode,
} from './billing-policy'

describe('billing policy', () => {
  it('defaults to self-serve when settings are missing', () => {
    const settings = parseBillingSettings(null)

    expect(resolveBillingMode(settings)).toBe('self_serve')
    expect(isAutoChargeEnabled(settings)).toBe(true)
    expect(isBillingBypassed(settings)).toBe(false)
  })

  it('treats internal mode as a hard bypass', () => {
    const settings = parseBillingSettings({
      pricing_mode: 'internal',
      billing_bypass: true,
    })

    expect(resolveBillingMode(settings)).toBe('internal')
    expect(isAutoChargeEnabled(settings)).toBe(false)
    expect(isBillingBypassed(settings)).toBe(true)
  })

  it('keeps custom mode operator-managed without bypass semantics', () => {
    const settings = parseBillingSettings({
      pricing_mode: 'custom',
    })

    expect(resolveBillingMode(settings)).toBe('custom')
    expect(isAutoChargeEnabled(settings)).toBe(false)
    expect(isBillingBypassed(settings)).toBe(false)
  })
})
