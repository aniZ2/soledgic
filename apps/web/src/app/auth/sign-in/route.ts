import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACTIVE_ORG_COOKIE } from '@/lib/livemode'
import { asMembershipQueryClient, resolveActiveOrganizationMembershipForClient } from '@/lib/active-org'
import { resolvePrimaryOwnerAppEntryPath } from '@/lib/internal-platforms'
import { maybeProvisionPrimaryOwnerWorkspace } from '@/lib/platform-owner-bootstrap'

const ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function setActiveOrgCookie(response: NextResponse, orgId: string | null, isSecure: boolean) {
  if (!orgId) {
    response.cookies.delete(ACTIVE_ORG_COOKIE)
    return
  }

  response.cookies.set(ACTIVE_ORG_COOKIE, orgId, {
    path: '/',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
  })
}

function sanitizeRedirect(raw: string | null): string {
  const path = (raw || '/dashboard').trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) return '/dashboard'
  return path
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = sanitizeRedirect(formData.get('redirect') as string)

  const cookieStore = await cookies()

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')

  // Build origin from headers for proper redirect (handles proxy correctly)
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

  // Collect cookies that Supabase wants to set
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookies) {
          cookiesToSet.push(...cookies)
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}&redirect=${encodeURIComponent(redirectTo)}`,
      { status: 303 }
    )
  }

  if (!data.session) {
    return NextResponse.redirect(
      `${origin}/login?error=Login failed&redirect=${encodeURIComponent(redirectTo)}`,
      { status: 303 }
    )
  }

  try {
    // Check if user has an active organization membership
    let membership = await resolveActiveOrganizationMembershipForClient(
      asMembershipQueryClient(supabase),
      data.user.id,
      cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null,
    )

    if (!membership) {
      const provisioned = await maybeProvisionPrimaryOwnerWorkspace({
        id: data.user.id,
        email: data.user.email,
      })

      if (provisioned) {
        membership = {
          organization_id: provisioned.organizationId,
          role: 'owner',
        }
      }
    }

    const finalRedirect = membership
      ? resolvePrimaryOwnerAppEntryPath(redirectTo, data.user.email)
      : '/onboarding'

    const response = NextResponse.redirect(`${origin}${finalRedirect}`, { status: 303 })

    // Set cookies on the redirect response
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, {
        path: options.path ?? '/',
        maxAge: options.maxAge,
        httpOnly: options.httpOnly ?? false,
        sameSite: (options.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
        secure: isSecure,
      })
    }

    setActiveOrgCookie(response, membership?.organization_id ?? null, isSecure)

    return response
  } catch (error) {
    console.error('Sign-in post-auth setup failed:', error)
    const includeDebug = process.env.AUTH_DEBUG_LOGS === 'true'
    const message = error instanceof Error ? error.message : 'auth_setup_failed'
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(includeDebug ? message : 'auth_setup_failed')}&redirect=${encodeURIComponent(redirectTo)}`,
      { status: 303 }
    )
  }
}
