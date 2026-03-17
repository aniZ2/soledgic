// Secure API handler wrapper for Next.js routes
// Includes: CSRF protection, rate limiting, error sanitization, audit logging

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { validateCsrf } from './csrf'
import { checkRateLimit, getRateLimitKey, getRouteLimit, type RateLimitConfig } from './rate-limit'
import { getReadonly } from './livemode-server'

interface PendingAuthCookie {
  name: string
  value: string
  options?: {
    domain?: string
    path?: string
    maxAge?: number
    expires?: Date
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    priority?: 'low' | 'medium' | 'high'
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

interface CookieEntry {
  name: string
  value: string
}

export function parseCookieHeader(rawCookie: string): CookieEntry[] {
  if (!rawCookie) return []

  return rawCookie
    .split(';')
    .map((pair) => {
      const idx = pair.indexOf('=')
      if (idx === -1) return { name: pair.trim(), value: '' }
      return {
        name: pair.slice(0, idx).trim(),
        value: pair.slice(idx + 1).trim(),
      }
    })
    .filter((cookie) => cookie.name.length > 0)
}

export function mergeCookieEntries(primary: CookieEntry[], fallback: CookieEntry[]): CookieEntry[] {
  const merged = new Map<string, string>()

  for (const cookie of primary) {
    merged.set(cookie.name, cookie.value)
  }

  for (const cookie of fallback) {
    if (!merged.has(cookie.name)) {
      merged.set(cookie.name, cookie.value)
    }
  }

  return Array.from(merged.entries()).map(([name, value]) => ({ name, value }))
}

export function parsePendingAuthCookies(cookiesToSet: unknown): PendingAuthCookie[] {
  if (!Array.isArray(cookiesToSet)) return []

  const parsed: PendingAuthCookie[] = []
  for (const item of cookiesToSet) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' ? item.name : null
    const value = typeof item.value === 'string' ? item.value : null
    if (!name || value === null) continue

    const rawOptions = isRecord(item.options) ? item.options : null
    const options: PendingAuthCookie['options'] = rawOptions
      ? {
          ...(typeof rawOptions.domain === 'string' ? { domain: rawOptions.domain } : {}),
          ...(typeof rawOptions.path === 'string' ? { path: rawOptions.path } : {}),
          ...(typeof rawOptions.maxAge === 'number' ? { maxAge: rawOptions.maxAge } : {}),
          ...(rawOptions.expires instanceof Date ? { expires: rawOptions.expires } : {}),
          ...(typeof rawOptions.httpOnly === 'boolean' ? { httpOnly: rawOptions.httpOnly } : {}),
          ...(typeof rawOptions.secure === 'boolean' ? { secure: rawOptions.secure } : {}),
          ...(rawOptions.sameSite === 'strict' || rawOptions.sameSite === 'lax' || rawOptions.sameSite === 'none'
            ? { sameSite: rawOptions.sameSite }
            : {}),
          ...(rawOptions.priority === 'low' || rawOptions.priority === 'medium' || rawOptions.priority === 'high'
            ? { priority: rawOptions.priority }
            : {}),
        }
      : undefined

    parsed.push({ name, value, options })
  }
  return parsed
}

export function getErrorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  return { name: 'UnknownError', message: 'An unexpected error occurred' }
}

export interface ApiContext {
  user: { id: string; email?: string } | null
  authUser: User | null
  accessToken: string | null
  requestId: string
  startTime: number
}

export interface ApiHandlerOptions {
  // Require authentication (default: true)
  requireAuth?: boolean
  // Enable rate limiting (default: true)
  rateLimit?: boolean
  // Enable CSRF protection (default: true for mutations)
  csrfProtection?: boolean
  // Max request body size in bytes (default: 1MB)
  maxBodySize?: number
  // Route path for rate limiting
  routePath?: string
  // Optional custom key builder for rate limiting.
  rateLimitKey?: (request: Request, context: Pick<ApiContext, 'user'>) => string
  // Optional route-specific limit override.
  rateLimitConfig?: RateLimitConfig
  // Exempt this endpoint from read-only mode enforcement (default: false)
  readonlyExempt?: boolean
}

type ApiHandler = (
  request: Request,
  context: ApiContext
) => Promise<NextResponse>

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`
}

/**
 * Get client IP from request headers
 */
function getClientIp(request: Request): string {
  const ipCandidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-forwarded-for'),
  ]
  return ipCandidates
    .map((candidate) => (candidate || '').split(',')[0].trim())
    .find((candidate) => candidate.length > 0) || 'unknown'
}

/**
 * Sanitize error messages for production
 */
function sanitizeError(message: string): string {
  if (process.env.NODE_ENV !== 'production') {
    return message
  }
  
  // Remove potentially sensitive patterns
  return message
    .replace(/\/[^\s]+/g, '[path]')           // File paths
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]')  // IP addresses
    .replace(/eyJ[A-Za-z0-9_-]+/g, '[token]') // JWT tokens
    .replace(/slk_[a-zA-Z0-9_]+/g, '[key]')   // Soledgic API keys
    .replace(/sk_[a-zA-Z0-9]+/g, '[key]')    // Stripe API keys
    .substring(0, 200)
}

/**
 * Create a secure API handler with all protections enabled
 */
export function createApiHandler(
  handler: ApiHandler,
  options: ApiHandlerOptions = {}
): (request: Request) => Promise<NextResponse> {
  const {
    requireAuth = true,
    rateLimit = true,
    csrfProtection = true,
    maxBodySize = 1024 * 1024, // 1MB default
    routePath = '/api',
    rateLimitKey: customRateLimitKey,
    rateLimitConfig,
    readonlyExempt = false,
  } = options
  
  return async (request: Request): Promise<NextResponse> => {
    const startTime = Date.now()
    const requestId = generateRequestId()
    const clientIp = getClientIp(request)
    let user: { id: string; email?: string } | null = null
    let authUser: User | null = null
    let accessToken: string | null = null

    try {
      // 1. CSRF Protection (for mutations)
      if (csrfProtection) {
        const { valid, error } = await validateCsrf(request)
        if (!valid) {
          console.warn(`[${requestId}] CSRF validation failed: ${error}`)
          return NextResponse.json(
            { error: 'Access denied', request_id: requestId },
            { status: 403 }
          )
        }
      }

      // 2. Authentication
      // Track cookies set by Supabase during auth (e.g. token refresh)
      // so we can merge them into the final response. Without this,
      // a token refresh would consume the old refresh token but the new
      // tokens would be lost — logging the user out on the next request.
      const pendingAuthCookies: PendingAuthCookie[] = []

      if (requireAuth) {
        const cookieStore = await cookies()
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
        const authCookieBase = `sb-${projectRef}-auth-token`

        // Merge cookies() with raw Cookie header fallback.
        // In some runtimes, cookies() can be partially populated for chunked
        // auth cookies even when non-auth cookies are present.
        const cookieEntries = mergeCookieEntries(
          cookieStore.getAll(),
          parseCookieHeader(request.headers.get('cookie') ?? '')
        )

        const matchedAuthCookies = cookieEntries
          .filter(c => c.name === authCookieBase || c.name.startsWith(`${authCookieBase}.`))

        const supabase = createServerClient(
          supabaseUrl,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return cookieEntries
              },
              setAll(cookiesToSet) {
                pendingAuthCookies.push(...parsePendingAuthCookies(cookiesToSet))
              },
            },
          }
        )
        const { data: { user: cookieAuthUser }, error: authError } = await supabase.auth.getUser()
        authUser = cookieAuthUser
        let bearerErrorMessage: string | null = null

        // 2b. Bearer token fallback — if cookie auth fails, try the
        // Authorization header (sent by fetchWithCsrf on the client).
        const authHeader = request.headers.get('authorization')
        const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
        const bearerToken = bearerMatch?.[1]?.trim() ?? null

        if (!authUser && bearerToken) {
          const { data: bearerData, error: bearerError } = await supabase.auth.getUser(bearerToken)
          bearerErrorMessage = bearerError?.message ?? null
          authUser = bearerData.user
        }

        if (!authUser) {
          // CRITICAL: Never set auth cookies on unauthorized responses.
          //
          // Supabase may attempt a refresh and, on failure (including refresh-token rotation races),
          // enqueue cookie deletions via setAll(). If we propagate those deletions, a single transient
          // 401 (e.g. /api/notifications polling) hard-logs the user out.
          //
          // Successful refreshes are merged into *successful* responses below.
          const includeDebug = process.env.AUTH_DEBUG_LOGS === 'true'
          const response = NextResponse.json(
            {
              error: 'Unauthorized',
              request_id: requestId,
              ...(includeDebug
                ? {
                    debug: {
                      auth_error: authError?.message ?? null,
                      bearer_error: bearerErrorMessage,
                      bearer_present: bearerToken !== null,
                      matched_auth_cookies: matchedAuthCookies.map((c) => c.name),
                      total_cookie_count: cookieEntries.length,
                      pending_auth_cookie_count: pendingAuthCookies.length,
                    },
                  }
                : {}),
            },
            { status: 401 }
          )

          response.headers.set('X-Request-Id', requestId)
          response.headers.set('X-Content-Type-Options', 'nosniff')
          response.headers.set('X-Frame-Options', 'DENY')

          console.warn(
            `[${requestId}] Unauthorized:`,
            request.method,
            routePath,
            authError?.message ?? '(no auth error)',
            `matchedAuthCookies=${matchedAuthCookies.length}`,
            `totalCookies=${cookieEntries.length}`,
            `bearer=${bearerToken ? 'present' : 'absent'}`,
          )

          return response
        }

        user = { id: authUser.id, email: authUser.email }
        accessToken = bearerToken
      }
      
      // 3. Rate Limiting
      if (rateLimit) {
        let rateLimitKey = getRateLimitKey(request, user?.id)
        if (customRateLimitKey) {
          try {
            rateLimitKey = customRateLimitKey(request, { user })
          } catch {
            console.warn(`[${requestId}] Custom rate-limit key failed; using default key`)
          }
        }
        const config = rateLimitConfig ?? getRouteLimit(routePath)
        // Some DB limiter implementations may primarily scope by endpoint.
        // When a custom key is provided, include it in the endpoint scope so
        // rate buckets stay segmented even in endpoint-scoped implementations.
        const endpointScope = customRateLimitKey
          ? `${routePath}:${rateLimitKey.slice(0, 96)}`
          : routePath
        const result = await checkRateLimit(rateLimitKey, endpointScope, config)
        
        if (!result.allowed) {
          const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
          return NextResponse.json(
            { 
              error: 'Rate limit exceeded. Please try again later.',
              retry_after: retryAfter,
              request_id: requestId 
            },
            { 
              status: 429,
              headers: {
                'Retry-After': String(retryAfter),
                'X-RateLimit-Remaining': '0',
                'X-Request-Id': requestId
              }
            }
          )
        }
      }
      
      // 4. Content Length Check
      const contentLength = parseInt(request.headers.get('content-length') || '0')
      if (contentLength > maxBodySize) {
        return NextResponse.json(
          { error: 'Request too large', request_id: requestId },
          { status: 413 }
        )
      }

      // 4.5. Read-only mode enforcement
      // Block write operations (POST/PUT/PATCH/DELETE) unless the endpoint is exempt
      if (!readonlyExempt) {
        const method = request.method.toUpperCase()
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          const isReadonly = await getReadonly()
          if (isReadonly) {
            return NextResponse.json(
              { error: 'Read-only mode is enabled. Write operations are disabled.', request_id: requestId },
              { status: 403 }
            )
          }
        }
      }

      // 5. Execute Handler
      const response = await handler(request, {
        user,
        authUser,
        accessToken,
        requestId,
        startTime,
      })

      // 6. Merge any auth cookies from Supabase token refresh
      for (const { name, value, options } of pendingAuthCookies) {
        response.cookies.set(name, value, options)
      }

      // 7. Add security headers directly (no re-wrapping to preserve cookies)
      response.headers.set('X-Request-Id', requestId)
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')

      return response
      
    } catch (error: unknown) {
      const { name: errorName, message: errorMessage } = getErrorDetails(error)
      console.error(`[${requestId}] API error:`, errorMessage)
      
      // Log to audit (fire-and-forget)
      try {
        const supabase = await createClient()
        await supabase.from('audit_log').insert({
          action: 'api_error',
          actor_type: user ? 'user' : 'system',
          actor_id: user?.id ?? null,
          ip_address: clientIp,
          request_id: requestId,
          request_body: {
            route: routePath,
            error_type: errorName,
            // Don't log full error message for security
          },
          risk_score: 10,
        })
      } catch {
        // Ignore audit logging errors
      }
      
      return NextResponse.json(
        { 
          error: sanitizeError(errorMessage),
          request_id: requestId 
        },
        { 
          status: 500,
          headers: { 'X-Request-Id': requestId }
        }
      )
    }
  }
}

/**
 * Helper to parse and validate JSON body
 */
export async function parseJsonBody<T>(
  request: Request,
  maxSize = 1024 * 1024
): Promise<{ data: T | null; error: string | null }> {
  try {
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > maxSize) {
      return { data: null, error: 'Request body too large' }
    }
    
    const text = await request.text()
    if (text.length > maxSize) {
      return { data: null, error: 'Request body too large' }
    }
    
    const data = JSON.parse(text) as T
    return { data, error: null }
  } catch {
    return { data: null, error: 'Invalid JSON' }
  }
}
