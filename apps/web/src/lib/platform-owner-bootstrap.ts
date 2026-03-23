import { provisionOrganizationWithLedgers, type ProvisionLedgerMode } from '@/lib/org-provisioning'
import { isPrimarySoledgicOwnerEmail } from '@/lib/internal-platforms'

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

export async function maybeProvisionPrimaryOwnerWorkspace(user: PrimaryOwnerUser) {
  if (!user.id || !isPrimarySoledgicOwnerEmail(user.email)) {
    return null
  }

  const config = getPrimaryOwnerProvisioningConfig()
  const provisioned = await provisionOrganizationWithLedgers({
    userId: user.id,
    userEmail: user.email || undefined,
    organizationName: config.organizationName,
    organizationSlug: config.organizationSlug,
    ledgerName: config.ledgerName,
    ledgerMode: config.ledgerMode,
    reuseIfSlugExists: true,
  })

  return provisioned
}
