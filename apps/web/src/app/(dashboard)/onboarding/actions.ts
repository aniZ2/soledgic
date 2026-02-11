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
    console.log('[onboarding action] auth error:', authError?.message, authError?.status)
    return { error: 'Not authenticated' }
  }
  const userId = user.id

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const effectivePlan = 'pro'
  const planData = { ledgers: 3, team_members: 1 }

  // 14-day trial
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 14)

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
