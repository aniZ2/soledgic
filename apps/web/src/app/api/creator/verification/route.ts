import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { listCreatorConnectedAccountsForUser } from '@/lib/creator-connected-accounts-server'

function aggregateKycStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'pending'
  if (statuses.every((status) => status === 'approved')) return 'approved'
  if (statuses.includes('suspended')) return 'suspended'
  if (statuses.includes('rejected')) return 'rejected'
  if (statuses.includes('under_review')) return 'under_review'
  return 'pending'
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const accounts = await listCreatorConnectedAccountsForUser(user!.id, user!.email)

    // Return status even if no connected_account (creator hasn't been onboarded)
    if (accounts.length === 0) {
      return NextResponse.json({
        status: { kyc_status: 'pending', rejection_reason: null },
        documents: [],
      })
    }

    const serviceClient = createServiceRoleClient()

    const ledgerIds = Array.from(new Set(accounts.map((account) => account.ledger_id)))
    const { data: ledgers } = await serviceClient
      .from('ledgers')
      .select('organization_id')
      .in('id', ledgerIds)

    let documents: unknown[] = []
    const organizationIds = Array.from(new Set(
      (ledgers || [])
        .map((ledger) => (typeof ledger.organization_id === 'string' ? ledger.organization_id : null))
        .filter((organizationId): organizationId is string => organizationId !== null),
    ))

    if (organizationIds.length > 0) {
      const { data: docs } = await serviceClient
        .from('compliance_documents')
        .select('id, document_type, file_name, status, rejection_reason, created_at')
        .in('organization_id', organizationIds)
        .eq('uploaded_by', user!.id)
        .order('created_at', { ascending: false })
      documents = docs || []
    }

    return NextResponse.json({
      status: {
        kyc_status: aggregateKycStatus(accounts.map((account) => account.kyc_status || 'pending')),
        rejection_reason: null,
      },
      documents,
    })
  },
  { requireAuth: true, rateLimit: true, csrfProtection: true, routePath: '/api/creator/verification' }
)
