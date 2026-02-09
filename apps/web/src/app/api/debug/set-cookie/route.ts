import { NextResponse } from 'next/server'

// Test endpoint to see if cookies can be set at all
export async function GET(request: Request) {
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
