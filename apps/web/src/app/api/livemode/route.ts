import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { LIVEMODE_COOKIE, ACTIVE_LEDGER_GROUP_COOKIE } from '@/lib/livemode'

const COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365, // 1 year
  httpOnly: true,
}

export const POST = createApiHandler(
  async (request) => {
    const { data: body, error: parseError } = await parseJsonBody<{
      livemode: boolean
      activeLedgerGroupId?: string | null
    }>(request)

    if (parseError || body === null || typeof body.livemode !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request body. Expected { livemode: boolean }' },
        { status: 400 }
      )
    }

    const { livemode, activeLedgerGroupId } = body

    const response = NextResponse.json({ success: true, livemode, activeLedgerGroupId })

    response.cookies.set(LIVEMODE_COOKIE, String(livemode), COOKIE_OPTIONS)

    if (activeLedgerGroupId) {
      response.cookies.set(ACTIVE_LEDGER_GROUP_COOKIE, activeLedgerGroupId, COOKIE_OPTIONS)
    } else if (activeLedgerGroupId === null) {
      // Explicitly clear if null was sent
      response.cookies.delete(ACTIVE_LEDGER_GROUP_COOKIE)
    }

    return response
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: false,
    readonlyExempt: true,
    routePath: '/api/livemode',
  }
)
