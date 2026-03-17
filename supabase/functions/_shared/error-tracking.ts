// Soledgic: Lightweight Sentry integration for Deno Edge Functions
// Uses HTTP envelope API directly (no @sentry/deno dependency)
// Fire-and-forget: never blocks or affects request processing

// PII scrubbing patterns — mirrors sanitizeErrorMessage in utils.ts
const PII_PATTERNS: [RegExp, string][] = [
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'],
  [/\b\d{2}-\d{7}\b/g, '[EIN]'],
  [/eyJ[A-Za-z0-9_-]+/g, '[TOKEN]'],
  [/slk_[a-zA-Z0-9_]+/g, '[KEY]'],
  [/sk_[a-zA-Z0-9]+/g, '[KEY]'],
  [/whsec_[a-zA-Z0-9]+/g, '[SECRET]'],
  [/sntrys_[a-zA-Z0-9]+/g, '[SECRET]'],
  [/\/[^\s"',)]+/g, '[PATH]'],
  [/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]'],
  [/\b[A-Za-z0-9+/]{40,}\b/g, '[REDACTED]'],
]

export function scrubPII(value: string): string {
  let result = value
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result.substring(0, 500)
}

// Parse DSN once and cache
interface ParsedDSN {
  publicKey: string
  host: string
  projectId: string
  ingestUrl: string
}

let cachedDSN: ParsedDSN | null | undefined = undefined

function parseDSN(): ParsedDSN | null {
  if (cachedDSN !== undefined) return cachedDSN

  const dsn = Deno.env.get('SENTRY_DSN')
  if (!dsn) {
    cachedDSN = null
    return null
  }

  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace('/', '')
    const host = url.hostname

    cachedDSN = {
      publicKey,
      host,
      projectId,
      ingestUrl: `https://${host}/api/${projectId}/envelope/`,
    }
    return cachedDSN
  } catch {
    console.warn('Sentry: invalid DSN format')
    cachedDSN = null
    return null
  }
}

interface CaptureContext {
  requestId?: string
  endpoint?: string
  ledgerId?: string | null
  duration?: number
  clientIp?: string
  [key: string]: unknown
}

/**
 * Capture an exception and send to Sentry.
 * Fire-and-forget with 5s timeout. Never throws, never blocks.
 */
export function captureException(error: Error, context?: CaptureContext): void {
  const parsed = parseDSN()
  if (!parsed) return

  // Build and send asynchronously — do not await
  sendEnvelope(parsed, error, context).catch(() => {
    // Silently swallow — Sentry failures must never affect requests
  })
}

async function sendEnvelope(
  dsn: ParsedDSN,
  error: Error,
  context?: CaptureContext,
): Promise<void> {
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const timestamp = Date.now() / 1000

  const scrubbedMessage = scrubPII(error.message || 'Unknown error')
  const scrubbedStack = error.stack ? scrubPII(error.stack) : undefined

  const event = {
    event_id: eventId,
    timestamp,
    platform: 'javascript' as const,
    level: 'error' as const,
    server_name: 'supabase-edge',
    environment: Deno.env.get('ENVIRONMENT') || 'production',
    tags: {
      runtime: 'deno',
      ...(context?.endpoint ? { endpoint: context.endpoint } : {}),
      ...(context?.requestId ? { request_id: context.requestId } : {}),
    },
    extra: {
      ...(context?.ledgerId ? { ledger_id: context.ledgerId } : {}),
      ...(context?.duration !== undefined ? { duration_ms: context.duration } : {}),
    },
    exception: {
      values: [
        {
          type: error.name || 'Error',
          value: scrubbedMessage,
          ...(scrubbedStack
            ? {
                stacktrace: {
                  frames: parseStackFrames(scrubbedStack),
                },
              }
            : {}),
        },
      ],
    },
  }

  // Sentry envelope format: header\nitem_header\npayload
  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    sent_at: new Date().toISOString(),
    dsn: `https://${dsn.publicKey}@${dsn.host}/${dsn.projectId}`,
  })
  const itemHeader = JSON.stringify({
    type: 'event',
    length: JSON.stringify(event).length,
  })
  const envelope = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`

  await fetch(dsn.ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=soledgic-deno/1.0, sentry_key=${dsn.publicKey}`,
    },
    body: envelope,
    signal: AbortSignal.timeout(5000),
  })
}

export function parseStackFrames(
  stack: string,
): Array<{ filename: string; lineno?: number; colno?: number; function?: string }> {
  const frames: Array<{
    filename: string
    lineno?: number
    colno?: number
    function?: string
  }> = []

  const lines = stack.split('\n').slice(1) // skip first line (error message)
  for (const line of lines.slice(0, 10)) {
    // Limit to 10 frames
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
    if (match) {
      frames.push({
        function: match[1],
        filename: match[2],
        lineno: parseInt(match[3], 10),
        colno: parseInt(match[4], 10),
      })
    } else {
      const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/)
      if (simpleMatch) {
        frames.push({
          filename: simpleMatch[1],
          lineno: parseInt(simpleMatch[2], 10),
          colno: parseInt(simpleMatch[3], 10),
        })
      }
    }
  }

  // Sentry expects frames in reverse order (outermost first)
  return frames.reverse()
}
