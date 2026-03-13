import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { requireSensitiveActionAuth } from '@/lib/sensitive-action-server'
import { isParticipantId, isUuid } from '@/lib/identity'
import { getActiveMembershipForLedger } from '@/lib/identity-server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type LinkParticipantPayload = {
  ledger_id?: string
  participant_id?: string
  user_id?: string
  link_source?: 'manual' | 'email_match' | 'provisioned' | 'imported'
}

export const POST = createApiHandler(
  async (request, context) => {
    const { user } = context
    const { data: body, error: parseError } = await parseJsonBody<LinkParticipantPayload>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid JSON body' }, { status: 400 })
    }

    const ledgerId = typeof body.ledger_id === 'string' ? body.ledger_id.trim() : ''
    const participantId = typeof body.participant_id === 'string' ? body.participant_id.trim() : ''
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : user!.id
    const linkSource = body.link_source || 'manual'

    if (!isUuid(ledgerId)) {
      return NextResponse.json({ error: 'Invalid ledger_id' }, { status: 400 })
    }
    if (!isParticipantId(participantId)) {
      return NextResponse.json({ error: 'Invalid participant_id' }, { status: 400 })
    }
    if (!isUuid(targetUserId)) {
      return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: account } = await supabase
      .from('accounts')
      .select('id, metadata, name')
      .eq('ledger_id', ledgerId)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', participantId)
      .maybeSingle()

    if (!account) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    const membership = await getActiveMembershipForLedger(supabase, user!.id, ledgerId)
    const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin'

    if (!isOrgAdmin && targetUserId !== user!.id) {
      return NextResponse.json({ error: 'Only owners and admins can link other users' }, { status: 403 })
    }

    const sensitiveAuthFailure = requireSensitiveActionAuth(context, 'link participant identities')
    if (sensitiveAuthFailure) {
      return sensitiveAuthFailure
    }

    if (!isOrgAdmin) {
      const accountMetadata = account.metadata && typeof account.metadata === 'object'
        ? account.metadata as Record<string, unknown>
        : {}
      const accountEmail = typeof accountMetadata.email === 'string'
        ? accountMetadata.email.trim().toLowerCase()
        : ''
      const userEmail = (user?.email || '').trim().toLowerCase()

      if (!accountEmail || !userEmail || accountEmail !== userEmail) {
        return NextResponse.json({ error: 'Self-linking requires a matching participant email' }, { status: 403 })
      }
    }

    const targetMembership = await getActiveMembershipForLedger(supabase, targetUserId, ledgerId)

    const { data: link, error } = await supabase
      .from('participant_identity_links')
      .upsert({
        ledger_id: ledgerId,
        participant_id: participantId,
        user_id: targetUserId,
        membership_id: targetMembership?.id || null,
        link_source: linkSource,
        status: 'active',
        is_primary: true,
        linked_at: new Date().toISOString(),
        unlinked_at: null,
        metadata: {
          linked_by: user!.id,
          linked_via: 'identity.participants',
        },
      }, {
        onConflict: 'ledger_id,participant_id',
      })
      .select('id, ledger_id, participant_id, user_id, link_source, linked_at')
      .single()

    if (error || !link) {
      return NextResponse.json({ error: 'Failed to link participant identity' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      link: {
        id: link.id,
        ledger_id: link.ledger_id,
        participant_id: link.participant_id,
        user_id: link.user_id,
        link_source: link.link_source,
        linked_at: link.linked_at,
      },
    })
  },
  {
    routePath: '/api/identity/participants',
    csrfProtection: true,
  },
)
