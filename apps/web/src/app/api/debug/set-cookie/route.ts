import { NextResponse } from 'next/server'

// Test endpoint to see if cookies can be set at all
export async function GET(request: Request) {
  const debugSecret = process.env.DEBUG_SECRET
  const providedSecret =
    request.headers.get('x-debug-secret') ||
    new URL(request.url).searchParams.get('secret')

  if (process.env.NODE_ENV === 'production') {
    if (!debugSecret || providedSecret !== debugSecret) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')

  const response = NextResponse.json({
    message: 'Cookie set!',
    isSecure,
    timestamp: new Date().toISOString(),
  })

  // Set a simple test cookie
  response.cookies.set('test-cookie', 'hello-world', {
    path: '/',
    maxAge: 3600,
    httpOnly: false,
    sameSite: 'lax',
    secure: isSecure,
  })

  return response
}
