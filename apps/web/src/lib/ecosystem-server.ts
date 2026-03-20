import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveOrgId } from '@/lib/livemode-server'
import { asMembershipQueryClient, resolveActiveOrganizationMembershipForClient } from '@/lib/active-org'
import {
  type CurrentEcosystemSummary,
  type EcosystemPlatformSummary,
  isValidEcosystemSlug,
  slugifyEcosystemValue,
} from '@/lib/ecosystems'

type JsonRecord = Record<string, unknown>
type EcosystemRole = 'owner' | 'admin' | 'member'

interface OrganizationContext {
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationOwnerId: string | null
  organizationRole: string
  ecosystemId: string | null
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function isManageRole(role: string | null | undefined): role is 'owner' | 'admin' {
  return role === 'owner' || role === 'admin'
}

async function getUserEcosystemRole(
  supabase: SupabaseClient,
  ecosystemId: string,
  userId: string,
): Promise<EcosystemRole | null> {
  const { data: membership } = await supabase
    .from('ecosystem_memberships')
    .select('role')
    .eq('ecosystem_id', ecosystemId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  const role = asString(membership?.role)
  return role === 'owner' || role === 'admin' || role === 'member' ? role : null
}

export async function getCurrentOrganizationContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrganizationContext | null> {
  const membership = await resolveActiveOrganizationMembershipForClient(
    asMembershipQueryClient(supabase),
    userId,
    await getActiveOrgId(),
  )
  if (!membership) return null

  const { data } = await supabase
    .from('organizations')
    .select('id, name, slug, owner_id, ecosystem_id')
    .eq('id', membership.organization_id)
    .maybeSingle()

  const organization = asRecord(data)
  const organizationId = asString(organization?.id)
  const organizationName = asString(organization?.name)
  const organizationSlug = asString(organization?.slug)

  if (!organizationId || !organizationName || !organizationSlug) {
    return null
  }

  return {
    organizationId,
    organizationName,
    organizationSlug,
    organizationOwnerId: asString(organization?.owner_id),
    organizationRole: membership.role,
    ecosystemId: asString(organization?.ecosystem_id),
  }
}

export async function ensureEcosystemForOrganization(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    organizationName: string
    organizationSlug: string
    organizationOwnerId: string | null
    ecosystemId?: string | null
  },
): Promise<{
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  ownerId: string | null
}> {
  const orgSlug = slugifyEcosystemValue(input.organizationSlug) || `ecosystem-${input.organizationId.slice(0, 8)}`

  let ecosystem: {
    id: string
    name: string
    slug: string
    description: string | null
    status: string
    owner_id: string | null
  } | null = null

  if (input.ecosystemId) {
    const { data } = await supabase
      .from('ecosystems')
      .select('id, name, slug, description, status, owner_id')
      .eq('id', input.ecosystemId)
      .maybeSingle()

    if (data?.id) {
      ecosystem = {
        id: String(data.id),
        name: asString(data.name) || input.organizationName,
        slug: asString(data.slug) || orgSlug,
        description: asString(data.description),
        status: asString(data.status) || 'active',
        owner_id: asString(data.owner_id),
      }
    }
  }

  if (!ecosystem) {
    const { data: existing } = await supabase
      .from('ecosystems')
      .select('id, name, slug, description, status, owner_id')
      .eq('slug', orgSlug)
      .maybeSingle()

    if (existing?.id) {
      ecosystem = {
        id: String(existing.id),
        name: asString(existing.name) || input.organizationName,
        slug: asString(existing.slug) || orgSlug,
        description: asString(existing.description),
        status: asString(existing.status) || 'active',
        owner_id: asString(existing.owner_id),
      }
    }
  }

  if (!ecosystem) {
    const { data: created, error } = await supabase
      .from('ecosystems')
      .insert({
        name: input.organizationName,
        slug: orgSlug,
        owner_id: input.organizationOwnerId,
        description: `Primary ecosystem for ${input.organizationName}`,
        settings: {
          bootstrapped_from_organization_id: input.organizationId,
        },
      })
      .select('id, name, slug, description, status, owner_id')
      .single()

    if (error || !created?.id) {
      throw new Error(error?.message || 'Failed creating ecosystem')
    }

    ecosystem = {
      id: String(created.id),
      name: asString(created.name) || input.organizationName,
      slug: asString(created.slug) || orgSlug,
      description: asString(created.description),
      status: asString(created.status) || 'active',
      owner_id: asString(created.owner_id),
    }
  }

  if (input.organizationOwnerId) {
    await supabase
      .from('ecosystem_memberships')
      .upsert({
        ecosystem_id: ecosystem.id,
        user_id: input.organizationOwnerId,
        role: 'owner',
        status: 'active',
        metadata: {
          bootstrapped_from_organization_id: input.organizationId,
        },
      }, {
        onConflict: 'ecosystem_id,user_id',
      })
  }

  await supabase
    .from('organizations')
    .update({ ecosystem_id: ecosystem.id })
    .eq('id', input.organizationId)

  return {
    id: ecosystem.id,
    name: ecosystem.name,
    slug: ecosystem.slug,
    description: ecosystem.description,
    status: ecosystem.status,
    ownerId: ecosystem.owner_id,
  }
}

export async function getCurrentEcosystemForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentEcosystemSummary | null> {
  const organization = await getCurrentOrganizationContext(supabase, userId)
  if (!organization) {
    return null
  }

  const ecosystem = await ensureEcosystemForOrganization(supabase, {
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    organizationSlug: organization.organizationSlug,
    organizationOwnerId: organization.organizationOwnerId,
    ecosystemId: organization.ecosystemId,
  })

  const role =
    (await getUserEcosystemRole(supabase, ecosystem.id, userId)) ||
    (ecosystem.ownerId === userId ? 'owner' : null)

  const { data: platformsRaw } = await supabase
    .from('organizations')
    .select('id, name, slug, status, created_at')
    .eq('ecosystem_id', ecosystem.id)
    .order('created_at', { ascending: true })

  const platforms: EcosystemPlatformSummary[] = (platformsRaw || []).map((platform) => ({
    id: String(platform.id),
    name: asString(platform.name) || 'Untitled platform',
    slug: asString(platform.slug) || 'unknown',
    status: asString(platform.status) || 'active',
    createdAt: asString(platform.created_at),
  }))

  return {
    id: ecosystem.id,
    name: ecosystem.name,
    slug: ecosystem.slug,
    description: ecosystem.description,
    status: ecosystem.status,
    role,
    canManage: isManageRole(role),
    currentOrganizationId: organization.organizationId,
    platformCount: platforms.length,
    platforms,
  }
}

export async function updateCurrentEcosystemDetails(
  supabase: SupabaseClient,
  userId: string,
  input: {
    name?: string
    slug?: string
    description?: string | null
  },
): Promise<CurrentEcosystemSummary> {
  const current = await getCurrentEcosystemForUser(supabase, userId)
  if (!current) {
    throw new Error('No active organization found')
  }
  if (!current.canManage) {
    throw new Error('Only ecosystem owners and admins can update ecosystem settings')
  }

  const updates: Record<string, unknown> = {}

  if (typeof input.name === 'string' && input.name.trim().length > 0) {
    updates.name = input.name.trim().slice(0, 120)
  }

  if (typeof input.slug === 'string' && input.slug.trim().length > 0) {
    const slug = slugifyEcosystemValue(input.slug)
    if (!slug || !isValidEcosystemSlug(slug)) {
      throw new Error('Invalid ecosystem slug')
    }

    const { data: existing } = await supabase
      .from('ecosystems')
      .select('id')
      .eq('slug', slug)
      .neq('id', current.id)
      .maybeSingle()

    if (existing?.id) {
      throw new Error('That ecosystem slug is already in use')
    }

    updates.slug = slug
  }

  if (input.description !== undefined) {
    const description = typeof input.description === 'string' ? input.description.trim() : ''
    updates.description = description.length > 0 ? description.slice(0, 280) : null
  }

  if (Object.keys(updates).length === 0) {
    return current
  }

  const { error } = await supabase
    .from('ecosystems')
    .update(updates)
    .eq('id', current.id)

  if (error) {
    throw new Error(error.message || 'Failed to update ecosystem')
  }

  const refreshed = await getCurrentEcosystemForUser(supabase, userId)
  if (!refreshed) {
    throw new Error('Failed to load ecosystem after update')
  }

  return refreshed
}

export async function moveCurrentOrganizationToEcosystem(
  supabase: SupabaseClient,
  userId: string,
  targetSlugInput: string,
): Promise<CurrentEcosystemSummary> {
  const organization = await getCurrentOrganizationContext(supabase, userId)
  if (!organization) {
    throw new Error('No active organization found')
  }
  if (!isManageRole(organization.organizationRole)) {
    throw new Error('Only organization owners and admins can move a platform into another ecosystem')
  }

  const targetSlug = slugifyEcosystemValue(targetSlugInput)
  if (!targetSlug || !isValidEcosystemSlug(targetSlug)) {
    throw new Error('Invalid ecosystem slug')
  }

  const { data: target } = await supabase
    .from('ecosystems')
    .select('id, owner_id')
    .eq('slug', targetSlug)
    .maybeSingle()

  if (!target?.id) {
    throw new Error('Target ecosystem not found')
  }

  const targetRole =
    (await getUserEcosystemRole(supabase, String(target.id), userId)) ||
    (asString(target.owner_id) === userId ? 'owner' : null)

  if (!isManageRole(targetRole)) {
    throw new Error('You must be an owner or admin of the target ecosystem')
  }

  // Check if org already belongs to an ecosystem with active identity links
  const { data: currentOrg } = await supabase
    .from('organizations')
    .select('ecosystem_id')
    .eq('id', organization.organizationId)
    .single()

  if (currentOrg?.ecosystem_id && currentOrg.ecosystem_id !== String(target.id)) {
    // Check for participant identity links that could become orphaned
    const { data: orgLedgers } = await supabase
      .from('ledgers')
      .select('id')
      .eq('organization_id', organization.organizationId)

    const ledgerIds = (orgLedgers || []).map((l: { id: string }) => l.id)
    if (ledgerIds.length > 0) {
      const { count: linkCount } = await supabase
        .from('participant_identity_links')
        .select('id', { count: 'exact', head: true })
        .in('ledger_id', ledgerIds)
        .eq('status', 'active')

      if (linkCount && linkCount > 0) {
        throw new Error(
          `This organization has ${linkCount} active identity links in its current ecosystem. ` +
          'Transferring may orphan these links. Remove or migrate them first.',
        )
      }
    }
  }

  const { error } = await supabase
    .from('organizations')
    .update({ ecosystem_id: String(target.id) })
    .eq('id', organization.organizationId)

  if (error) {
    throw new Error(error.message || 'Failed to move platform into target ecosystem')
  }

  const refreshed = await getCurrentEcosystemForUser(supabase, userId)
  if (!refreshed) {
    throw new Error('Failed to load ecosystem after transfer')
  }

  return refreshed
}
