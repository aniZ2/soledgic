import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/docs',
  '/pricing',
  '/about',
  '/terms',
  '/privacy',
  '/invite',
]

// Routes that are system-level (not org-scoped)
const SYSTEM_ROUTES = [
  '/dashboard',
  '/ledgers',
  '/settings',
  '/billing',
  '/onboarding',
]

// SECURITY: Validate redirect URLs to prevent open redirect attacks
function isValidRedirect(path: string): boolean {
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
  const decoded = decodeURIComponent(path)
  if (decoded.startsWith('//') || decoded.includes('://')) return false
  
  // Normalize and check again
  try {
    const url = new URL(path, 'http://localhost')
    // If it resolves to a different origin, it's suspicious
    if (url.origin !== 'http://localhost') return false
  } catch {
    return false
  }
  
  return true
}

// SECURITY: Sanitize the redirect path
function sanitizeRedirect(path: string): string {
  if (!isValidRedirect(path)) {
    return '/dashboard' // Default safe redirect
  }
  
  // Remove any query parameters for extra safety
  // (if you need to preserve them, add more validation)
  const cleanPath = path.split('?')[0].split('#')[0]
  
  return cleanPath
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ============================================================================
  // 1. CANONICAL URL HANDLING
  // ============================================================================
  
  const hasUppercase = /[A-Z]/.test(pathname)
  const hasTrailingSlash = pathname.length > 1 && pathname.endsWith('/')
  
  if (hasUppercase || hasTrailingSlash) {
    const url = request.nextUrl.clone()
    let canonical = pathname.toLowerCase()
    if (canonical.length > 1 && canonical.endsWith('/')) {
      canonical = canonical.slice(0, -1)
    }
    url.pathname = canonical
    return NextResponse.redirect(url, 308)
  }

  // ============================================================================
  // 2. SUPABASE SESSION
  // ============================================================================

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // SECURITY: Enhance cookie security
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              // SECURITY: Changed from 'lax' to 'strict' for better CSRF protection
              sameSite: 'strict',
            })
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ============================================================================
  // 3. PUBLIC ROUTES - No auth required
  // ============================================================================

  const isPublicRoute = PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )
  
  // Allow docs subpages
  if (pathname.startsWith('/docs')) {
    return supabaseResponse
  }

  if (isPublicRoute) {
    // Redirect logged-in users away from login/signup
    if (user && (pathname === '/login' || pathname === '/signup')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // ============================================================================
  // 4. PROTECTED ROUTES - Auth required
  // ============================================================================

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    // SECURITY: Validate and sanitize redirect parameter
    const safeRedirect = sanitizeRedirect(pathname)
    loginUrl.searchParams.set('redirect', safeRedirect)
    return NextResponse.redirect(loginUrl)
  }

  // ============================================================================
  // 5. HANDLE POST-LOGIN REDIRECT
  // ============================================================================
  
  // If user is logging in and there's a redirect param, validate it
  if (pathname === '/login' || pathname === '/auth/callback') {
    const redirectParam = request.nextUrl.searchParams.get('redirect')
    if (redirectParam && !isValidRedirect(redirectParam)) {
      // Remove invalid redirect parameter
      const cleanUrl = new URL(request.url)
      cleanUrl.searchParams.delete('redirect')
      return NextResponse.redirect(cleanUrl)
    }
  }

  // ============================================================================
  // 6. SYSTEM ROUTES - Auth required but no org scope
  // ============================================================================

  const isSystemRoute = SYSTEM_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (isSystemRoute) {
    return supabaseResponse
  }

  // ============================================================================
  // 7. ORG-SCOPED ROUTES - Verify membership
  // ============================================================================

  const segments = pathname.split('/').filter(Boolean)
  const potentialSlug = segments[0]

  if (!potentialSlug || potentialSlug.startsWith('_')) {
    return supabaseResponse
  }

  // SECURITY: Validate slug format before database query
  if (!/^[a-z0-9-]+$/.test(potentialSlug) || potentialSlug.length > 50) {
    return supabaseResponse
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, slug')
    .eq('slug', potentialSlug)
    .single()

  if (org) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, status')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      const dashboardUrl = new URL('/dashboard', request.url)
      dashboardUrl.searchParams.set('error', 'access_denied')
      dashboardUrl.searchParams.set('org', potentialSlug)
      return NextResponse.redirect(dashboardUrl)
    }

    // Add org context to headers
    supabaseResponse.headers.set('x-org-id', org.id)
    supabaseResponse.headers.set('x-org-slug', org.slug)
    supabaseResponse.headers.set('x-user-role', membership.role)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api).*)',
  ],
}
