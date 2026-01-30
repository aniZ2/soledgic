import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { READONLY_COOKIE } from '@/lib/livemode'

export const POST = createApiHandler(
  async (request) => {
    const { data: body, error: parseError } = await parseJsonBody<{
      readonly: boolean
    }>(request)

    if (parseError || body === null || typeof body.readonly !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request body. Expected { readonly: boolean }' },
        { status: 400 }
      )
    }

    const { readonly } = body

    const response = NextResponse.json({ success: true, readonly })

    if (readonly) {
      response.cookies.set(READONLY_COOKIE, 'true', {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24, // 24 hours — auto-expires so you don't accidentally leave it on
        httpOnly: true,
      })
    } else {
      response.cookies.delete(READONLY_COOKIE)
    }

    return response
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: false,
    readonlyExempt: true, // Must be exempt — otherwise you can't turn it off
    routePath: '/api/readonly',
  }
)
