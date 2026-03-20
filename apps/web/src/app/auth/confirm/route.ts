import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACTIVE_ORG_COOKIE } from '@/lib/livemode'
import { asMembershipQueryClient, resolveActiveOrganizationMembershipForClient } from '@/lib/active-org'

const ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | null

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

  // Helper to create redirect with cookies
  // Note: httpOnly must be false (Supabase default) so client SDK can read session
  const createRedirectWithCookies = (
    url: string,
    cookiesToSet: { name: string; value: string; options: CookieOptions }[],
    activeOrgId: string | null = null,
  ) => {
    const response = NextResponse.redirect(url, { status: 303 })
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, {
        path: options.path ?? '/',
        maxAge: options.maxAge,
        httpOnly: options.httpOnly ?? false,
        sameSite: (options.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
        secure: isSecure,
      })
    }

    if (activeOrgId) {
      response.cookies.set(ACTIVE_ORG_COOKIE, activeOrgId, {
        path: '/',
        maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecure,
      })
    } else {
      response.cookies.delete(ACTIVE_ORG_COOKIE)
    }

    return response
  }

  if (token_hash && type) {
    const cookieStore = await cookies()
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

    // Handle different confirmation types
    if (type === 'signup' || type === 'email') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type === 'signup' ? 'signup' : 'email_change',
      })

      if (!error) {
        // Email confirmed, check if user has an active organization
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const membership = await resolveActiveOrganizationMembershipForClient(
            asMembershipQueryClient(supabase),
            user.id,
            cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null,
          )

          // Redirect to onboarding if no active membership, otherwise dashboard
          if (!membership) {
            return createRedirectWithCookies(`${origin}/onboarding`, cookiesToSet)
          }

          return createRedirectWithCookies(
            `${origin}/dashboard?confirmed=true`,
            cookiesToSet,
            membership.organization_id,
          )
        }

        return createRedirectWithCookies(`${origin}/dashboard?confirmed=true`, cookiesToSet)
      }

      return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
    }

    // Recovery type should use the reset-password route
    if (type === 'recovery') {
      return createRedirectWithCookies(
        `${origin}/auth/reset-password?token_hash=${token_hash}&type=recovery`,
        cookiesToSet
      )
    }

    // Invite type - handle team invitations
    if (type === 'invite') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: 'invite',
      })

      if (!error) {
        return createRedirectWithCookies(`${origin}/dashboard?invited=true`, cookiesToSet)
      }

      return NextResponse.redirect(`${origin}/login?error=invite_failed`)
    }
  }

  // No token or invalid type
  return NextResponse.redirect(`${origin}/login?error=invalid_confirmation_link`)
}
