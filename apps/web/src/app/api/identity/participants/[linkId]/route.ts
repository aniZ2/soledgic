import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { isUuid } from '@/lib/identity'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { getActiveMembershipForLedger } from '@/lib/identity-server'

type RouteParams = {
  params: Promise<{ linkId: string }>
}

async function deleteHandler(
  _request: Request,
  { user }: { user: { id: string; email?: string } | null },
  { params }: RouteParams,
) {
  const { linkId } = await params
  if (!isUuid(linkId)) {
    return NextResponse.json({ error: 'Invalid linkId' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: link } = await supabase
    .from('participant_identity_links')
    .select('id, user_id, ledger_id')
    .eq('id', linkId)
    .maybeSingle()

  if (!link) {
    return NextResponse.json({ error: 'Identity link not found' }, { status: 404 })
  }

  const membership = await getActiveMembershipForLedger(supabase, user!.id, String(link.ledger_id))
  const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  if (!isOrgAdmin && String(link.user_id) !== user!.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { error } = await supabase
    .from('participant_identity_links')
    .update({
      status: 'inactive',
      unlinked_at: new Date().toISOString(),
      metadata: {
        unlinked_by: user!.id,
        unlinked_via: 'identity.participants.delete',
      },
    })
    .eq('id', linkId)

  if (error) {
    return NextResponse.json({ error: 'Failed to remove identity link' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: Request,
  routeContext: RouteParams,
) {
  const wrapped = createApiHandler(
    async (innerRequest, context) => deleteHandler(innerRequest, context, routeContext),
    {
      routePath: '/api/identity/participants/[linkId]',
      csrfProtection: true,
    },
  )

  return wrapped(request)
}
