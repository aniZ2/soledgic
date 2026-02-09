'use server'

import { createClient } from '@/lib/supabase/server'

export async function createOrganizationWithLedger(input: {
  orgName: string
  selectedPlan: string
  ledgerName: string
  ledgerMode: 'standard' | 'marketplace'
}) {
  const supabase = await createClient()
  const { orgName, selectedPlan, ledgerName, ledgerMode } = input

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    return { error: sessionError.message }
  }
  if (!session?.user?.id) {
    return { error: 'Not authenticated' }
  }
  const userId = session.user.id

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const plans: Record<string, { ledgers: number; team_members: number }> = {
    pro: { ledgers: 3, team_members: 1 },
    business: { ledgers: 10, team_members: 10 },
    scale: { ledgers: -1, team_members: -1 },
  }
  const planData = plans[selectedPlan] || plans.pro

  // 14-day trial
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 14)

  const { data, error: rpcError } = await supabase.rpc('create_organization_with_ledger', {
    p_user_id: userId,
    p_org_name: orgName,
    p_org_slug: slug,
    p_plan: selectedPlan,
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
