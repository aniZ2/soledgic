// Soledgic: Network security utilities
// Extracted from utils.ts — SSRF protection, IP validation, timing-safe comparison.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvironment(): string {
  const env = (Deno.env.get('ENVIRONMENT') || Deno.env.get('NODE_ENV') || '').trim().toLowerCase()
  if (env === 'development' || env === 'staging') return env
  return 'production'
}

function isProductionEnv(): boolean {
  return getEnvironment() === 'production'
}

// ── IP Extraction ───────────────────────────────────────────────────

export function getClientIp(req: Request): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return null
}

// ── Timing-Safe Comparison ──────────────────────────────────────────

export function timingSafeEqual(a: string, b: string): boolean {
  const aLen = a.length
  const bLen = b.length
  const maxLen = Math.max(aLen, bLen)
  let result = aLen ^ bLen
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < aLen ? a.charCodeAt(i) : 0
    const bChar = i < bLen ? b.charCodeAt(i) : 0
    result |= aChar ^ bChar
  }
  return result === 0
}

// ── SSRF Protection ─────────────────────────────────────────────────

const BLOCKED_IP_PATTERNS = [
  /^10\./, /^172\.(1[6-9]|2\d|3[01])\./,  /^192\.168\./,
  /^127\./, /^169\.254\./, /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^192\.0\.0\./, /^192\.0\.2\./, /^198\.51\.100\./,
  /^203\.0\.113\./, /^224\./, /^240\./,
]

function normalizeIpLiteral(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%')[0]
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = normalizeIpLiteral(ip)
  if (!normalized.includes(':')) return false
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true
  if (normalized.startsWith('ff')) return true
  if (normalized.startsWith('2001:db8:')) return true
  const mappedIpv4Match = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4Match && mappedIpv4Match[1]) {
    return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(mappedIpv4Match[1]))
  }
  return false
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'metadata.google.internal',
  'metadata', 'kubernetes', 'kubernetes.default', 'kubernetes.default.svc',
])

export function isPrivateIP(ip: string): boolean {
  const normalized = normalizeIpLiteral(ip)
  if (normalized.includes(':')) return isPrivateIpv6(normalized)
  return BLOCKED_IP_PATTERNS.some(pattern => pattern.test(normalized))
}

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return BLOCKED_HOSTNAMES.has(lower) ||
    lower.endsWith('.internal') ||
    lower.endsWith('.local') ||
    lower.endsWith('.svc.cluster.local')
}

export function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const normalizedHostname = normalizeIpLiteral(parsed.hostname)
    if (isProductionEnv() && parsed.protocol !== 'https:') return 'Only HTTPS URLs allowed in production'
    if (!['http:', 'https:'].includes(parsed.protocol)) return `Invalid protocol: ${parsed.protocol}`
    if (isBlockedHostname(normalizedHostname)) return 'Blocked hostname'
    if (isPrivateIP(normalizedHostname)) return 'Private IP addresses not allowed'
    if (normalizedHostname === '0.0.0.0' || normalizedHostname === '::') return 'Invalid hostname'
    return null
  } catch {
    return 'Invalid URL format'
  }
}

export async function safeWebhookFetch(
  url: string,
  payload: any,
  options: {
    timeout?: number
    headers?: Record<string, string>
    supabase?: SupabaseClient
    ledgerId?: string
    requestId?: string
  } = {}
): Promise<Response> {
  const urlError = validateWebhookUrl(url)
  if (urlError) {
    if (options.supabase) {
      await options.supabase.from('audit_log').insert({
        ledger_id: options.ledgerId || null,
        action: 'ssrf_attempt',
        actor_type: 'system',
        request_body: { url: url.substring(0, 200), error: urlError, stage: 'url_validation' },
        risk_score: 90,
      }).then(() => {}, () => {})
    }
    throw new Error(`SSRF Protection: ${urlError}`)
  }

  const parsed = new URL(url)
  let resolvedAny = false
  const validatedIps: string[] = []

  for (const recordType of ['A', 'AAAA'] as const) {
    try {
      const addresses = await Deno.resolveDns(parsed.hostname, recordType)
      if (!addresses || addresses.length === 0) continue
      resolvedAny = true
      for (const addr of addresses) {
        if (isPrivateIP(addr)) {
          if (options.supabase) {
            await options.supabase.from('audit_log').insert({
              ledger_id: options.ledgerId || null,
              action: 'ssrf_attempt',
              actor_type: 'system',
              request_body: { url: url.substring(0, 200), hostname: parsed.hostname, resolved_ip: addr, stage: 'dns_rebinding' },
              risk_score: 90,
            }).then(() => {}, () => {})
          }
          throw new Error(`SSRF Protection: Resolved to private IP ${addr}`)
        }
        validatedIps.push(addr)
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('SSRF Protection: Resolved to private IP')) throw err
      continue
    }
  }

  if (!resolvedAny || validatedIps.length === 0) {
    throw new Error('SSRF Protection: Cannot resolve hostname')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Soledgic-Webhook/1.0', ...options.headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
  const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(text).replace(/[&<>"']/g, char => htmlEntities[char] || char)
}
