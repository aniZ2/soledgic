'use server'

import { createClient } from '@/lib/supabase/server'

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

  const effectivePlan = 'pro'
  const planData = { ledgers: 1, team_members: 1 }
  const trialEndsAt = new Date()

  const { data, error: rpcError } = await supabase.rpc('create_organization_with_ledger', {
    p_user_id: userId,
    p_org_name: orgName,
    p_org_slug: slug,
    p_plan: effectivePlan,
    p_trial_ends_at: trialEndsAt.toISOString(),
    p_max_ledgers: planData.ledgers,
    p_max_team_members: planData.team_members,
    p_ledger_name: ledgerName,
    p_ledger_mode: ledgerMode,
  })

  if (rpcError) {
    return { error: rpcError.message }
  }

  return { success: true, data }
}
