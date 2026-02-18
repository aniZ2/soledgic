// Rate limiting utilities for Next.js API routes
// Uses Postgres-backed rate limit function in production (distributed),
// with an in-memory fallback for local dev.

import { createServerClient } from '@supabase/ssr'

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Simple in-memory store - only used as a fallback.
const rateLimitStore = new Map<string, RateLimitEntry>()

export interface RateLimitConfig {
  requests: number      // Max requests allowed
  windowMs: number      // Time window in milliseconds
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

let cachedServiceClient: ReturnType<typeof createServerClient> | null = null

function getServiceClient() {
  if (cachedServiceClient) return cachedServiceClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  cachedServiceClient = createServerClient(supabaseUrl, serviceKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })

  return cachedServiceClient
}

/**
 * Check rate limit for a given key
 */
export async function checkRateLimit(
  key: string,
  endpoint: string,
  config: RateLimitConfig = { requests: 100, windowMs: 60000 }
): Promise<RateLimitResult> {
  const now = Date.now()
  const isProd = process.env.NODE_ENV === 'production'
  const serviceClient = getServiceClient()

  // In production, do not fall back to in-memory limits. Rate limiting must be
  // distributed and durable across instances.
  if (isProd && !serviceClient) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + config.windowMs,
    }
  }

  if (serviceClient) {
    const windowSeconds = Math.max(1, Math.ceil(config.windowMs / 1000))

    try {
      const { data, error } = await serviceClient.rpc('check_rate_limit_secure', {
        p_key: key,
        p_endpoint: endpoint,
        p_max_requests: config.requests,
        p_window_seconds: windowSeconds,
        p_fail_closed: isProd,
      })

      const row = Array.isArray(data) ? data[0] : null
      if (!error && row && typeof row.allowed === 'boolean' && row.reset_at) {
        const resetAt = new Date(row.reset_at).getTime()
        const remaining = typeof row.remaining === 'number' ? row.remaining : 0
        const allowed = Boolean(row.allowed) && !Boolean(row.blocked)

        return {
          allowed,
          remaining: allowed ? Math.max(0, remaining) : 0,
          resetAt: Number.isFinite(resetAt) ? resetAt : now + config.windowMs,
        }
      }
    } catch {
      if (isProd) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: now + config.windowMs,
        }
      }
    }
  }

  // Fallback: in-memory token bucket (dev only, non-distributed)
  const entry = rateLimitStore.get(`${endpoint}:${key}`)
  
  // No existing entry or expired
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(`${endpoint}:${key}`, {
      count: 1,
      resetAt: now + config.windowMs
    })
    return {
      allowed: true,
      remaining: config.requests - 1,
      resetAt: now + config.windowMs
    }
  }
  
  // Increment count
  entry.count++
  
  if (entry.count > config.requests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt
    }
  }
  
  return {
    allowed: true,
    remaining: config.requests - entry.count,
    resetAt: entry.resetAt
  }
}

/**
 * Get rate limit key from request
 */
export function getRateLimitKey(
  request: Request,
  userId?: string
): string {
  // Prefer user ID if authenticated
  if (userId) {
    return `user:${userId}`
  }
  
  // Fall back to IP address
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0].trim() || 
             request.headers.get('x-real-ip') ||
             'unknown'
  
  return `ip:${ip}`
}

// Route-specific limits
export const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  // Auth routes - stricter
  '/api/auth': { requests: 10, windowMs: 60000 },
  
  // Standard API routes
  '/api/ledgers': { requests: 100, windowMs: 60000 },
  '/api/organizations': { requests: 50, windowMs: 60000 },
  '/api/team': { requests: 30, windowMs: 60000 },
  
  // Default
  'default': { requests: 100, windowMs: 60000 }
}

/**
 * Get rate limit config for a route
 */
export function getRouteLimit(path: string): RateLimitConfig {
  // Check for exact match first
  if (ROUTE_LIMITS[path]) {
    return ROUTE_LIMITS[path]
  }
  
  // Check for prefix match
  for (const [route, config] of Object.entries(ROUTE_LIMITS)) {
    if (path.startsWith(route)) {
      return config
    }
  }
  
  return ROUTE_LIMITS['default']
}
