import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// SECURITY: Validate redirect URLs to prevent open redirect attacks
function isValidRedirect(path: string): boolean {
  if (!path || typeof path !== 'string') return false

  // Must start with /
  if (!path.startsWith('/')) return false

  // Must not be a protocol-relative URL (//evil.com)
  if (path.startsWith('//')) return false

  // Must not contain protocol
  if (path.includes('://')) return false

  // Must not contain backslashes (URL encoding bypass)
  if (path.includes('\\')) return false

  // Must not contain null bytes
  if (path.includes('\0')) return false

  // Check for URL-encoded bypasses
  try {
    const decoded = decodeURIComponent(path)
    if (decoded.startsWith('//') || decoded.includes('://')) return false
  } catch {
    return false
  }

  // Normalize and check again
  try {
    const url = new URL(path, 'http://localhost')
    if (url.origin !== 'http://localhost') return false
  } catch {
    return false
  }

  return true
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectParam = searchParams.get('redirect') || '/dashboard'

  // SECURITY: Validate and sanitize redirect parameter
  const redirect = isValidRedirect(redirectParam) ? redirectParam : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
