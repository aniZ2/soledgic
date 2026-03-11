// API Proxy: api.soledgic.com/v1/* → Supabase Edge Functions
// Injects Authorization header so customers only need x-api-key

import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Only proxy requests to api.soledgic.com
function isApiHost(req: NextRequest): boolean {
  const host = req.headers.get('host') || ''
  return host === 'api.soledgic.com' || host.startsWith('api.soledgic.com:')
}

async function proxyToSupabase(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!isApiHost(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  const { path } = await params
  const functionPath = path?.join('/') || ''
  const targetUrl = `${SUPABASE_URL}/functions/v1/${functionPath}`

  // Forward all headers, inject Authorization if not present
  const headers = new Headers(req.headers)
  if (!headers.has('authorization') && !headers.has('apikey')) {
    headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
  }

  // Remove host header to avoid conflicts
  headers.delete('host')

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  })

  // Read the full response body — streaming a ReadableStream directly into
  // NextResponse can silently drop the body in some Next.js runtimes.
  const responseBody = await upstream.arrayBuffer()

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('transfer-encoding')
  // fetch() auto-decompresses gzip/br, but the original content-encoding
  // header is still present. Remove it so the client doesn't try to
  // decompress the already-decompressed body (which produces 0 bytes).
  responseHeaders.delete('content-encoding')
  // Set content-length to the actual decompressed body size
  responseHeaders.set('content-length', String(responseBody.byteLength))

  return new NextResponse(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export const GET = proxyToSupabase
export const POST = proxyToSupabase
export const PUT = proxyToSupabase
export const PATCH = proxyToSupabase
export const DELETE = proxyToSupabase
export const OPTIONS = proxyToSupabase
