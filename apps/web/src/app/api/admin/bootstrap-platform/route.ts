import { NextResponse } from 'next/server'
import {
  provisionOrganizationWithLedgers,
  type ProvisionLedgerMode,
} from '@/lib/org-provisioning'
import { createServiceRoleClient, getServerServiceKey, getServerSupabaseUrl } from '@/lib/supabase/service'
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit'

interface BootstrapPlatformBody {
  admin_email?: string
  admin_password?: string
  organization_name?: string
  organization_slug?: string
  ledger_name?: string
  ledger_mode?: ProvisionLedgerMode
}

interface AuthUserRow {
  id: string
  email: string
}

export const runtime = 'nodejs'

function createServiceClient() {
  return createServiceRoleClient()
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function isProductionRuntime(): boolean {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase()
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()
  return nodeEnv === 'production' || vercelEnv === 'production'
}

function getProvidedBootstrapToken(request: Request): string {
  const headerToken = request.headers.get('x-bootstrap-token') || ''
  if (headerToken) return headerToken

  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim()
  }
  return ''
}

async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const supabaseUrl = getServerSupabaseUrl()
  const serviceKey = getServerServiceKey()

  const response = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email.toLowerCase())}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Auth lookup failed (${response.status})`)
  }

  const payload = await response.json() as { users?: Array<{ id: string; email?: string }> }
  const user = payload.users?.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
  if (!user || !user.email) return null

  return { id: user.id, email: user.email }
}

export async function POST(request: Request) {
  // This endpoint is a one-time bootstrap tool. It should never be callable in
  // production once the platform org exists.
  if (isProductionRuntime()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rateLimitResult = await checkRateLimit(
    getRateLimitKey(request),
    '/api/admin/bootstrap-platform',
    { requests: 10, windowMs: 60_000 }
  )
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    )
  }

  const expectedToken = (process.env.PLATFORM_BOOTSTRAP_TOKEN || process.env.BOOTSTRAP_TOKEN || '').trim()
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Bootstrap token is not configured' },
      { status: 503 }
    )
  }

  const providedToken = getProvidedBootstrapToken(request)
  if (!providedToken || !timingSafeEqualString(providedToken, expectedToken)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let body: BootstrapPlatformBody
  try {
    body = (await request.json()) as BootstrapPlatformBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const adminEmail = (body.admin_email || '').trim().toLowerCase()
  const adminPassword = body.admin_password || ''
  if (!adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: 'admin_email and admin_password are required' },
      { status: 400 }
    )
  }

  if (adminPassword.length < 10) {
    return NextResponse.json(
      { error: 'admin_password must be at least 10 characters' },
      { status: 400 }
    )
  }

  const organizationName = (body.organization_name || 'Soledgic Platform').trim()
  const organizationSlug = (body.organization_slug || 'soledgic-platform').trim()
  const ledgerName = (body.ledger_name || organizationName).trim()
  const ledgerMode: ProvisionLedgerMode = body.ledger_mode === 'marketplace' ? 'marketplace' : 'standard'

  const serviceClient = createServiceClient()

  let authUser = await findAuthUserByEmail(adminEmail)
  let createdAuthUser = false

  if (!authUser) {
    const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'platform_admin' },
    })

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create admin user' },
        { status: 500 }
      )
    }

    authUser = { id: createdUser.user.id, email: createdUser.user.email || adminEmail }
    createdAuthUser = true
  } else {
    // Keep the bootstrap endpoint idempotent while allowing credential rotation.
    const { error: updateUserError } = await serviceClient.auth.admin.updateUserById(authUser.id, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'platform_admin' },
    })

    if (updateUserError) {
      return NextResponse.json(
        { error: updateUserError.message || 'Failed to update admin user' },
        { status: 500 }
      )
    }
  }

  try {
    const provisioned = await provisionOrganizationWithLedgers({
      userId: authUser.id,
      userEmail: authUser.email,
      organizationName,
      organizationSlug,
      ledgerName,
      ledgerMode,
      reuseIfSlugExists: true,
    })

    return NextResponse.json({
      success: true,
      admin_user: {
        id: authUser.id,
        email: authUser.email,
        created: createdAuthUser,
      },
      organization: {
        id: provisioned.organizationId,
        slug: provisioned.organizationSlug,
        name: provisioned.organizationName,
        created: provisioned.createdOrganization,
      },
      ledgers: {
        ledger_group_id: provisioned.ledgerGroupId,
        test_ledger_id: provisioned.testLedgerId,
        live_ledger_id: provisioned.liveLedgerId,
      },
      api_keys: {
        test: provisioned.testApiKey,
        live: provisioned.liveApiKey,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to provision platform organization'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
