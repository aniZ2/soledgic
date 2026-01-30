import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { ACTIVE_LEDGER_GROUP_COOKIE } from '@/lib/livemode'

export const POST = createApiHandler(
  async (request) => {
    const { data: body, error: parseError } = await parseJsonBody<{
      ledgerGroupId: string | null
    }>(request)

    if (parseError || body === null) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected { ledgerGroupId: string | null }' },
        { status: 400 }
      )
    }

    const { ledgerGroupId } = body

    const response = NextResponse.json({ success: true, ledgerGroupId })

    if (ledgerGroupId) {
      response.cookies.set(ACTIVE_LEDGER_GROUP_COOKIE, ledgerGroupId, {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
      })
    } else {
      response.cookies.delete(ACTIVE_LEDGER_GROUP_COOKIE)
    }

    return response
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: false,
    readonlyExempt: true,
    routePath: '/api/active-ledger-group',
  }
)
