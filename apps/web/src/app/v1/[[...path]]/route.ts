// API Proxy: soledgic.com/v1/* and api.soledgic.com/v1/* → Supabase Edge Functions
// Injects Authorization header so customers only need x-api-key

import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type RouteParams = { params: Promise<{ path?: string[] }> }

const PUBLIC_API_HOSTS = ['api.soledgic.com', 'soledgic.com', 'www.soledgic.com']
function hostMatches(host: string, expected: string): boolean {
  return host === expected || host.startsWith(`${expected}:`)
}

// Allow the public API on the main site, dedicated API host, and preview/local hosts.
function isApiHost(req: NextRequest): boolean {
  const host = (req.headers.get('host') || '').toLowerCase()
  return (
    PUBLIC_API_HOSTS.some((allowed) => hostMatches(host, allowed)) ||
    host.endsWith('.vercel.app') ||
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host === '127.0.0.1' ||
    host.startsWith('127.0.0.1:')
  )
}

function injectAuthorization(headers: Headers) {
  if (!headers.has('authorization') && !headers.has('apikey')) {
    headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
  }
}

function createForwardHeaders(req: NextRequest) {
  const headers = new Headers(req.headers)
  injectAuthorization(headers)
  headers.delete('host')
  return headers
}

async function proxyRawRequest(req: NextRequest, functionPath: string) {
  const headers = createForwardHeaders(req)
  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined

  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/${functionPath}`, {
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

async function proxyToSupabase(req: NextRequest, { params }: RouteParams) {
  if (!isApiHost(req)) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  const { path } = await params
  const segments = path || []
  if (segments.length === 0) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  const functionPath = segments.join('/')
  return proxyRawRequest(req, functionPath)
}

export const GET = proxyToSupabase
export const POST = proxyToSupabase
export const PUT = proxyToSupabase
export const PATCH = proxyToSupabase
export const DELETE = proxyToSupabase
export const OPTIONS = proxyToSupabase
