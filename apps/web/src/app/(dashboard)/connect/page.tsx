import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { ConnectWizardClient } from './connect-wizard-client'

export default async function ConnectPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) redirect('/onboarding')

  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
  if (!ledger) redirect('/ledgers/new')

  // Query api_keys for the active ledger's key_prefix (service role bypasses RLS)
  let apiKeyPreview: string | null = null
  let hasApiKey = false
  const serviceClient = createServiceRoleClient()

  try {
    const { data: apiKeys } = await serviceClient
      .from('api_keys')
      .select('key_prefix')
      .eq('ledger_id', ledger.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (apiKeys && apiKeys.length > 0 && apiKeys[0].key_prefix) {
      apiKeyPreview = `${apiKeys[0].key_prefix}${'*'.repeat(16)}`
      hasApiKey = true
    }
  } catch {
    // api_keys table may not exist in older environments
  }

  // Also check ledger api_key_hash as fallback
  if (!hasApiKey) {
    const { data: ledgerRow } = await serviceClient
      .from('ledgers')
      .select('api_key_hash')
      .eq('id', ledger.id)
      .single()

    if (ledgerRow?.api_key_hash) {
      hasApiKey = true
      if (!apiKeyPreview) {
        apiKeyPreview = 'Configured (visit Settings > API Keys to rotate)'
      }
    }
  }

  // Count existing webhook endpoints
  let existingWebhookCount = 0
  try {
    const { count } = await serviceClient
      .from('webhook_endpoints')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('is_active', true)

    existingWebhookCount = count || 0
  } catch {
    // webhook_endpoints table may not exist
  }

  const wizardCompleted = user.user_metadata?.connect_wizard_completed === true

  return (
    <ConnectWizardClient
      ledger={{ id: ledger.id, business_name: ledger.business_name }}
      apiKeyPreview={apiKeyPreview}
      hasApiKey={hasApiKey}
      wizardCompleted={wizardCompleted}
      existingWebhookCount={existingWebhookCount}
    />
  )
}
