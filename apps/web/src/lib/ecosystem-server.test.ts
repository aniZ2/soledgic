import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  ensureEcosystemForOrganization,
  getCurrentEcosystemForUser,
} from './ecosystem-server'
import { createMockSupabase, type MockDb } from './test-support/mock-supabase'

describe('ecosystem-server', () => {
  it('bootstraps a new ecosystem for an organization without one', async () => {
    const db: MockDb = {
      ecosystems: [],
      ecosystem_memberships: [],
      organizations: [
        {
          id: 'org_alpha',
          name: 'Platform Alpha',
          slug: 'platform-alpha',
          owner_id: 'user_1',
          ecosystem_id: null,
          status: 'active',
          created_at: '2026-03-13T08:00:00Z',
        },
      ],
    }

    const supabase = createMockSupabase(db) as unknown as SupabaseClient
    const ecosystem = await ensureEcosystemForOrganization(supabase, {
      organizationId: 'org_alpha',
      organizationName: 'Platform Alpha',
      organizationSlug: 'platform-alpha',
      organizationOwnerId: 'user_1',
      ecosystemId: null,
    })

    expect(ecosystem.slug).toBe('platform-alpha')
    expect(db.organizations[0].ecosystem_id).toBe(ecosystem.id)
    expect(db.ecosystem_memberships).toContainEqual(
      expect.objectContaining({
        ecosystem_id: ecosystem.id,
        user_id: 'user_1',
        role: 'owner',
        status: 'active',
      }),
    )
  })

  it('returns two platforms under the same current ecosystem', async () => {
    const db: MockDb = {
      organization_members: [
        {
          id: 'membership_alpha',
          user_id: 'user_1',
          status: 'active',
          role: 'owner',
          organization: {
            id: 'org_alpha',
            name: 'Platform Alpha',
            slug: 'platform-alpha',
            owner_id: 'user_1',
            ecosystem_id: 'eco_shared',
          },
        },
      ],
      ecosystems: [
        {
          id: 'eco_shared',
          name: 'Example Platform Stack',
          slug: 'example-platform-stack',
          description: 'Shared ecosystem for multi-platform verification',
          status: 'active',
          owner_id: 'user_1',
        },
      ],
      ecosystem_memberships: [
        {
          ecosystem_id: 'eco_shared',
          user_id: 'user_1',
          role: 'owner',
          status: 'active',
        },
      ],
      organizations: [
        {
          id: 'org_alpha',
          name: 'Platform Alpha',
          slug: 'platform-alpha',
          status: 'active',
          ecosystem_id: 'eco_shared',
          created_at: '2026-03-13T08:00:00Z',
        },
        {
          id: 'org_beta',
          name: 'Platform Beta',
          slug: 'platform-beta',
          status: 'active',
          ecosystem_id: 'eco_shared',
          created_at: '2026-03-13T08:01:00Z',
        },
      ],
    }

    const supabase = createMockSupabase(db) as unknown as SupabaseClient
    const summary = await getCurrentEcosystemForUser(supabase, 'user_1')

    expect(summary).toEqual(
      expect.objectContaining({
        id: 'eco_shared',
        name: 'Example Platform Stack',
        role: 'owner',
        canManage: true,
        currentOrganizationId: 'org_alpha',
        platformCount: 2,
      }),
    )
    expect(summary?.platforms).toEqual([
      expect.objectContaining({ id: 'org_alpha', slug: 'platform-alpha' }),
      expect.objectContaining({ id: 'org_beta', slug: 'platform-beta' }),
    ])
  })
})
