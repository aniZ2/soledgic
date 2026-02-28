'use server'

import { createClient } from '@/lib/supabase/server'
import { provisionOrganizationWithLedgers } from '@/lib/org-provisioning'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export async function createOrganizationWithLedger(input: {
  orgName: string
  selectedPlan: string
  ledgerName: string
  ledgerMode: 'standard' | 'marketplace'
}) {
  const supabase = await createClient()

  const { orgName, ledgerName, ledgerMode } = input

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    if (process.env.AUTH_DEBUG_LOGS === 'true') {
      console.warn('[onboarding action] auth unavailable', { status: authError?.status ?? null })
    }
    return { error: 'Not authenticated' }
  }
  const userId = user.id

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  try {
    const data = await provisionOrganizationWithLedgers({
      userId,
      userEmail: user.email,
      organizationName: orgName,
      organizationSlug: slug,
      ledgerName,
      ledgerMode,
    })
    return { success: true, data }
  } catch (error: unknown) {
    return { error: getErrorMessage(error, 'Failed to create organization') }
  }
}
