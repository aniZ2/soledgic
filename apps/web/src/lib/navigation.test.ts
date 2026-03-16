import { describe, expect, it } from 'vitest'
import {
  dashboardNavigation,
  dashboardNavigationFlat,
  creatorPortalNavigation,
  creatorPortalNavigationFlat,
} from './navigation'

describe('dashboardNavigation', () => {
  it('has multiple sections', () => {
    expect(dashboardNavigation.length).toBeGreaterThan(1)
  })

  it('each section has items array', () => {
    for (const section of dashboardNavigation) {
      expect(Array.isArray(section.items)).toBe(true)
      expect(section.items.length).toBeGreaterThan(0)
    }
  })

  it('each item has name, href, and icon', () => {
    for (const section of dashboardNavigation) {
      for (const item of section.items) {
        expect(typeof item.name).toBe('string')
        expect(typeof item.href).toBe('string')
        expect(item.icon).toBeDefined()
      }
    }
  })

  it('has no duplicate hrefs', () => {
    const hrefs = dashboardNavigationFlat.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe('dashboardNavigationFlat', () => {
  it('is the flattened list of all sections', () => {
    const totalItems = dashboardNavigation.reduce((sum, s) => sum + s.items.length, 0)
    expect(dashboardNavigationFlat).toHaveLength(totalItems)
  })

  it('includes Dashboard and Settings', () => {
    const names = dashboardNavigationFlat.map((i) => i.name)
    expect(names).toContain('Dashboard')
    expect(names).toContain('Settings')
  })
})

describe('creatorPortalNavigation', () => {
  it('has at least one section', () => {
    expect(creatorPortalNavigation.length).toBeGreaterThan(0)
  })

  it('all hrefs start with /creator', () => {
    for (const section of creatorPortalNavigation) {
      for (const item of section.items) {
        expect(item.href).toMatch(/^\/creator/)
      }
    }
  })
})

describe('creatorPortalNavigationFlat', () => {
  it('is the flattened list of creator portal sections', () => {
    const totalItems = creatorPortalNavigation.reduce((sum, s) => sum + s.items.length, 0)
    expect(creatorPortalNavigationFlat).toHaveLength(totalItems)
  })
})
