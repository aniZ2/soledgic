import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const CSRF_COOKIE = '__csrf_token'

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)

  // Set pathname header for server components to read
  response.headers.set('x-pathname', request.nextUrl.pathname)

  // Set CSRF cookie if not already present (double-submit cookie pattern)
  if (!request.cookies.get(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, crypto.randomUUID(), {
      httpOnly: false, // must be JS-readable for double-submit
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 86400, // 24 hours
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     * - auth routes (sign-in, callback, etc. handle their own cookies)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api|auth).*)',
  ],
}
