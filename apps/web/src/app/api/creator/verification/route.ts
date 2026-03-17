import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

async function getCreatorContext(userId: string) {
  const supabase = await createClient()
  // Creator portal users are linked via connected_accounts.created_by or email match
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('id, ledger_id, entity_id, kyc_status, is_active')
    .eq('created_by', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !account) return null
  return account
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const account = await getCreatorContext(user!.id)

    // Return status even if no connected_account (creator hasn't been onboarded)
    if (!account) {
      return NextResponse.json({
        status: { kyc_status: 'pending', rejection_reason: null },
        documents: [],
      })
    }

    const serviceClient = createServiceRoleClient()

    // Get documents uploaded by this creator (stored under the ledger's org)
    const { data: ledger } = await serviceClient
      .from('ledgers')
      .select('organization_id')
      .eq('id', account.ledger_id)
      .single()

    let documents: unknown[] = []
    if (ledger?.organization_id) {
      const { data: docs } = await serviceClient
        .from('compliance_documents')
        .select('id, document_type, file_name, status, rejection_reason, created_at')
        .eq('organization_id', ledger.organization_id)
        .eq('uploaded_by', user!.id)
        .order('created_at', { ascending: false })
      documents = docs || []
    }

    return NextResponse.json({
      status: {
        kyc_status: account.kyc_status || 'pending',
        rejection_reason: null,
      },
      documents,
    })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/creator/verification' }
)
