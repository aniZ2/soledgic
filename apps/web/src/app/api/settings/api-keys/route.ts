import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { requireSensitiveActionAuth } from '@/lib/sensitive-action-server'
import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service'

const VALID_SCOPES = ['payments', 'payouts', 'read', 'webhooks', 'creators', 'credits'] as const

interface ApiKeysRequest {
  action: 'reveal' | 'rotate' | 'create_scoped' | 'list_scoped' | 'revoke_scoped'
  ledger_id: string
  name?: string
  scopes?: string[]
  key_id?: string
}

function keyPreviewFromPrefix(prefix: string | null | undefined): string {
  if (!prefix) return 'Configured (rotate to generate a new visible key)'
  return `${prefix}${'*'.repeat(16)}`
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

function makeApiKey(livemode: boolean): string {
  return `slk_${livemode ? 'live' : 'test'}_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
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
  return createServiceRoleClient()
}

async function updateLedgerApiKeyHash(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  ledgerId: string,
  keyHash: string
) {
  const attempts: Array<Record<string, unknown>> = [
    { api_key_hash: keyHash, api_key: null },
    { api_key_hash: keyHash },
  ]

  let lastError: { message?: string } | null = null

  for (const payload of attempts) {
    const { error } = await serviceClient
      .from('ledgers')
      .update(payload)
      .eq('id', ledgerId)

    if (!error) {
      lastError = null
      break
    }

    lastError = error
    const message = (error.message || '').toLowerCase()
    if (!message.includes('schema cache') && !message.includes('column')) {
      break
    }
  }

  return lastError
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
      .select('id, business_name, api_key_hash, created_at, livemode')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
    }

    const prefixByLedgerId = new Map<string, string>()

    try {
      const { data: apiKeys, error: apiKeysError } = await serviceClient
        .from('api_keys')
        .select('ledger_id, key_prefix, created_at')
        .in('ledger_id', (ledgers || []).map((ledger) => ledger.id))
        .is('revoked_at', null)
        .order('created_at', { ascending: false })

      if (!apiKeysError && Array.isArray(apiKeys)) {
        for (const row of apiKeys) {
          if (!prefixByLedgerId.has(row.ledger_id)) {
            prefixByLedgerId.set(row.ledger_id, row.key_prefix)
          }
        }
      }
    } catch {
      // Non-blocking: api_keys may not exist in older environments.
    }

    // Check org KYC status for the kyc_required flag
    let kycRequired = false
    const { data: orgData } = await serviceClient
      .from('organizations')
      .select('kyc_status')
      .eq('id', membership.organization_id)
      .single()
    if (orgData?.kyc_status && orgData.kyc_status !== 'approved') {
      kycRequired = true
    }

    return NextResponse.json({
      kyc_required: kycRequired,
      ledgers: (ledgers || []).map((ledger) => ({
        id: ledger.id,
        business_name: ledger.business_name,
        livemode: ledger.livemode,
        created_at: ledger.created_at,
        has_key: Boolean(ledger.api_key_hash),
        key_preview: ledger.api_key_hash
          ? keyPreviewFromPrefix(prefixByLedgerId.get(ledger.id))
          : 'No key configured',
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
  async (request, context) => {
    const { user } = context
    const { data: body, error: parseError } = await parseJsonBody<ApiKeysRequest>(request)
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid request body' }, { status: 400 })
    }

    if (!body.ledger_id || !body.action) {
      return NextResponse.json({ error: 'action and ledger_id are required' }, { status: 400 })
    }

    if (!['reveal', 'rotate', 'create_scoped', 'list_scoped', 'revoke_scoped'].includes(body.action)) {
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
      .select('id, livemode')
      .eq('id', body.ledger_id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (ledgerError || !ledger) {
      return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
    }

    // List scoped keys for this ledger
    if (body.action === 'list_scoped') {
      const { data: keys } = await serviceClient
        .from('api_keys')
        .select('id, name, key_prefix, scopes, created_at, last_used_at, expires_at')
        .eq('ledger_id', ledger.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })

      return NextResponse.json({
        keys: (keys || []).map(k => ({
          id: k.id,
          name: k.name,
          preview: keyPreviewFromPrefix(k.key_prefix),
          scopes: k.scopes,
          created_at: k.created_at,
          last_used_at: k.last_used_at,
          expires_at: k.expires_at,
        })),
      })
    }

    // Create a new scoped key
    if (body.action === 'create_scoped') {
      if (!body.name || typeof body.name !== 'string') {
        return NextResponse.json({ error: 'name is required' }, { status: 400 })
      }
      if (!body.scopes || !Array.isArray(body.scopes) || body.scopes.length === 0) {
        return NextResponse.json({ error: 'scopes array is required' }, { status: 400 })
      }
      const invalidScopes = body.scopes.filter(s => !VALID_SCOPES.includes(s as any))
      if (invalidScopes.length > 0) {
        return NextResponse.json({ error: `Invalid scopes: ${invalidScopes.join(', ')}. Valid: ${VALID_SCOPES.join(', ')}` }, { status: 400 })
      }

      const sensitiveAuthFailure = requireSensitiveActionAuth(context, 'create scoped API key')
      if (sensitiveAuthFailure) return sensitiveAuthFailure

      const scopedKey = makeApiKey(Boolean(ledger.livemode))
      const scopedHash = hashApiKey(scopedKey)

      const { error: insertError } = await serviceClient
        .from('api_keys')
        .insert({
          ledger_id: ledger.id,
          name: body.name.slice(0, 100),
          key_hash: scopedHash,
          key_prefix: scopedKey.slice(0, 12),
          scopes: body.scopes,
          created_by: user!.id,
        })

      if (insertError) {
        return NextResponse.json({ error: 'Failed to create scoped key' }, { status: 500 })
      }

      return NextResponse.json({
        key: scopedKey,
        name: body.name,
        scopes: body.scopes,
        preview: keyPreviewFromPrefix(scopedKey.slice(0, 12)),
      })
    }

    // Revoke a scoped key
    if (body.action === 'revoke_scoped') {
      if (!body.key_id) {
        return NextResponse.json({ error: 'key_id is required' }, { status: 400 })
      }

      const sensitiveAuthFailure = requireSensitiveActionAuth(context, 'revoke API key')
      if (sensitiveAuthFailure) return sensitiveAuthFailure

      const { error: revokeError } = await serviceClient
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', body.key_id)
        .eq('ledger_id', ledger.id)

      if (revokeError) {
        return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
      }

      return NextResponse.json({ success: true, revoked: true })
    }

    if (body.action === 'reveal') {
      return NextResponse.json(
        { error: 'API keys are hidden by design. Rotate to generate a new key.' },
        { status: 410 }
      )
    }

    // Block live key rotation if KYC not approved
    if (ledger.livemode) {
      const { data: orgData } = await serviceClient
        .from('organizations')
        .select('kyc_status')
        .eq('id', membership.organization_id)
        .single()

      if (orgData?.kyc_status && orgData.kyc_status !== 'approved') {
        return NextResponse.json(
          { error: 'Complete business verification before managing live API keys' },
          { status: 403 }
        )
      }
    }

    const sensitiveAuthFailure = requireSensitiveActionAuth(context, 'rotate API keys')
    if (sensitiveAuthFailure) {
      return sensitiveAuthFailure
    }

    const nextKey = makeApiKey(Boolean(ledger.livemode))
    const nextHash = hashApiKey(nextKey)

    const updateError = await updateLedgerApiKeyHash(serviceClient, ledger.id, nextHash)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to rotate API key' }, { status: 500 })
    }

    // Best-effort rotate history in api_keys table.
    try {
      await serviceClient
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('ledger_id', ledger.id)
        .is('revoked_at', null)

      await serviceClient
        .from('api_keys')
        .insert({
          ledger_id: ledger.id,
          name: ledger.livemode ? 'Rotated Live Key' : 'Rotated Test Key',
          key_hash: nextHash,
          key_prefix: nextKey.slice(0, 12),
          scopes: ['read', 'write', 'admin'],
          created_by: user!.id,
        })
    } catch {
      // No-op: api_keys table might be unavailable in some environments.
    }

    return NextResponse.json({
      key: nextKey,
      key_preview: keyPreviewFromPrefix(nextKey.slice(0, 12)),
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
