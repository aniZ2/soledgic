import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACTIVE_ORG_COOKIE } from '@/lib/livemode'
import { asMembershipQueryClient, resolveActiveOrganizationMembershipForClient } from '@/lib/active-org'
import { sendWelcomeEmail } from '@/lib/email'
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = sanitizeRedirect(searchParams.get('redirect'))

  // Detect if we're on HTTPS (Vercel/proxies use x-forwarded-proto)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isSecure = forwardedProto === 'https' || request.url.startsWith('https')
  const host = request.headers.get('host') || new URL(request.url).host
  const origin = `${isSecure ? 'https' : 'http'}://${host}`

  if (code) {
    const cookieStore = await cookies()

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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      try {
        // Check if user has an active organization membership
        const { data: { user } } = await supabase.auth.getUser()

        let redirectUrl = `${origin}${redirect}`

        let membership = user
          ? await resolveActiveOrganizationMembershipForClient(
              asMembershipQueryClient(supabase),
              user.id,
              cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null,
            )
          : null

        if (user && !membership) {
          const provisioned = await maybeProvisionPrimaryOwnerWorkspace({
            id: user.id,
            email: user.email,
          })

          if (provisioned) {
            membership = {
              organization_id: provisioned.organizationId,
              role: 'owner',
            }
          }
        }

        if (user) {
          // If no active membership, this is a new user - send welcome email
          if (!membership) {
            // Send welcome email (non-blocking)
            const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'there'
            sendWelcomeEmail({
              to: user.email!,
              name: userName,
            }).catch(console.error)

            redirectUrl = `${origin}/onboarding`
          } else {
            redirectUrl = `${origin}${resolvePrimaryOwnerAppEntryPath(redirect, user.email)}`
          }
        }

        const response = NextResponse.redirect(redirectUrl, { status: 303 })

        // Set cookies directly on the response
        // Note: httpOnly must be false (Supabase default) so client SDK can read session
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
      } catch (authSetupError) {
        console.error('Auth callback post-exchange setup failed:', authSetupError)
        const includeDebug = process.env.AUTH_DEBUG_LOGS === 'true'
        const message = authSetupError instanceof Error ? authSetupError.message : 'auth_setup_failed'
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(includeDebug ? message : 'auth_setup_failed')}`
        )
      }
    }

    console.error('Auth callback exchange failed:', error.message)
    const includeDebug = process.env.AUTH_DEBUG_LOGS === 'true'
    const authError = includeDebug ? error.message : 'auth_callback_error'
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(authError)}`)
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
