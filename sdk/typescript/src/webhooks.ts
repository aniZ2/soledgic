/**
 * Soledgic SDK Webhook Utilities
 * Signature verification and event parsing
 */

import type { WebhookPayloadInput, VerifyWebhookSignatureOptions, ParsedWebhookEvent } from './types'

export function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)
}

export function webhookPayloadToString(payload: WebhookPayloadInput): string {
  if (typeof payload === 'string') {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(payload))
  }

  if (isArrayBufferView(payload)) {
    return new TextDecoder().decode(payload)
  }

  return JSON.stringify(payload)
}

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

export async function hmacHex(secret: string, payload: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is not available in this runtime')
  }

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function parseWebhookSignatureHeader(signatureHeader: string): {
  timestamp: number | null
  v1Signatures: string[]
  legacySignature: string | null
} {
  if (!signatureHeader) {
    return { timestamp: null, v1Signatures: [], legacySignature: null }
  }

  if (signatureHeader.startsWith('sha256=')) {
    return {
      timestamp: null,
      v1Signatures: [],
      legacySignature: signatureHeader.slice('sha256='.length),
    }
  }

  let timestamp: number | null = null
  const v1Signatures: string[] = []

  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.trim().split('=')
    if (!key || !value) continue

    if (key === 't') {
      const numeric = Number(value)
      timestamp = Number.isFinite(numeric) ? numeric : null
    } else if (key === 'v1') {
      v1Signatures.push(value)
    }
  }

  return { timestamp, v1Signatures, legacySignature: null }
}

function toEpochSeconds(value?: number | Date): number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }
  return Math.floor(Date.now() / 1000)
}

export async function verifyWebhookSignature(
  payload: WebhookPayloadInput,
  signatureHeader: string,
  secret: string,
  options: VerifyWebhookSignatureOptions = {},
): Promise<boolean> {
  const payloadString = webhookPayloadToString(payload)
  const parsed = parseWebhookSignatureHeader(signatureHeader)

  if (parsed.legacySignature) {
    const expected = await hmacHex(secret, payloadString)
    return timingSafeEqual(parsed.legacySignature, expected)
  }

  if (parsed.timestamp === null || parsed.v1Signatures.length === 0) {
    return false
  }

  const toleranceSeconds = options.toleranceSeconds ?? 300
  if (toleranceSeconds > 0) {
    const nowSeconds = toEpochSeconds(options.now)
    if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
      return false
    }
  }

  const expected = await hmacHex(secret, `${parsed.timestamp}.${payloadString}`)
  return parsed.v1Signatures.some((signature) => timingSafeEqual(signature, expected))
}

export function parseWebhookEvent<T = Record<string, unknown>>(
  payload: WebhookPayloadInput,
): ParsedWebhookEvent<T> {
  const payloadString = webhookPayloadToString(payload)
  const parsed = JSON.parse(payloadString) as Record<string, unknown>
  const type =
    typeof parsed.type === 'string'
      ? parsed.type
      : typeof parsed.event === 'string'
        ? parsed.event
        : 'unknown'

  return {
    id: typeof parsed.id === 'string' ? parsed.id : null,
    type,
    createdAt: typeof parsed.created_at === 'string' ? parsed.created_at : null,
    livemode: typeof parsed.livemode === 'boolean' ? parsed.livemode : null,
    data: (parsed.data as T | null | undefined) ?? null,
    raw: parsed,
  }
}
