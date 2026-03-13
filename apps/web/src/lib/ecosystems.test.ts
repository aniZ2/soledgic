import { describe, expect, it } from 'vitest'
import { isValidEcosystemSlug, slugifyEcosystemValue } from './ecosystems'

describe('ecosystem helpers', () => {
  it('slugifies ecosystem names into stable lowercase slugs', () => {
    expect(slugifyEcosystemValue(' Osifo Creator Stack ')).toBe('osifo-creator-stack')
  })

  it('validates normalized slugs only', () => {
    expect(isValidEcosystemSlug('booklyverse-network')).toBe(true)
    expect(isValidEcosystemSlug('Booklyverse Network')).toBe(false)
    expect(isValidEcosystemSlug('bad_slug')).toBe(false)
  })
})
