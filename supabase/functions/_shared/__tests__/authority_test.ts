import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { canOverride, toAuthorityLevel } from '../authority.ts'

// ============================================================================
// canOverride — 9 combinations (3x3 matrix)
// ============================================================================

// soledgic_system can override everything
Deno.test('canOverride: soledgic_system >= soledgic_system', () => {
  assertEquals(canOverride('soledgic_system', 'soledgic_system'), true)
})
Deno.test('canOverride: soledgic_system >= org_operator', () => {
  assertEquals(canOverride('soledgic_system', 'org_operator'), true)
})
Deno.test('canOverride: soledgic_system >= platform_api', () => {
  assertEquals(canOverride('soledgic_system', 'platform_api'), true)
})

// org_operator can override itself and platform_api
Deno.test('canOverride: org_operator < soledgic_system', () => {
  assertEquals(canOverride('org_operator', 'soledgic_system'), false)
})
Deno.test('canOverride: org_operator >= org_operator', () => {
  assertEquals(canOverride('org_operator', 'org_operator'), true)
})
Deno.test('canOverride: org_operator >= platform_api', () => {
  assertEquals(canOverride('org_operator', 'platform_api'), true)
})

// platform_api can only override itself
Deno.test('canOverride: platform_api < soledgic_system', () => {
  assertEquals(canOverride('platform_api', 'soledgic_system'), false)
})
Deno.test('canOverride: platform_api < org_operator', () => {
  assertEquals(canOverride('platform_api', 'org_operator'), false)
})
Deno.test('canOverride: platform_api >= platform_api', () => {
  assertEquals(canOverride('platform_api', 'platform_api'), true)
})

// ============================================================================
// toAuthorityLevel — parsing and defaults
// ============================================================================

Deno.test('toAuthorityLevel: valid values pass through', () => {
  assertEquals(toAuthorityLevel('soledgic_system'), 'soledgic_system')
  assertEquals(toAuthorityLevel('org_operator'), 'org_operator')
  assertEquals(toAuthorityLevel('platform_api'), 'platform_api')
})

Deno.test('toAuthorityLevel: null/undefined defaults to platform_api', () => {
  assertEquals(toAuthorityLevel(null), 'platform_api')
  assertEquals(toAuthorityLevel(undefined), 'platform_api')
})

Deno.test('toAuthorityLevel: unknown string defaults to platform_api', () => {
  assertEquals(toAuthorityLevel('admin'), 'platform_api')
  assertEquals(toAuthorityLevel(''), 'platform_api')
})
