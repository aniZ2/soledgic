import { describe, expect, it } from 'vitest'
import { isValidEcosystemSlug, slugifyEcosystemValue } from './ecosystems'

describe('ecosystem helpers', () => {
  it('slugifies ecosystem names into stable lowercase slugs', () => {
    expect(slugifyEcosystemValue(' Example Creator Stack ')).toBe('example-creator-stack')
  })

  it('validates normalized slugs only', () => {
    expect(isValidEcosystemSlug('example-network')).toBe(true)
    expect(isValidEcosystemSlug('Example Network')).toBe(false)
    expect(isValidEcosystemSlug('bad_slug')).toBe(false)
  })
})
