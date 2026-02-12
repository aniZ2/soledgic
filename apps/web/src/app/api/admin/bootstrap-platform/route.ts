import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  provisionOrganizationWithLedgers,
  type FinixSettingsPatch,
  type ProvisionLedgerMode,
} from '@/lib/org-provisioning'

interface BootstrapPlatformBody {
  admin_email?: string
  admin_password?: string
  organization_name?: string
  organization_slug?: string
  ledger_name?: string
  ledger_mode?: ProvisionLedgerMode
  finix_identity_id?: string
  finix_merchant_id?: string
  finix_source_id?: string
}

interface AuthUserRow {
  id: string
  email: string
}

export const runtime = 'nodejs'

function createServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    }
  )
}

function getProvidedBootstrapToken(request: Request): string {
  const headerToken = request.headers.get('x-bootstrap-token') || ''
  if (headerToken) return headerToken

  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '').trim()
  }
  return ''
}

async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

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
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const expectedToken = process.env.PLATFORM_BOOTSTRAP_TOKEN || process.env.BOOTSTRAP_TOKEN
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Bootstrap token is not configured' },
      { status: 503 }
    )
  }

  const providedToken = getProvidedBootstrapToken(request)
  if (!providedToken || providedToken !== expectedToken) {
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

  const finixPatch: FinixSettingsPatch = {
    identity_id: body.finix_identity_id,
    merchant_id: body.finix_merchant_id || process.env.FINIX_MERCHANT_ID,
    source_id: body.finix_source_id || process.env.FINIX_SOURCE_ID,
    onboarding_form_id: process.env.FINIX_ONBOARDING_FORM_ID,
  }

  try {
    const provisioned = await provisionOrganizationWithLedgers({
      userId: authUser.id,
      userEmail: authUser.email,
      organizationName,
      organizationSlug,
      ledgerName,
      ledgerMode,
      finix: finixPatch,
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to provision platform organization' },
      { status: 500 }
    )
  }
}
