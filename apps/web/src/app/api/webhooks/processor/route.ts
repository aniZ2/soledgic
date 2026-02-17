import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createApiHandler } from '@/lib/api-handler'
import { createHash } from 'crypto'

export const runtime = 'nodejs'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

function getConfiguredWebhookToken(): string | null {
  const token = (process.env.PROCESSOR_WEBHOOK_TOKEN || '').trim()
  return token.length > 0 ? token : null
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function authorizeWebhook(request: Request): { ok: boolean; mode: 'token' | 'disabled'; error?: string } {
  const token = getConfiguredWebhookToken()
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, mode: 'disabled', error: 'Webhook auth is not configured' }
    }
    return { ok: true, mode: 'disabled' }
  }

  const authHeader = (request.headers.get('authorization') || '').trim()
  const headerToken = (request.headers.get('x-soledgic-webhook-token') || request.headers.get('x-webhook-token') || '').trim()
  const candidate = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : headerToken

  if (!candidate) return { ok: false, mode: 'token', error: 'Unauthorized' }
  if (!timingSafeEqualString(candidate, token)) return { ok: false, mode: 'token', error: 'Unauthorized' }
  return { ok: true, mode: 'token' }
}

function safeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase()
    // Avoid persisting secrets and session material to the database.
    if (key === 'authorization') continue
    if (key === 'cookie' || key === 'set-cookie') continue
    if (key === 'x-soledgic-webhook-token' || key === 'x-webhook-token') continue
    if (key === 'x-api-key') continue
    if (key.length > 64) continue
    const value = String(v).slice(0, 512)
    out[key] = value
  }
  return out
}

function pickString(value: unknown, maxLen = 255): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function pickBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function findKeyValueObject(payload: any, maxDepth = 6): Record<string, unknown> | null {
  const visited = new Set<any>()
  const stack: Array<{ node: any; depth: number }> = [{ node: payload, depth: 0 }]

  while (stack.length > 0) {
    const next = stack.pop()
    if (!next) break
    const { node, depth } = next
    if (!node || typeof node !== 'object') continue
    if (visited.has(node)) continue
    visited.add(node)

    // Different processors call this object different things. We accept either.
    if (node.tags && typeof node.tags === 'object' && !Array.isArray(node.tags)) return node.tags as Record<string, unknown>
    if (node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)) return node.metadata as Record<string, unknown>

    if (depth >= maxDepth) continue

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') stack.push({ node: v, depth: depth + 1 })
    }
  }

  return null
}

function extractLedgerId(payload: any): string | null {
  const kv = findKeyValueObject(payload)
  const raw =
    (kv ? (kv['ledger_id'] as unknown) : null) ??
    (kv ? (kv['soledgic_ledger_id'] as unknown) : null) ??
    null
  const ledgerId = pickString(raw, 64)
  // UUID is expected but we don't strictly validate here; DB FK will enforce if set.
  return ledgerId
}

function extractWebhookFields(payload: any) {
  const eventId =
    pickString(payload?.id) ||
    pickString(payload?.event_id) ||
    pickString(payload?.eventId) ||
    null

  const eventType =
    pickString(payload?.type) ||
    pickString(payload?.event_type) ||
    pickString(payload?.eventType) ||
    null

  const livemode = pickBool(payload?.livemode) ?? pickBool(payload?.live_mode) ?? null

  // Best-effort resource id extraction. Different processors nest this differently.
  const resourceId =
    pickString(payload?.resource?.id) ||
    pickString(payload?.data?.id) ||
    pickString(payload?.data?.object?.id) ||
    pickString(payload?.entity?.id) ||
    null

  return { eventId, eventType, resourceId, livemode }
}

function fallbackEventId(rawBody: string): string {
  const hash = createHash('sha256').update(rawBody || '').digest('hex')
  return `sha256:${hash}`
}

export const POST = createApiHandler(
  async (request, { requestId }) => {
    const auth = authorizeWebhook(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'Unauthorized', request_id: requestId }, { status: 401 })
    }

    const rawBody = await request.text()
    let payload: any
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', request_id: requestId }, { status: 400 })
    }

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload', request_id: requestId }, { status: 400 })
    }

    const { eventId, eventType, resourceId, livemode } = extractWebhookFields(payload)
    const ledgerId = extractLedgerId(payload)
    const finalEventId = eventId || fallbackEventId(rawBody)

    const supabase = createServiceClient()
    const { error } = await supabase.from('processor_webhook_inbox').insert({
      ledger_id: ledgerId,
      event_id: finalEventId,
      event_type: eventType,
      resource_id: resourceId,
      livemode,
      headers: safeHeaders(request.headers),
      payload,
      signature_valid: auth.mode === 'token' ? true : null,
      signature_error: null,
      status: 'pending',
      attempts: 0,
    })

    if (error) {
      // Idempotency: accept duplicate event ids.
      if (String((error as any).code || '') === '23505') {
        return NextResponse.json({ success: true, duplicate: true }, { status: 200 })
      }
      return NextResponse.json({ error: 'Failed to store webhook', request_id: requestId }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  },
  {
    requireAuth: false,
    csrfProtection: false,
    rateLimit: true,
    routePath: '/api/webhooks/processor',
    readonlyExempt: true,
    maxBodySize: 2 * 1024 * 1024,
  }
)
