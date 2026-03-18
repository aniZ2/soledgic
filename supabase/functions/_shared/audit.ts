// Soledgic: Audit logging and PII sanitization
// Extracted from utils.ts for reduced blast radius.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getClientIp } from './network-security.ts'

// ── PII Sanitization ────────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set([
  'account_number', 'routing_number', 'ssn', 'tax_id', 'bank_account',
  'access_token', 'api_key', 'webhook_secret', 'password', 'secret',
])

export function sanitizeForAudit(obj: any, depth = 0): any {
  if (depth > 10) return '[max depth]'
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForAudit(item, depth + 1))
  }

  const sanitized: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_FIELDS.has(lowerKey) ||
        lowerKey.includes('account_number') ||
        lowerKey.includes('routing') ||
        lowerKey.includes('ssn') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password')) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeForAudit(value, depth + 1)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ── Audit Log Entry ─────────────────────────────────────────────────

export interface AuditLogEntry {
  ledger_id: string | null
  action: string
  entity_type?: string
  entity_id?: string
  actor_type: 'api' | 'system' | 'admin' | 'webhook' | 'automation'
  actor_id?: string
  request_body?: Record<string, any>
  response_status?: number
  risk_score?: number
  duration_ms?: number
}

export async function createAuditLog(
  supabase: SupabaseClient,
  req: Request,
  entry: AuditLogEntry,
  requestId?: string
): Promise<void> {
  try {
    const clientIp = getClientIp(req)
    const userAgent = req.headers.get('user-agent')

    const headerActorType = req.headers.get('x-actor-type')?.trim().toLowerCase()
    const headerActorId = req.headers.get('x-actor-id')?.trim()
    const headerActorSource = req.headers.get('x-actor-source')?.trim()
    const VALID_ACTOR_TYPES = new Set(['api', 'system', 'admin', 'webhook', 'automation'])
    const resolvedActorType = (headerActorType && VALID_ACTOR_TYPES.has(headerActorType))
      ? headerActorType : entry.actor_type
    const resolvedActorId = headerActorId || entry.actor_id
    const resolvedActorSource = headerActorSource || null

    const sanitizedBody = entry.request_body ? sanitizeForAudit(entry.request_body) : null

    await supabase.from('audit_log').insert({
      ledger_id: entry.ledger_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      actor_type: resolvedActorType,
      actor_id: resolvedActorId,
      actor_source: resolvedActorSource,
      ip_address: clientIp,
      user_agent: userAgent?.substring(0, 500),
      request_id: requestId,
      request_body: sanitizedBody,
      response_status: entry.response_status,
      risk_score: entry.risk_score ?? 0,
      duration_ms: entry.duration_ms,
    })
  } catch (err) {
    console.error('Failed to create audit log:', err)
  }
}

export function createAuditLogAsync(
  supabase: SupabaseClient,
  req: Request,
  entry: AuditLogEntry,
  requestId?: string
): void {
  createAuditLog(supabase, req, entry, requestId).catch(() => {})
}

export async function logSecurityEvent(
  supabase: SupabaseClient,
  ledgerId: string | null,
  action: string,
  details: Record<string, any>,
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      ledger_id: ledgerId,
      action,
      actor_type: 'system',
      actor_id: 'security-monitor',
      request_body: sanitizeForAudit(details),
      risk_score: 80,
    })
  } catch (err) {
    console.error('Failed to log security event:', err)
  }
}
