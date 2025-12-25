// Rate limiting utilities for Next.js API routes
// Uses in-memory store for development, should use Redis in production

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Simple in-memory store - use Upstash Redis in production
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

export interface RateLimitConfig {
  requests: number      // Max requests allowed
  windowMs: number      // Time window in milliseconds
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { requests: 100, windowMs: 60000 }
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  
  // No existing entry or expired
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, {
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
