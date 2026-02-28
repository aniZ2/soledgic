import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { createHash } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorCode(error: unknown): string | null {
  if (!isJsonRecord(error)) return null
  const code = error.code
  return typeof code === 'string' ? code : null
}

function createServiceClient() {
  return createServiceRoleClient()
}

function getConfiguredWebhookToken(): string | null {
  const token = (process.env.PROCESSOR_WEBHOOK_TOKEN || '').trim()
  return token.length > 0 ? token : null
}

function isFlagEnabled(value: string | undefined): boolean {
  return (value || '').trim().toLowerCase() === 'true'
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function extractWebhookAuthCandidate(request: Request, allowQueryToken: boolean): string | null {
  const authHeader = (request.headers.get('authorization') || '').trim()
  const headerToken = (request.headers.get('x-soledgic-webhook-token') || request.headers.get('x-webhook-token') || '').trim()
  const urlToken = allowQueryToken ? (() => {
    try {
      const url = new URL(request.url)
      return (
        (url.searchParams.get('token') || '').trim() ||
        (url.searchParams.get('t') || '').trim() ||
        (url.searchParams.get('webhook_token') || '').trim() ||
        null
      )
    } catch {
      return null
    }
  })() : null

  const lower = authHeader.toLowerCase()
  const bearer = lower.startsWith('bearer ') ? authHeader.slice('bearer '.length).trim() : null
  const basic = lower.startsWith('basic ') ? authHeader.slice('basic '.length).trim() : null
  const basicPassword = (() => {
    if (!basic) return null
    try {
      const decoded = Buffer.from(basic, 'base64').toString('utf8')
      const idx = decoded.indexOf(':')
      if (idx < 0) return null
      return decoded.slice(idx + 1).trim() || null
    } catch {
      return null
    }
  })()

  // Prefer header-based auth. Query param token support is opt-in only.
  return bearer || basicPassword || headerToken || urlToken
}

function authorizeWebhook(request: Request): { ok: boolean; mode: 'token' | 'disabled'; error?: string } {
  const token = getConfiguredWebhookToken()
  const allowInsecureAuth =
    process.env.NODE_ENV !== 'production' &&
    isFlagEnabled(process.env.ALLOW_INSECURE_WEBHOOK_AUTH)
  const allowQueryToken =
    process.env.NODE_ENV !== 'production' &&
    isFlagEnabled(process.env.ALLOW_QUERY_PARAM_WEBHOOK_TOKEN)

  if (!token) {
    if (allowInsecureAuth) {
      return { ok: true, mode: 'disabled' }
    }
    return { ok: false, mode: 'disabled', error: 'Webhook auth is not configured' }
  }

  const candidate = extractWebhookAuthCandidate(request, allowQueryToken)

  if (!candidate) return { ok: false, mode: 'token', error: 'Unauthorized' }
  if (!timingSafeEqualString(candidate, token)) return { ok: false, mode: 'token', error: 'Unauthorized' }
  return { ok: true, mode: 'token' }
}

function safeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  const blockedKeys = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-soledgic-webhook-token',
    'x-webhook-token',
    'x-api-key',
    'forwarded',
    'x-vercel-oidc-token',
    'x-vercel-proxy-signature',
    'x-vercel-proxy-signature-ts',
    'x-vercel-forwarded-for',
  ])

  const containsSensitiveValue = (value: string): boolean => {
    if (/bearer\s+[a-z0-9._-]+/i.test(value)) return true
    if (/"authorization"\s*:\s*"bearer\s+[^\"]+"/i.test(value)) return true
    if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)) return true
    return false
  }

  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase()
    // Avoid persisting secrets and session material to the database.
    if (blockedKeys.has(key)) continue
    if (key.startsWith('x-vercel-sc-')) continue
    if (key.length > 64) continue
    const value = String(v).slice(0, 512)
    if (containsSensitiveValue(value)) continue
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

function findKeyValueObject(payload: unknown, maxDepth = 6): JsonRecord | null {
  const visited = new Set<object>()
  const stack: Array<{ node: unknown; depth: number }> = [{ node: payload, depth: 0 }]

  while (stack.length > 0) {
    const next = stack.pop()
    if (!next) break
    const { node, depth } = next
    if (!isJsonRecord(node)) continue
    if (visited.has(node)) continue
    visited.add(node)

    // Different processors call this object different things. We accept either.
    if (isJsonRecord(node.tags)) return node.tags
    if (isJsonRecord(node.metadata)) return node.metadata

    if (depth >= maxDepth) continue

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') stack.push({ node: v, depth: depth + 1 })
    }
  }

  return null
}

function extractLedgerId(payload: unknown): string | null {
  const kv = findKeyValueObject(payload)
  const raw = (kv ? kv['ledger_id'] : null) ?? (kv ? kv['soledgic_ledger_id'] : null) ?? null
  const ledgerId = pickString(raw, 64)
  // UUID is expected but we don't strictly validate here; DB FK will enforce if set.
  return ledgerId
}

function extractWebhookFields(payload: unknown) {
  const root = isJsonRecord(payload) ? payload : null
  const resource = root && isJsonRecord(root.resource) ? root.resource : null
  const data = root && isJsonRecord(root.data) ? root.data : null
  const dataObject = data && isJsonRecord(data.object) ? data.object : null
  const entity = root && isJsonRecord(root.entity) ? root.entity : null

  const eventId =
    pickString(root ? root.id : null) ||
    pickString(root ? root.event_id : null) ||
    pickString(root ? root.eventId : null) ||
    null

  const eventType =
    pickString(root ? root.type : null) ||
    pickString(root ? root.event_type : null) ||
    pickString(root ? root.eventType : null) ||
    null

  const livemode = pickBool(root ? root.livemode : null) ?? pickBool(root ? root.live_mode : null) ?? null

  // Best-effort resource id extraction. Different processors nest this differently.
  const resourceId =
    pickString(resource ? resource.id : null) ||
    pickString(data ? data.id : null) ||
    pickString(dataObject ? dataObject.id : null) ||
    pickString(entity ? entity.id : null) ||
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
    let payload: unknown
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', request_id: requestId }, { status: 400 })
    }

    if (!isJsonRecord(payload)) {
      return NextResponse.json({ error: 'Invalid payload', request_id: requestId }, { status: 400 })
    }

    const { eventId, eventType, resourceId, livemode } = extractWebhookFields(payload)
    const ledgerId = extractLedgerId(payload)
    const finalEventId = eventId || fallbackEventId(rawBody)

    const supabase = createServiceClient()
    const inboxRow = {
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
    }

    let { error } = await supabase.from('processor_webhook_inbox').insert(inboxRow)

    // If the payload contains an invalid/non-existent ledger_id tag, keep the
    // webhook instead of dropping it.
    if (error && getErrorCode(error) === '23503' && inboxRow.ledger_id) {
      const retry = await supabase.from('processor_webhook_inbox').insert({
        ...inboxRow,
        ledger_id: null,
      })
      error = retry.error
    }

    if (error) {
      // Idempotency: accept duplicate event ids.
      if (getErrorCode(error) === '23505') {
        return NextResponse.json({ success: true, duplicate: true }, { status: 200 })
      }
      return NextResponse.json({ error: 'Failed to store webhook', request_id: requestId }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  },
  {
    requireAuth: false,
    csrfProtection: false,
    // Webhook traffic is authenticated via shared secret and idempotent by event_id.
    // Disable generic pre-auth limiter to avoid cross-tenant/shared-IP throttling.
    rateLimit: false,
    routePath: '/api/webhooks/processor',
    readonlyExempt: true,
    maxBodySize: 2 * 1024 * 1024,
  }
)
