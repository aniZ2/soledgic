import { provisionOrganizationWithLedgers, type ProvisionLedgerMode } from '@/lib/org-provisioning'
import { buildDefaultBillingSettingsForOwner, isPrimarySoledgicOwnerEmail } from '@/lib/internal-platforms'
import { createServiceRoleClient } from '@/lib/supabase/service'

interface PrimaryOwnerUser {
  id: string
  email: string | null | undefined
}

function getPrimaryOwnerProvisioningConfig() {
  const organizationName = (process.env.SOLEDGIC_PLATFORM_ORG_NAME || 'Soledgic Platform').trim() || 'Soledgic Platform'
  const organizationSlug = (process.env.SOLEDGIC_PLATFORM_ORG_SLUG || 'soledgic-platform').trim() || 'soledgic-platform'
  const ledgerName = (process.env.SOLEDGIC_PLATFORM_LEDGER_NAME || organizationName).trim() || organizationName
  const ledgerModeRaw = (process.env.SOLEDGIC_PLATFORM_LEDGER_MODE || 'marketplace').trim().toLowerCase()
  const ledgerMode: ProvisionLedgerMode = ledgerModeRaw === 'standard' ? 'standard' : 'marketplace'

  return {
    organizationName,
    organizationSlug,
    ledgerName,
    ledgerMode,
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPrimaryOwnerSlugConflict(error: unknown, organizationSlug: string): boolean {
  return getErrorMessage(error).includes(`Organization slug "${organizationSlug}" is already taken`)
}

async function adoptPrimaryOwnerWorkspace(user: PrimaryOwnerUser, config: ReturnType<typeof getPrimaryOwnerProvisioningConfig>) {
  const supabase = createServiceRoleClient()
  const { data: existing, error } = await supabase
    .from('organizations')
    .select('id, name, owner_id, settings')
    .eq('slug', config.organizationSlug)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed loading Soledgic platform workspace: ${error.message}`)
  }

  if (!existing?.id) {
    return false
  }

  const currentSettings = isJsonObject(existing.settings) ? existing.settings : {}
  const nextSettings = {
    ...currentSettings,
    billing: buildDefaultBillingSettingsForOwner(user.email),
  }

  const updatePayload: Record<string, unknown> = {
    owner_id: user.id,
    settings: nextSettings,
  }

  if (typeof existing.name !== 'string' || existing.name.trim() !== config.organizationName) {
    updatePayload.name = config.organizationName
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update(updatePayload)
    .eq('id', existing.id)

  if (updateError) {
    throw new Error(`Failed claiming Soledgic platform workspace: ${updateError.message}`)
  }

  return true
}

export async function maybeProvisionPrimaryOwnerWorkspace(user: PrimaryOwnerUser) {
  if (!user.id || !isPrimarySoledgicOwnerEmail(user.email)) {
    return null
  }

  const config = getPrimaryOwnerProvisioningConfig()
  const input = {
    userId: user.id,
    userEmail: user.email || undefined,
    organizationName: config.organizationName,
    organizationSlug: config.organizationSlug,
    ledgerName: config.ledgerName,
    ledgerMode: config.ledgerMode,
    reuseIfSlugExists: true as const,
  }

  try {
    return await provisionOrganizationWithLedgers(input)
  } catch (error) {
    if (!isPrimaryOwnerSlugConflict(error, config.organizationSlug)) {
      throw error
    }

    const adopted = await adoptPrimaryOwnerWorkspace(user, config)
    if (!adopted) {
      throw error
    }

    return provisionOrganizationWithLedgers(input)
  }
}
