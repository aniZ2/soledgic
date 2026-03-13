const WEBHOOK_SECRET_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

export interface WebhookSigningOptions {
  timestamp?: number
  previousSecret?: string | null
  secretRotatedAt?: string | null
}

export interface WebhookHeaderOptions extends WebhookSigningOptions {
  eventType: string
  deliveryId: string
  attempt?: number
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function signWebhookPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

function previousSecretIsActive(secretRotatedAt?: string | null): boolean {
  if (!secretRotatedAt) return false

  const rotatedAtMs = Date.parse(secretRotatedAt)
  if (!Number.isFinite(rotatedAtMs)) return false

  return Date.now() - rotatedAtMs <= WEBHOOK_SECRET_GRACE_PERIOD_MS
}

export async function buildWebhookSignatureHeader(
  payload: string,
  secret: string,
  options: WebhookSigningOptions = {},
): Promise<string> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${payload}`
  const signatures = [await signWebhookPayload(signedPayload, secret)]

  if (options.previousSecret && previousSecretIsActive(options.secretRotatedAt)) {
    signatures.push(await signWebhookPayload(signedPayload, options.previousSecret))
  }

  return `t=${timestamp},${signatures.map((signature) => `v1=${signature}`).join(',')}`
}

export async function buildWebhookHeaders(
  payload: string,
  secret: string,
  options: WebhookHeaderOptions,
): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)
  const signature = await buildWebhookSignatureHeader(payload, secret, {
    timestamp,
    previousSecret: options.previousSecret,
    secretRotatedAt: options.secretRotatedAt,
  })

  return {
    'Content-Type': 'application/json',
    'X-Soledgic-Signature': signature,
    'X-Soledgic-Timestamp': String(timestamp),
    'X-Soledgic-Event': options.eventType,
    'X-Soledgic-Delivery-Id': options.deliveryId,
    'X-Soledgic-Attempt': String(options.attempt ?? 1),
    'User-Agent': 'Soledgic-Webhook/1.0',
  }
}
