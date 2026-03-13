import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_SOLEDGIC_API_VERSION =
  (process.env.SOLEDGIC_API_VERSION || '').trim() || '2026-03-01'

const ALLOWED_ENDPOINT_ROOTS = new Set([
  'health-check',
  'delete-creator',
  'record-sale',
  'record-expense',
  'record-income',
  'record-transfer',
  'record-adjustment',
  'webhooks',
  'import-transactions',
  'submit-tax-info',
  'tax-documents',
  'tax',
  'send-statements',
  'profit-loss',
  'trial-balance',
  'generate-pdf',
  'export-report',
  'participants',
  'wallets',
  'transfers',
  'holds',
  'checkout-sessions',
  'payouts',
  'refunds',
  'reconciliations',
  'fraud',
  'compliance',
  'bank-aggregator',
])

const OWNER_ADMIN_ONLY_ENDPOINT_ROOTS = new Set([
  'payouts',
  'holds',
  'wallets',
  'transfers',
  'import-transactions',
  'send-statements',
  'delete-creator',
  'bank-aggregator',
])

function getEndpointFromRequest(request: Request): string | null {
  const pathname = new URL(request.url).pathname
  const parts = pathname.split('/').filter(Boolean)
  const idx = parts.indexOf('ledger-functions')
  if (idx === -1 || idx + 1 >= parts.length) return null
  return parts.slice(idx + 1).map((part) => decodeURIComponent(part)).join('/')
}

function getEndpointRoot(endpoint: string): string {
  return endpoint.split('/')[0] || endpoint
}

function getInternalFunctionToken(): string | null {
  return process.env.SOLEDGIC_INTERNAL_FUNCTION_TOKEN || process.env.INTERNAL_FUNCTION_TOKEN || null
}

async function assertLedgerAccess(userId: string, ledgerId: string) {
  const supabase = await createClient()

  const { data: ledger, error: ledgerError } = await supabase
    .from('ledgers')
    .select('id, organization_id, status')
    .eq('id', ledgerId)
    .single()

  if (ledgerError || !ledger || ledger.status !== 'active') {
    return { allowed: false, status: 404, error: 'Ledger not found' } as const
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('id, role')
    .eq('organization_id', ledger.organization_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (membershipError || !membership) {
    return { allowed: false, status: 403, error: 'Access denied' } as const
  }

  return { allowed: true, role: membership.role as string } as const
}

async function proxyLedgerFunction(
  request: Request,
  userId: string,
  method: string
): Promise<NextResponse> {
  const endpoint = getEndpointFromRequest(request)
  const endpointRoot = endpoint ? getEndpointRoot(endpoint) : null
  if (!endpoint || !endpointRoot || !ALLOWED_ENDPOINT_ROOTS.has(endpointRoot)) {
    return NextResponse.json({ error: 'Unsupported function endpoint' }, { status: 404 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Supabase URL is not configured' }, { status: 503 })
  }

  const internalToken = getInternalFunctionToken()
  if (!internalToken) {
    return NextResponse.json({ error: 'Internal function token is not configured' }, { status: 503 })
  }

  const requestUrl = new URL(request.url)
  const forwardUrl = new URL(`${supabaseUrl}/functions/v1/${endpoint}`)
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key !== 'ledger_id') {
      forwardUrl.searchParams.append(key, value)
    }
  }

  let ledgerId: string | null = requestUrl.searchParams.get('ledger_id')
  let bodyData: Record<string, unknown> | null = null

  if (method !== 'GET' && method !== 'DELETE') {
    const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    bodyData = body
    const rawLedgerId = body.ledger_id
    ledgerId = typeof rawLedgerId === 'string' && rawLedgerId.trim().length > 0 ? rawLedgerId.trim() : ledgerId

    if (rawLedgerId !== undefined) {
      delete bodyData.ledger_id
    }
  }

  if (!ledgerId) {
    return NextResponse.json({ error: 'ledger_id is required' }, { status: 400 })
  }

  const access = await assertLedgerAccess(userId, ledgerId)
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const isReadMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  if (!isReadMethod && access.role === 'viewer') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  if (
    OWNER_ADMIN_ONLY_ENDPOINT_ROOTS.has(endpointRoot) &&
    access.role !== 'owner' &&
    access.role !== 'admin'
  ) {
    return NextResponse.json(
      { error: 'Only owners and admins can perform this action' },
      { status: 403 }
    )
  }

  const headers = new Headers()
  headers.set('x-soledgic-internal-token', internalToken)
  headers.set('x-ledger-id', ledgerId)
  headers.set('Soledgic-Version', DEFAULT_SOLEDGIC_API_VERSION)

  let body: string | undefined
  if (method !== 'GET' && method !== 'DELETE') {
    headers.set('Content-Type', 'application/json')

    // Some functions (e.g. generate-pdf internal calls) require ledger_id in the body.
    const payload = {
      ...(bodyData || {}),
      ledger_id: ledgerId,
    }
    body = JSON.stringify(payload)
  }

  const upstream = await fetch(forwardUrl.toString(), {
    method,
    headers,
    body,
    cache: 'no-store',
  })

  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const text = await upstream.text()
    let payload: unknown = {}

    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { error: text }
      }
    }

    return NextResponse.json(payload, { status: upstream.status })
  }

  const buffer = await upstream.arrayBuffer()
  const response = new NextResponse(buffer, { status: upstream.status })

  if (contentType) {
    response.headers.set('Content-Type', contentType)
  }

  const disposition = upstream.headers.get('content-disposition')
  if (disposition) {
    response.headers.set('Content-Disposition', disposition)
  }

  return response
}

export const GET = createApiHandler(
  async (request, { user }) => proxyLedgerFunction(request, user!.id, 'GET'),
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/ledger-functions',
  }
)

export const POST = createApiHandler(
  async (request, { user }) => proxyLedgerFunction(request, user!.id, 'POST'),
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/ledger-functions',
  }
)

export const PUT = createApiHandler(
  async (request, { user }) => proxyLedgerFunction(request, user!.id, 'PUT'),
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/ledger-functions',
  }
)

export const PATCH = createApiHandler(
  async (request, { user }) => proxyLedgerFunction(request, user!.id, 'PATCH'),
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/ledger-functions',
  }
)

export const DELETE = createApiHandler(
  async (request, { user }) => proxyLedgerFunction(request, user!.id, 'DELETE'),
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/ledger-functions',
  }
)
