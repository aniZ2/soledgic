import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'

interface ApiKeysRequest {
  action: 'reveal' | 'rotate'
  ledger_id: string
}

function maskApiKey(key: string | null): string {
  if (!key) return '—'
  if (key.length <= 14) return `${key.slice(0, 4)}****`
  return `${key.slice(0, 10)}${'*'.repeat(16)}${key.slice(-4)}`
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

function makeApiKey(livemode: boolean): string {
  return `sk_${livemode ? 'live' : 'test'}_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
}

async function getActiveMembership(userId: string) {
  const supabase = await createClient()

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (error || !membership) return null
  return membership
}

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

export const GET = createApiHandler(
  async (_request, { user }) => {
    const membership = await getActiveMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can view API keys' },
        { status: 403 }
      )
    }

    const serviceClient = createServiceClient()
    const { data: ledgers, error } = await serviceClient
      .from('ledgers')
      .select('id, business_name, api_key, created_at, livemode')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
    }

    return NextResponse.json({
      ledgers: (ledgers || []).map((ledger) => ({
        id: ledger.id,
        business_name: ledger.business_name,
        livemode: ledger.livemode,
        created_at: ledger.created_at,
        has_key: Boolean(ledger.api_key),
        key_preview: maskApiKey(ledger.api_key),
      })),
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/settings/api-keys',
  }
)

export const POST = createApiHandler(
  async (request, { user }) => {
    const { data: body, error: parseError } = await parseJsonBody<ApiKeysRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    if (!body.ledger_id || !body.action) {
      return NextResponse.json({ error: 'action and ledger_id are required' }, { status: 400 })
    }

    if (!['reveal', 'rotate'].includes(body.action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const membership = await getActiveMembership(user!.id)
    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only owners and admins can manage API keys' },
        { status: 403 }
      )
    }

    const serviceClient = createServiceClient()
    const { data: ledger, error: ledgerError } = await serviceClient
      .from('ledgers')
      .select('id, api_key, livemode')
      .eq('id', body.ledger_id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (ledgerError || !ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    if (body.action === 'reveal') {
      if (!ledger.api_key) {
        return NextResponse.json(
          { error: 'No API key found. Rotate to generate a new key.' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        key: ledger.api_key,
        key_preview: maskApiKey(ledger.api_key),
      })
    }

    const nextKey = makeApiKey(Boolean(ledger.livemode))
    const { error: updateError } = await serviceClient
      .from('ledgers')
      .update({
        api_key: nextKey,
        api_key_hash: hashApiKey(nextKey),
      })
      .eq('id', ledger.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to rotate API key' }, { status: 500 })
    }

    // Best-effort insert for secondary key registry when present.
    try {
      await serviceClient
        .from('api_keys')
        .insert({
          ledger_id: ledger.id,
          name: ledger.livemode ? 'Rotated Live Key' : 'Rotated Test Key',
          key_hash: hashApiKey(nextKey),
          key_prefix: nextKey.slice(0, 12),
          scopes: ['read', 'write', 'admin'],
          created_by: user!.id,
        })
    } catch {
      // No-op: api_keys table might be unavailable in some environments.
    }

    return NextResponse.json({
      key: nextKey,
      key_preview: maskApiKey(nextKey),
      rotated: true,
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/settings/api-keys',
  }
)
