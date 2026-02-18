import { NextResponse } from 'next/server'

export async function callLedgerFunctionServer(
  endpoint: string,
  options: {
    ledgerId: string
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: Record<string, unknown>
    query?: Record<string, string | number | boolean | null | undefined>
  }
): Promise<Response> {
  const { ledgerId, method = 'POST', body, query } = options

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  const internalToken = process.env.SOLEDGIC_INTERNAL_FUNCTION_TOKEN || process.env.INTERNAL_FUNCTION_TOKEN
  if (!internalToken) {
    throw new Error('SOLEDGIC_INTERNAL_FUNCTION_TOKEN is not configured')
  }

  const url = new URL(`${supabaseUrl}/functions/v1/${endpoint}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }

  const headers = new Headers()
  headers.set('x-soledgic-internal-token', internalToken)
  headers.set('x-ledger-id', ledgerId)

  let payload: string | undefined
  if (method !== 'GET' && method !== 'DELETE') {
    headers.set('Content-Type', 'application/json')
    payload = JSON.stringify({ ...(body || {}), ledger_id: ledgerId })
  }

  return fetch(url.toString(), {
    method,
    headers,
    body: payload,
    cache: 'no-store',
  })
}

export async function jsonFromResponse(response: Response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

export function proxyResponse(response: Response, fallbackContentType = 'application/octet-stream') {
  const result = new NextResponse(response.body, { status: response.status })
  const contentType = response.headers.get('content-type') || fallbackContentType
  result.headers.set('Content-Type', contentType)
  const disposition = response.headers.get('content-disposition')
  if (disposition) {
    result.headers.set('Content-Disposition', disposition)
  }
  return result
}
