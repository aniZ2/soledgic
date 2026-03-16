import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_OPTIONS,
  formatCurrency,
  fromMinorUnits,
  getCurrencyInfo,
  toMinorUnits,
} from './currencies'

describe('getCurrencyInfo', () => {
  it('returns the correct currency for a known code', () => {
    expect(getCurrencyInfo('EUR')).toBe(CURRENCIES.EUR)
    expect(getCurrencyInfo('JPY')).toBe(CURRENCIES.JPY)
  })

  it('falls back to USD for unknown codes', () => {
    expect(getCurrencyInfo('XYZ')).toBe(CURRENCIES.USD)
    expect(getCurrencyInfo('')).toBe(CURRENCIES.USD)
  })
})

describe('formatCurrency', () => {
  it('formats cents to dollars by default (asMinorUnits = true)', () => {
    const result = formatCurrency(1050, 'USD')
    expect(result).toBe('$10.50')
  })

  it('formats major units when asMinorUnits is false', () => {
    const result = formatCurrency(10.5, 'USD', { asMinorUnits: false })
    expect(result).toBe('$10.50')
  })

  it('handles zero-decimal currencies (JPY)', () => {
    const result = formatCurrency(1500, 'JPY')
    // JPY has 0 decimals, so 1500 minor units = 1500 yen
    expect(result).toContain('1,500')
  })

  it('appends currency code when showCode is true', () => {
    const result = formatCurrency(1000, 'EUR', { showCode: true })
    expect(result).toContain('EUR')
  })

  it('defaults to USD when no currency code is given', () => {
    const result = formatCurrency(500)
    expect(result).toBe('$5.00')
  })

  it('falls back to USD for unknown currency codes', () => {
    const result = formatCurrency(100, 'UNKNOWN')
    expect(result).toBe('$1.00')
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })

  it('formats negative amounts', () => {
    const result = formatCurrency(-500, 'USD')
    expect(result).toContain('5.00')
  })
})

describe('toMinorUnits', () => {
  it('converts dollars to cents', () => {
    expect(toMinorUnits(10.50, 'USD')).toBe(1050)
  })

  it('rounds to nearest integer', () => {
    expect(toMinorUnits(10.999, 'USD')).toBe(1100)
    expect(toMinorUnits(10.001, 'USD')).toBe(1000)
  })

  it('handles zero-decimal currencies', () => {
    expect(toMinorUnits(1500, 'JPY')).toBe(1500)
  })

  it('defaults to USD', () => {
    expect(toMinorUnits(1)).toBe(100)
  })
})

describe('fromMinorUnits', () => {
  it('converts cents to dollars', () => {
    expect(fromMinorUnits(1050, 'USD')).toBe(10.5)
  })

  it('handles zero-decimal currencies', () => {
    expect(fromMinorUnits(1500, 'JPY')).toBe(1500)
  })

  it('defaults to USD', () => {
    expect(fromMinorUnits(100)).toBe(1)
  })
})

describe('CURRENCY_OPTIONS', () => {
  it('has one entry per currency', () => {
    expect(CURRENCY_OPTIONS).toHaveLength(Object.keys(CURRENCIES).length)
  })

  it('each option has value, label, symbol, and name', () => {
    for (const option of CURRENCY_OPTIONS) {
      expect(option).toHaveProperty('value')
      expect(option).toHaveProperty('label')
      expect(option).toHaveProperty('symbol')
      expect(option).toHaveProperty('name')
    }
  })
})
