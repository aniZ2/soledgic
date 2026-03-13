import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import {
  getCurrentEcosystemForUser,
  moveCurrentOrganizationToEcosystem,
  updateCurrentEcosystemDetails,
} from '@/lib/ecosystem-server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type PatchPayload = {
  action?: 'update' | 'join_existing'
  name?: string
  slug?: string
  description?: string | null
  transfer_to_slug?: string
}

function statusForErrorMessage(message: string): number {
  const normalized = message.toLowerCase()
  if (normalized.includes('not found')) return 404
  if (normalized.includes('only') || normalized.includes('must be')) return 403
  if (normalized.includes('invalid') || normalized.includes('already in use')) return 400
  return 500
}

export const GET = createApiHandler(
  async (_request, { user }) => {
    const supabase = createServiceRoleClient()
    const ecosystem = await getCurrentEcosystemForUser(supabase, user!.id)

    if (!ecosystem) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    return NextResponse.json({ ecosystem })
  },
  {
    routePath: '/api/ecosystems/current',
    csrfProtection: false,
  },
)

export const PATCH = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<PatchPayload>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid JSON body' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    try {
      if (body.action === 'join_existing') {
        const transferToSlug = typeof body.transfer_to_slug === 'string' ? body.transfer_to_slug.trim() : ''
        if (!transferToSlug) {
          return NextResponse.json({ error: 'transfer_to_slug is required' }, { status: 400 })
        }

        const ecosystem = await moveCurrentOrganizationToEcosystem(supabase, user!.id, transferToSlug)
        return NextResponse.json({ success: true, ecosystem })
      }

      const ecosystem = await updateCurrentEcosystemDetails(supabase, user!.id, {
        name: body.name,
        slug: body.slug,
        description: body.description,
      })

      return NextResponse.json({ success: true, ecosystem })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update ecosystem'
      return NextResponse.json({ error: message }, { status: statusForErrorMessage(message) })
    }
  },
  {
    routePath: '/api/ecosystems/current',
    csrfProtection: true,
  },
)
