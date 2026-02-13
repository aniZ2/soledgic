// Soledgic: Shared utilities for Edge Functions
// Rate limiting (Redis), API key validation, common responses
// SECURITY HARDENED VERSION v2 - All audit findings addressed

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Ratelimit } from 'https://esm.sh/@upstash/ratelimit@2'
import { Redis } from 'https://esm.sh/@upstash/redis@1'

// ============================================================================
// ENVIRONMENT DETECTION (Fail-Closed)
// ============================================================================
// SECURITY: If ENVIRONMENT is not explicitly set, treat as production
// This prevents accidentally running with relaxed security in production

function getEnvironment(): 'production' | 'staging' | 'development' {
  const env = Deno.env.get('ENVIRONMENT')?.toLowerCase()
  
  // Explicit environment set
  if (env === 'development' || env === 'dev') return 'development'
  if (env === 'staging' || env === 'stage') return 'staging'
  if (env === 'production' || env === 'prod') return 'production'
  
  // SECURITY: If not set or unrecognized, fail-closed to production
  if (!env) {
    console.warn('SECURITY: ENVIRONMENT not set - defaulting to production security')
  } else {
    console.warn(`SECURITY: Unknown ENVIRONMENT "${env}" - defaulting to production security`)
  }
  return 'production'
}

export function isProduction(): boolean {
  return getEnvironment() === 'production'
}

export function isDevelopment(): boolean {
  return getEnvironment() === 'development'
}

export function isStaging(): boolean {
  return getEnvironment() === 'staging'
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_BODY_SIZE = 512 * 1024 // 512KB max request body (default)

// SECURITY FIX L2: Endpoint-specific body size limits
// Some endpoints need stricter limits to prevent resource exhaustion
const ENDPOINT_BODY_SIZE_LIMITS: Record<string, number> = {
  'import-bank-statement': 2 * 1024 * 1024,  // 2MB - bank statements can be large
  'import-transactions': 5 * 1024 * 1024,    // 5MB - bulk imports
  'upload-receipt': 10 * 1024 * 1024,        // 10MB - receipt images
  'record-sale': 64 * 1024,                  // 64KB - single transaction
  'record-expense': 64 * 1024,               // 64KB - single transaction
  'record-income': 64 * 1024,                // 64KB - single transaction
  'record-refund': 64 * 1024,                // 64KB - single transaction
  'execute-payout': 256 * 1024,              // 256KB - batch payouts
  'process-payout': 64 * 1024,               // 64KB - single payout
  'webhooks': 64 * 1024,                     // 64KB - webhook config
  'stripe-webhook': 256 * 1024,              // 256KB - Stripe events
  'plaid': 256 * 1024,                       // 256KB - Plaid data
  'invoices': 128 * 1024,                    // 128KB - invoice with line items
  'record-bill': 64 * 1024,                  // 64KB - single bill
  'pay-bill': 64 * 1024,                     // 64KB - bill payment
  'receive-payment': 64 * 1024,              // 64KB - payment received
  'create-checkout': 64 * 1024,              // 64KB - checkout creation
  'release-funds': 64 * 1024,                // 64KB - fund release requests
  'stripe-reconciliation': 64 * 1024,        // 64KB - reconciliation requests
  'default': 512 * 1024,                     // 512KB - default
}

/**
 * Get the body size limit for an endpoint
 */
export function getEndpointBodySizeLimit(endpoint: string): number {
  return ENDPOINT_BODY_SIZE_LIMITS[endpoint] || ENDPOINT_BODY_SIZE_LIMITS['default']
}

// Sensitive endpoints that should fail-closed on rate limit errors
// These endpoints BLOCK requests if Redis is unavailable (security-critical)
const FAIL_CLOSED_ENDPOINTS = [
  'execute-payout',
  'process-payout', 
  'stripe-webhook',
  'plaid',
  'record-sale',
  'record-refund',
  'create-ledger',      // Prevent resource exhaustion attacks
  'send-statements',    // Prevent email spam
  'import-transactions', // Prevent data flooding
  'import-bank-statement',
  'create-checkout',    // Prevent checkout spam / processor rate-limit exhaustion
  'release-funds',      // Critical: Prevent unauthorized fund releases
]

// ============================================================================
// REQUEST ID TRACKING
// ============================================================================

/**
 * Generate a unique request ID for tracing across logs
 */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '')}`
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Security headers to include in all responses
 * Defense-in-depth even for JSON APIs
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
}

// ============================================================================
// EMERGENCY CONTROLS
// ============================================================================
// These are controlled via environment variables for quick response to attacks
//
// MAINTENANCE_MODE=true      - Returns 503 for all non-essential endpoints
// ALLOWLIST_MODE=true        - Only allows pre-approved API keys
// BLOCKED_IPS=1.2.3.4,5.6.7.8 - Comma-separated list of IPs to block
// ALLOWED_API_KEYS=key1,key2  - Comma-separated list of allowed keys (when allowlist mode)
// BLOCKED_COUNTRIES=XX,YY     - Comma-separated ISO country codes to block (SECURITY FIX L3)
// ============================================================================

function isMaintenanceMode(): boolean {
  return Deno.env.get('MAINTENANCE_MODE') === 'true'
}

function isAllowlistMode(): boolean {
  return Deno.env.get('ALLOWLIST_MODE') === 'true'
}

function getBlockedIPs(): Set<string> {
  const blocked = Deno.env.get('BLOCKED_IPS') || ''
  return new Set(blocked.split(',').map(ip => ip.trim()).filter(Boolean))
}

function getAllowedApiKeys(): Set<string> {
  const allowed = Deno.env.get('ALLOWED_API_KEYS') || ''
  return new Set(allowed.split(',').map(key => key.trim()).filter(Boolean))
}

// SECURITY FIX L3: Geo-IP blocking
function getBlockedCountries(): Set<string> {
  const blocked = Deno.env.get('BLOCKED_COUNTRIES') || ''
  return new Set(blocked.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))
}

/**
 * Check if IP is blocked
 */
export function isIpBlocked(ip: string | null): boolean {
  if (!ip) return false
  return getBlockedIPs().has(ip)
}

/**
 * SECURITY FIX L3: Check if country is blocked
 * Uses Cloudflare's CF-IPCountry header
 */
export function isCountryBlocked(req: Request): boolean {
  const blockedCountries = getBlockedCountries()
  if (blockedCountries.size === 0) return false
  
  // Cloudflare provides country code in header
  const country = req.headers.get('cf-ipcountry')?.toUpperCase()
  if (!country) return false
  
  return blockedCountries.has(country)
}

/**
 * Get country from request (for logging)
 */
export function getRequestCountry(req: Request): string | null {
  return req.headers.get('cf-ipcountry')?.toUpperCase() || null
}

/**
 * Check if API key is allowed (in allowlist mode)
 */
export function isApiKeyAllowed(apiKey: string | null): boolean {
  if (!isAllowlistMode()) return true  // Not in allowlist mode, all keys allowed
  if (!apiKey) return false
  return getAllowedApiKeys().has(apiKey)
}

/**
 * Maintenance mode response
 */
export function maintenanceResponse(req?: Request, requestId?: string): Response {
  const headers = req ? getCorsHeaders(req) : {}
  return new Response(
    JSON.stringify({
      success: false,
      error: 'System temporarily unavailable for maintenance',
      retry_after: 300,
      request_id: requestId,
    }),
    {
      status: 503,
      headers: {
        ...headers,
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        'Retry-After': '300',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      }
    }
  )
}

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

// Allowed origins - add your domains here
const ALLOWED_ORIGINS = [
  'https://soledgic.com',
  'https://www.soledgic.com',
  'https://app.soledgic.com',
  'https://dashboard.soledgic.com',
  // Booklyverse
  'https://booklyverse.com',
  'https://www.booklyverse.com',
  'https://app.booklyverse.com',
  // Supabase Studio
  'https://ocjrcsmoeikxfooeglkt.supabase.co',
  // Local development - ONLY in non-production
  ...(isDevelopment() ? [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ] : []),
]

// Check if origin is allowed
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  
  // In development, also allow localhost
  if (isDevelopment()) {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true
    }
  }
  
  return ALLOWED_ORIGINS.includes(origin)
}

// Get CORS headers for a specific request
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  
  // If origin is allowed, echo it back; otherwise return empty (will block request)
  if (!isAllowedOrigin(origin)) {
    return {
      'Access-Control-Allow-Origin': '', // Empty blocks the request
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-request-id',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    }
  }
  
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'X-Request-Id, X-RateLimit-Remaining, Retry-After',
  }
}

// DEPRECATED: Use getCorsHeaders(req) instead
// Keeping for backward compatibility but logs warning
export const corsHeaders = (() => {
  console.warn('DEPRECATED: Using static corsHeaders. Switch to getCorsHeaders(req) for proper CORS.')
  return {
    'Access-Control-Allow-Origin': isProduction() 
      ? ALLOWED_ORIGINS[0] 
      : '*', // Only allows wildcard in dev
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  }
})()

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function jsonResponse(data: any, status = 200, req?: Request, requestId?: string) {
  const corsHeaders = req ? getCorsHeaders(req) : {}
  
  // Add request_id to response body if provided
  const responseData = requestId ? { ...data, request_id: requestId } : data
  
  return new Response(
    JSON.stringify(responseData),
    { 
      status, 
      headers: { 
        ...corsHeaders, 
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      } 
    }
  )
}

export function errorResponse(message: string, status = 400, req?: Request, requestId?: string) {
  // Never leak internal details in production
  
  // Generic messages for server errors in production
  const safeMessage = isProduction() && status >= 500
    ? 'An unexpected error occurred'
    : sanitizeErrorMessage(message)
    
  return jsonResponse({ success: false, error: safeMessage }, status, req, requestId)
}

/**
 * Sanitize error messages to prevent information leakage
 */
function sanitizeErrorMessage(message: string): string {
  if (!isProduction()) return message
  
  // Remove potentially sensitive patterns
  return message
    .replace(/\/[^\s]+/g, '[path]')           // File paths
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]')  // IP addresses
    .replace(/eyJ[A-Za-z0-9_-]+/g, '[token]') // JWT tokens
    .replace(/sk_[a-zA-Z0-9]+/g, '[key]')     // API keys
    .replace(/whsec_[a-zA-Z0-9]+/g, '[secret]') // Webhook secrets
    .substring(0, 200) // Limit length
}

export function rateLimitedResponse(resetIn?: number, req?: Request, requestId?: string) {
  const corsHeaders = req ? getCorsHeaders(req) : {}
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'Rate limit exceeded. Please try again later.',
      retry_after: resetIn || 60,
      request_id: requestId,
    }),
    { 
      status: 429, 
      headers: { 
        ...corsHeaders, 
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        'Retry-After': String(resetIn || 60),
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      } 
    }
  )
}

export function forbiddenResponse(req?: Request, requestId?: string) {
  const corsHeaders = req ? getCorsHeaders(req) : {}
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'Access denied',
      request_id: requestId,
    }),
    { 
      status: 403, 
      headers: { 
        ...corsHeaders, 
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      } 
    }
  )
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

export function getSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

// ============================================================================
// API KEY GENERATION & VALIDATION
// ============================================================================

/**
 * Generate a cryptographically secure API key
 * Format: sk_live_<32 random hex chars> or sk_test_<32 random hex chars>
 */
export function generateApiKey(isProduction = false): string {
  const prefix = isProduction ? 'sk_live_' : 'sk_test_'
  const randomBytes = new Uint8Array(16) // 128 bits of entropy
  crypto.getRandomValues(randomBytes)
  const hex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}${hex}`
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface LedgerContext {
  id: string
  business_name: string
  ledger_mode: string
  status: string
  settings: any
  organization_id?: string
}

const INTERNAL_TOKEN_HEADER = 'x-soledgic-internal-token'
const INTERNAL_LEDGER_HEADER = 'x-ledger-id'

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function getInternalLedgerId(req: Request): string | null {
  const expectedToken =
    Deno.env.get('SOLEDGIC_INTERNAL_FUNCTION_TOKEN') ||
    Deno.env.get('INTERNAL_FUNCTION_TOKEN') ||
    ''

  if (!expectedToken) return null

  const providedToken = req.headers.get(INTERNAL_TOKEN_HEADER) || ''
  if (!providedToken) return null
  if (!timingSafeEqualString(providedToken, expectedToken)) return null

  const ledgerId = req.headers.get(INTERNAL_LEDGER_HEADER)?.trim() || ''
  return ledgerId.length > 0 ? ledgerId : null
}

export async function validateApiKey(
  supabase: SupabaseClient, 
  apiKey: string | null,
  requestId?: string
): Promise<LedgerContext | null> {
  if (!apiKey) return null
  
  // Basic format validation
  if (!apiKey.startsWith('sk_')) {
    console.warn(`[${requestId}] Invalid API key format`)
    return null
  }
  
  // SECURITY: Always use hash lookup, never plaintext
  const keyHash = await hashApiKey(apiKey)
  
  const { data: ledger, error } = await supabase
    .from('ledgers')
    .select('id, business_name, ledger_mode, status, settings, organization_id')
    .eq('api_key_hash', keyHash)
    .single()
  
  if (error || !ledger) {
    // Log failed attempts for security monitoring (don't log the key!)
    console.warn(`[${requestId}] API key validation failed:`, { 
      hashPrefix: keyHash.substring(0, 8),
      error: error?.code  // Only log error code, not message
    })
    return null
  }
  
  return ledger as LedgerContext
}

// ============================================================================
// RATE LIMITING: Redis Primary, Database Fallback (Throttled)
// ============================================================================
//
// ARCHITECTURE:
//   1. Try Redis (Upstash) first - fast, distributed, high throughput
//   2. If Redis fails, fall back to Postgres with REDUCED limits
//   3. If both fail, apply fail-open/fail-closed logic
//
// THE "NARROW GATE" STRATEGY:
//   Redis (Wide Gate):  Full limits (e.g., 200 req/min)
//   Postgres (Narrow Gate): 10% of Redis limits (e.g., 20 req/min)
//   
//   This prevents a Redis outage from becoming a Postgres meltdown.
//   Attackers who try to exploit a Redis outage hit a brick wall.
//
// FAIL-CLOSED endpoints (block if ALL rate limiting fails):
//   - execute-payout, process-payout: Prevents double payouts
//   - stripe-webhook, plaid: Prevents replay attacks  
//   - record-sale, record-refund: Prevents transaction flooding
//   - create-ledger: Prevents resource exhaustion
//   - send-statements: Prevents email spam
//   - import-transactions, import-bank-statement: Prevents data flooding
//
// FAIL-OPEN endpoints (allow if rate limiting unavailable):
//   - generate-pdf, generate-report: Better UX, lower risk
//   - get-balance, get-transactions: Read-only operations
//   - webhooks, health-check: System operations
//
// ============================================================================

let redis: Redis | null = null
let rateLimiters: Map<string, Ratelimit> = new Map()
let redisHealthy = true  // Track Redis health for circuit breaker
let lastRedisCheck = 0
const REDIS_HEALTH_CHECK_INTERVAL = 30000 // 30 seconds

// Database fallback throttle: 10% of Redis limits
// This protects Postgres from being hammered during Redis outages
const DB_FALLBACK_THROTTLE = 0.1

function getRedis(): Redis | null {
  if (redis) return redis
  
  const url = Deno.env.get('UPSTASH_REDIS_URL')
  const token = Deno.env.get('UPSTASH_REDIS_TOKEN')
  
  if (!url || !token) {
    console.warn('UPSTASH_REDIS_URL/TOKEN not configured - using database fallback only')
    return null
  }
  
  redis = new Redis({ url, token })
  return redis
}

// Endpoint-specific limits (Redis - full throughput)
const RATE_LIMITS: Record<string, { requests: number; windowSeconds: number }> = {
  'record-sale': { requests: 200, windowSeconds: 60 },
  'record-expense': { requests: 200, windowSeconds: 60 },
  'record-income': { requests: 200, windowSeconds: 60 },
  'record-refund': { requests: 100, windowSeconds: 60 },
  'generate-pdf': { requests: 20, windowSeconds: 60 },
  'generate-report': { requests: 30, windowSeconds: 60 },
  'export-report': { requests: 20, windowSeconds: 60 },
  'import-transactions': { requests: 10, windowSeconds: 60 },
  'import-bank-statement': { requests: 10, windowSeconds: 60 },
  'execute-payout': { requests: 50, windowSeconds: 60 },
  'process-payout': { requests: 50, windowSeconds: 60 },
  'health-check': { requests: 5, windowSeconds: 60 },  // SECURITY FIX H2: Reduced from 10 to 5
  'stripe-webhook': { requests: 500, windowSeconds: 60 },
  'plaid': { requests: 50, windowSeconds: 60 },
  'webhooks': { requests: 100, windowSeconds: 60 },
  'send-statements': { requests: 20, windowSeconds: 60 },
  'create-ledger': { requests: 10, windowSeconds: 3600 },  // Per hour
  'upload-receipt': { requests: 50, windowSeconds: 60 },
  'create-checkout': { requests: 100, windowSeconds: 60 },  // Checkout creation (processor-safe baseline)
  'release-funds': { requests: 50, windowSeconds: 60 },    // Fund releases (sensitive financial operation)
  'stripe-reconciliation': { requests: 5, windowSeconds: 60 },  // Reconciliation runs (heavy operations)
  'default': { requests: 100, windowSeconds: 60 },
}

// Pre-auth rate limits by IP (to prevent auth brute-force attacks)
// These are checked BEFORE API key validation to prevent resource exhaustion
const PRE_AUTH_IP_RATE_LIMITS: Record<string, { requests: number; windowSeconds: number }> = {
  'default': { requests: 60, windowSeconds: 60 },     // 60 requests/min per IP before auth
  'create-ledger': { requests: 5, windowSeconds: 60 }, // Strict limit on ledger creation
  'health-check': { requests: 10, windowSeconds: 60 }, // Health checks can be more frequent
}

function getRateLimiter(endpoint: string): Ratelimit | null {
  // Skip Redis if we know it's unhealthy (circuit breaker)
  if (!redisHealthy && Date.now() - lastRedisCheck < REDIS_HEALTH_CHECK_INTERVAL) {
    return null
  }
  
  const r = getRedis()
  if (!r) return null
  
  if (rateLimiters.has(endpoint)) {
    return rateLimiters.get(endpoint)!
  }
  
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default']
  const windowStr = config.windowSeconds >= 3600 ? '1h' : '1m'
  
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(config.requests, windowStr as any),
    prefix: `soledgic:${endpoint}`,
  })
  
  rateLimiters.set(endpoint, limiter)
  return limiter
}

/**
 * Database fallback rate limiting using Postgres function
 * Uses THROTTLED limits (10% of Redis) to protect the database
 */
async function checkRateLimitDatabase(
  supabase: SupabaseClient,
  apiKey: string,
  endpoint: string,
  requestId?: string
): Promise<{ allowed: boolean; error?: string }> {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default']
  
  // NARROW GATE: Throttle to 10% of Redis limits
  // This protects Postgres from being overwhelmed during Redis outages
  const throttledRequests = Math.max(1, Math.floor(config.requests * DB_FALLBACK_THROTTLE))
  
  try {
    console.warn(`[${requestId}] DB Fallback Active: ${endpoint} throttled to ${throttledRequests}/${config.windowSeconds}s`)
    
    // Note: check_rate_limit_secure is the full-featured function defined in migrations
    // We call check_rate_limit which should be an alias or the same function
    const { data, error } = await supabase.rpc('check_rate_limit_secure', {
      p_key: apiKey,
      p_endpoint: endpoint,
      p_max_requests: throttledRequests,
      p_window_seconds: config.windowSeconds,
      p_fail_closed: true
    })
    
    if (error) {
      console.error(`[${requestId}] Database rate limit error:`, error.code)
      return { allowed: false, error: 'Rate limit check failed' }
    }
    
    // check_rate_limit_secure returns a table with (allowed, remaining, reset_at, blocked)
    const result = data?.[0] || data
    if (result?.blocked) {
      return { allowed: false, error: 'Temporarily blocked due to repeated violations' }
    }
    return { allowed: result?.allowed === true }
  } catch (err: any) {
    console.error(`[${requestId}] Database rate limit exception:`, err.message)
    return { allowed: false, error: 'Rate limit service error' }
  }
}

/**
 * Lightweight pre-auth rate limit check by IP
 * SECURITY FIX M1: This runs BEFORE API key validation to prevent:
 * - Auth brute force attacks
 * - Resource exhaustion via invalid API key lookups
 * - Hash computation DoS attacks
 * 
 * Uses Redis only (no DB fallback) for speed. Fails open if Redis unavailable.
 */
export async function checkPreAuthRateLimit(
  clientIp: string | null,
  endpoint: string,
  requestId?: string
): Promise<{ allowed: boolean; resetIn?: number }> {
  if (!clientIp) {
    // Can't rate limit without IP - allow but log
    console.warn(`[${requestId}] Pre-auth rate limit skipped: no client IP`)
    return { allowed: true }
  }

  const limiter = getRateLimiter(`preauth:${endpoint}`)
  if (!limiter) {
    // Redis unavailable - fail open for pre-auth (we'll still do post-auth rate limit)
    return { allowed: true }
  }

  try {
    const config = PRE_AUTH_IP_RATE_LIMITS[endpoint] || PRE_AUTH_IP_RATE_LIMITS['default']
    const key = `preauth:ip:${clientIp}`
    
    const result = await limiter.limit(key)
    
    if (!result.success) {
      console.warn(`[${requestId}] Pre-auth rate limit hit for IP: ${clientIp.substring(0, 8)}...`)
    }
    
    return {
      allowed: result.success,
      resetIn: result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60,
    }
  } catch (err) {
    // Redis error - fail open for pre-auth
    console.error(`[${requestId}] Pre-auth rate limit error:`, err)
    return { allowed: true }
  }
}

/**
 * Main rate limit check - Redis primary, DB fallback (throttled)
 * 
 * Flow:
 * 1. Try Redis (full limits)
 * 2. If Redis fails → DB fallback (10% limits - "narrow gate")
 * 3. If both fail → fail-open or fail-closed based on endpoint
 */
export async function checkRateLimit(
  apiKey: string,
  endpoint: string,
  supabase?: SupabaseClient,
  requestId?: string
): Promise<{ allowed: boolean; resetIn?: number; remaining?: number; error?: string; source?: 'redis' | 'database' | 'none' }> {
  const shouldFailClosed = FAIL_CLOSED_ENDPOINTS.includes(endpoint)
  
  // 1. Try Redis first (full throughput)
  const limiter = getRateLimiter(endpoint)
  
  if (limiter) {
    try {
      const result = await limiter.limit(apiKey)
      
      // Redis is healthy
      redisHealthy = true
      lastRedisCheck = Date.now()
      
      return { 
        allowed: result.success, 
        resetIn: result.reset ? Math.ceil((result.reset - Date.now()) / 1000) : 60,
        remaining: result.remaining,
        source: 'redis'
      }
    } catch (err) {
      console.error(`[${requestId}] Redis rate limit error, falling back to database`)
      
      // Mark Redis as unhealthy for circuit breaker
      redisHealthy = false
      lastRedisCheck = Date.now()
    }
  }
  
  // 2. Fall back to Database (THROTTLED - narrow gate)
  const db = supabase || getSupabaseClient()
  const dbResult = await checkRateLimitDatabase(db, apiKey, endpoint, requestId)
  
  if (dbResult.error === undefined) {
    return { 
      allowed: dbResult.allowed, 
      resetIn: 60,  // DB doesn't give precise reset time
      source: 'database'
    }
  }
  
  // 3. Both failed - apply fail-open/fail-closed logic
  console.error(`[${requestId}] All rate limiting failed for ${endpoint}`)
  
  if (shouldFailClosed) {
    return { 
      allowed: false, 
      error: 'Service temporarily unavailable',
      source: 'none'
    }
  }
  
  // Fail-open for non-sensitive endpoints
  console.warn(`[${requestId}] Rate limit bypassed for ${endpoint} (fail-open)`)
  return { allowed: true, source: 'none' }
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

export function validateAmount(amount: any): number | null {
  if (typeof amount !== 'number') return null
  if (!Number.isFinite(amount)) return null
  if (amount < 0) return null
  if (amount > 100000000) return null // $1M max (in cents)
  return Math.round(amount) // Ensure integer cents
}

export function validateId(id: any, maxLength = 100): string | null {
  if (typeof id !== 'string') return null
  if (id.length === 0 || id.length > maxLength) return null
  // Allow alphanumeric, underscore, hyphen - NO SQL injection vectors
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null
  return id
}

export function validateUUID(id: any): string | null {
  if (typeof id !== 'string') return null
  // UUID v4 format validation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null
  }
  return id.toLowerCase()
}

export function validateEmail(email: any): string | null {
  if (typeof email !== 'string') return null
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return null
  if (email.length > 254) return null
  return email.toLowerCase()
}

export function validateString(str: any, maxLength = 1000): string | null {
  if (typeof str !== 'string') return null
  if (str.length > maxLength) return null
  // Basic XSS prevention - strip dangerous characters
  const sanitized = str
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
  return sanitized.trim()
}

export function validateUrl(url: any): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    // Only allow HTTPS in production
    if (isProduction() && parsed.protocol !== 'https:') {
      return null
    }
    // Block javascript: URLs
    if (parsed.protocol === 'javascript:') return null
    return url
  } catch {
    return null
  }
}

/**
 * Validate a date string (ISO 8601 format)
 */
export function validateDate(dateStr: any): string | null {
  if (typeof dateStr !== 'string') return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  // Ensure reasonable date range (1970 to 2100)
  if (date.getFullYear() < 1970 || date.getFullYear() > 2100) return null
  return date.toISOString()
}

/**
 * Validate an integer within a range
 */
export function validateInteger(value: any, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}

// ============================================================================
// REQUEST HANDLER WRAPPER
// ============================================================================

interface HandlerOptions {
  requireAuth?: boolean
  rateLimit?: boolean
  endpoint: string
  maxBodySize?: number
}

type RequestHandler = (
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext | null,
  body: any,
  context: { requestId: string; startTime: number }
) => Promise<Response>

export function createHandler(options: HandlerOptions, handler: RequestHandler) {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now()
    // SECURITY FIX: Always generate server-side request ID to prevent spoofing
    // Client-provided ID is only used for correlation in logs, not as authoritative ID
    const requestId = generateRequestId()
    const clientRequestId = req.headers.get('x-request-id') // For correlation only
    
    // Handle CORS preflight with proper origin check
    if (req.method === 'OPTIONS') {
      const corsHeaders = getCorsHeaders(req)
      if (!corsHeaders['Access-Control-Allow-Origin']) {
        return new Response('Forbidden', { status: 403 })
      }
      return new Response('ok', { 
        headers: {
          ...corsHeaders,
          ...SECURITY_HEADERS,
          'X-Request-Id': requestId,
        }
      })
    }
    
    // ========================================================================
    // EMERGENCY CONTROLS - Check first before any processing
    // ========================================================================
    
    // 1. Maintenance Mode - Block all traffic except health-check
    if (isMaintenanceMode() && options.endpoint !== 'health-check') {
      return maintenanceResponse(req, requestId)
    }
    
    // 2. IP Blocking - Block known malicious IPs
    const clientIp = getClientIp(req)
    if (isIpBlocked(clientIp)) {
      console.warn(`[${requestId}] Blocked banned IP: ${clientIp}`)
      return forbiddenResponse(req, requestId)
    }
    
    // 3. SECURITY FIX L3: Geo-IP Blocking - Block requests from high-risk countries
    if (isCountryBlocked(req)) {
      const country = getRequestCountry(req)
      console.warn(`[${requestId}] Blocked request from country: ${country}, IP: ${clientIp}`)
      // Log for security monitoring
      await logSecurityEvent(getSupabaseClient(), null, 'blocked_country', {
        ip: clientIp,
        country,
        endpoint: options.endpoint,
        request_id: requestId,
      }).catch(() => {})
      return forbiddenResponse(req, requestId)
    }
    
    // ========================================================================
    
    // SECURITY: Check origin for non-preflight requests (only if Origin is provided)
    // Server-to-server API calls (like curl) won't have an Origin header
    const origin = req.headers.get('Origin')
    if (origin && !isAllowedOrigin(origin)) {
      console.warn(`[${requestId}] Blocked unauthorized origin: ${origin}`)
      return forbiddenResponse(req, requestId)
    }
    
    const supabase = getSupabaseClient()
    
    try {
      // ========================================================================
      // SECURITY FIX M1: Pre-auth rate limiting by IP
      // ========================================================================
      // This runs BEFORE API key validation to prevent:
      // - Brute force attacks on API keys
      // - Resource exhaustion via hash computation
      // - Database DoS via invalid key lookups
      if (options.rateLimit !== false) {
        const preAuthResult = await checkPreAuthRateLimit(clientIp, options.endpoint, requestId)
        if (!preAuthResult.allowed) {
          // Log pre-auth rate limit hit (potential attack)
          await logSecurityEvent(supabase, null, 'preauth_rate_limited', {
            endpoint: options.endpoint,
            ip: clientIp,
            request_id: requestId,
          }).catch(() => {})
          return rateLimitedResponse(preAuthResult.resetIn, req, requestId)
        }
      }
      
      // Get API key (external callers) or validated internal ledger context (server proxy)
      const apiKey = req.headers.get('x-api-key')
      const internalLedgerId = getInternalLedgerId(req)
      
      // 3. Allowlist Mode - Only allow pre-approved API keys
      if (isAllowlistMode() && !internalLedgerId && !isApiKeyAllowed(apiKey)) {
        console.warn(`[${requestId}] Blocked non-allowlisted API key`)
        return errorResponse('Service temporarily restricted', 403, req, requestId)
      }
      
      // Validate API key if required
      let ledger: LedgerContext | null = null
      if (options.requireAuth !== false) {
        if (internalLedgerId) {
          const { data: internalLedger, error: internalLedgerError } = await supabase
            .from('ledgers')
            .select('id, business_name, ledger_mode, status, settings, organization_id')
            .eq('id', internalLedgerId)
            .single()

          if (internalLedgerError || !internalLedger) {
            await logSecurityEvent(supabase, null, 'auth_failed', {
              endpoint: options.endpoint,
              ip: clientIp,
              user_agent: req.headers.get('user-agent')?.substring(0, 200),
              request_id: requestId,
              reason: 'invalid_internal_ledger',
            }).catch(() => {})
            return errorResponse('Invalid internal credentials', 401, req, requestId)
          }

          ledger = internalLedger as LedgerContext
        } else {
          if (!apiKey) {
            return errorResponse('Authentication required', 401, req, requestId)
          }
          
          ledger = await validateApiKey(supabase, apiKey, requestId)
          if (!ledger) {
            // Log failed auth attempt
            await logSecurityEvent(supabase, null, 'auth_failed', {
              endpoint: options.endpoint,
              ip: clientIp,
              user_agent: req.headers.get('user-agent')?.substring(0, 200),
              request_id: requestId,
            })
            return errorResponse('Invalid credentials', 401, req, requestId)
          }
        }
        
        if (ledger.status !== 'active') {
          return errorResponse('Account inactive', 403, req, requestId)
        }
      }
      
      // Check rate limit
      // SECURITY FIX: Rate limit ALL requests, not just authenticated ones
      // - Authenticated: Rate limit by LEDGER ID (prevents bypass via key rotation)
      // - Unauthenticated: Rate limit by IP (prevents resource exhaustion)
      if (options.rateLimit !== false) {
        let rateLimitKey: string
        
        if (ledger) {
          // Authenticated: use ledger ID
          rateLimitKey = ledger.id
        } else {
          // Unauthenticated: use IP address with prefix
          rateLimitKey = `ip:${clientIp || 'unknown'}`
        }
        
        const { allowed, resetIn, remaining, error, source } = await checkRateLimit(
          rateLimitKey, options.endpoint, supabase, requestId
        )
        if (!allowed) {
          // Log rate limit hit with source info
          await logSecurityEvent(supabase, ledger?.id || null, 'rate_limited', {
            endpoint: options.endpoint,
            source: source || 'unknown',
            ip: clientIp,
            request_id: requestId,
          })
          return rateLimitedResponse(resetIn, req, requestId)
        }
      }
      
      // Parse body (if POST/PUT/PATCH) with size check
      let body = null
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        // SECURITY FIX L2: Use endpoint-specific body size limits
        const maxSize = options.maxBodySize || getEndpointBodySizeLimit(options.endpoint)
        
        // SECURITY: Check content length before reading body
        const contentLength = parseInt(req.headers.get('content-length') || '0')
        
        if (contentLength > maxSize) {
          return errorResponse(`Request too large (max: ${Math.round(maxSize / 1024)}KB)`, 413, req, requestId)
        }
        
        try {
          const bodyText = await req.text()
          
          // Double-check actual size
          if (bodyText.length > maxSize) {
            return errorResponse(`Request too large (max: ${Math.round(maxSize / 1024)}KB)`, 413, req, requestId)
          }
          
          body = JSON.parse(bodyText)
        } catch {
          return errorResponse('Invalid request format', 400, req, requestId)
        }
      }
      
      // Call handler with context
      const response = await handler(req, supabase, ledger, body, { requestId, startTime })
      
      // Log request duration for monitoring
      const duration = Date.now() - startTime
      if (duration > 5000) {
        console.warn(`[${requestId}] Slow request: ${options.endpoint} took ${duration}ms`)
      }
      
      // Add request ID to response if not already present
      const existingHeaders = Object.fromEntries(response.headers.entries())
      if (!existingHeaders['x-request-id']) {
        const newHeaders = new Headers(response.headers)
        newHeaders.set('X-Request-Id', requestId)
        
        // Add security headers if not present
        for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
          if (!newHeaders.has(key)) {
            newHeaders.set(key, value)
          }
        }
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        })
      }
      
      return response
      
    } catch (error: any) {
      console.error(`[${requestId}] Error in ${options.endpoint}:`, error.message)
      
      // Log error for security monitoring - include request context
      await logSecurityEvent(supabase, null, 'handler_error', {
        endpoint: options.endpoint,
        error_type: error.name,
        request_id: requestId,
        ip: clientIp,
        user_agent: req.headers.get('user-agent')?.substring(0, 200),
      }).catch(() => {})
      
      // Never leak stack traces in production
      return errorResponse('An unexpected error occurred', 500, req, requestId)
    }
  }
}

// ============================================================================
// PII SANITIZATION FOR AUDIT LOGS (M2 FIX)
// ============================================================================

/**
 * Fields that must NEVER appear in audit logs
 */
const SENSITIVE_FIELDS = new Set([
  'account_number',
  'routing_number',
  'ssn',
  'tax_id',
  'bank_account',
  'access_token',
  'api_key',
  'webhook_secret',
  'password',
  'secret',
])

/**
 * Recursively sanitize an object, removing sensitive fields
 */
export function sanitizeForAudit(obj: any, depth = 0): any {
  if (depth > 10) return '[max depth]'  // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForAudit(item, depth + 1))
  }
  
  const sanitized: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    // Check if key contains sensitive patterns
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

// ============================================================================
// STANDARDIZED AUDIT LOGGING
// ============================================================================

/**
 * Standard audit log entry - ensures consistent capture of all security-relevant fields
 * Use this instead of direct audit_log inserts to ensure no fields are missed
 */
export interface AuditLogEntry {
  ledger_id: string | null
  action: string
  entity_type?: string
  entity_id?: string
  actor_type: 'api' | 'system' | 'admin' | 'webhook'
  actor_id?: string
  request_body?: Record<string, any>
  response_status?: number
  risk_score?: number
  duration_ms?: number
}

/**
 * Create a standardized audit log entry with all security fields captured
 * This ensures user_agent, ip_address, and request_id are always captured consistently
 */
export async function createAuditLog(
  supabase: SupabaseClient,
  req: Request,
  entry: AuditLogEntry,
  requestId?: string
): Promise<void> {
  try {
    const clientIp = getClientIp(req)
    const userAgent = req.headers.get('user-agent')
    
    // M2 FIX: Sanitize request_body to remove PII before logging
    const sanitizedBody = entry.request_body 
      ? sanitizeForAudit(entry.request_body)
      : null
    
    await supabase.from('audit_log').insert({
      ledger_id: entry.ledger_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      actor_type: entry.actor_type,
      actor_id: entry.actor_id,
      ip_address: clientIp,
      user_agent: userAgent?.substring(0, 500),  // Truncate to prevent overflow
      request_id: requestId,
      request_body: sanitizedBody,
      response_status: entry.response_status,
      risk_score: entry.risk_score ?? 0,
      duration_ms: entry.duration_ms,
    })
  } catch (err) {
    // Don't let audit logging failures break the request
    console.error('Failed to create audit log:', err)
  }
}

/**
 * Fire-and-forget audit log - doesn't await, for non-critical logging
 * Use when you don't want to slow down the response
 */
export function createAuditLogAsync(
  supabase: SupabaseClient,
  req: Request,
  entry: AuditLogEntry,
  requestId?: string
): void {
  createAuditLog(supabase, req, entry, requestId).catch(() => {})
}

// ============================================================================
// NACHA FILE GENERATION WITH SECURE STORAGE
// ============================================================================

/**
 * Generate a signed URL for NACHA file download
 * Files are stored in encrypted private bucket with 5-minute expiry
 */
export interface NachaFileMetadata {
  ledgerId: string
  batchCount: number
  entryCount: number
  totalDebitAmount: number
  totalCreditAmount: number
  effectiveDate: string
  generatedBy?: string
}

export async function storeNachaFile(
  supabase: SupabaseClient,
  req: Request,
  nachaContent: string,
  metadata: NachaFileMetadata,
  requestId: string
): Promise<{ signedUrl: string; expiresAt: Date; fileId: string } | null> {
  const clientIp = getClientIp(req)
  const userAgent = req.headers.get('user-agent')
  
  try {
    // Generate file hash for integrity
    const encoder = new TextEncoder()
    const data = encoder.encode(nachaContent)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const fileHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Generate unique file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `nacha_${timestamp}.txt`
    const storagePath = `${metadata.ledgerId}/${fileName}`
    
    // Upload to encrypted private bucket
    const { error: uploadError } = await supabase.storage
      .from('batch-payouts')
      .upload(storagePath, nachaContent, {
        contentType: 'text/plain',
        upsert: false,
        metadata: {
          request_id: requestId,
          file_hash: fileHash,
        }
      })
    
    if (uploadError) {
      console.error(`[${requestId}] NACHA upload failed:`, uploadError.message)
      return null
    }
    
    // Generate signed URL (5 minutes = 300 seconds)
    const expiresIn = 300
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    const { data: signedUrlData, error: signError } = await supabase.storage
      .from('batch-payouts')
      .createSignedUrl(storagePath, expiresIn)
    
    if (signError || !signedUrlData) {
      console.error(`[${requestId}] Signed URL generation failed:`, signError?.message)
      return null
    }
    
    // Record in tracking table
    const { data: fileRecord, error: recordError } = await supabase
      .from('nacha_files')
      .insert({
        ledger_id: metadata.ledgerId,
        file_name: fileName,
        storage_path: storagePath,
        file_hash: fileHash,
        file_size_bytes: data.byteLength,
        batch_count: metadata.batchCount,
        entry_count: metadata.entryCount,
        total_debit_amount: metadata.totalDebitAmount,
        total_credit_amount: metadata.totalCreditAmount,
        effective_date: metadata.effectiveDate,
        generated_by: metadata.generatedBy,
        expires_at: expiresAt.toISOString(),
        request_id: requestId,
        ip_address: clientIp,
        user_agent: userAgent?.substring(0, 500),
      })
      .select('id')
      .single()
    
    if (recordError) {
      console.error(`[${requestId}] NACHA record creation failed:`, recordError.message)
      // Don't fail - file is uploaded, just tracking failed
    }
    
    // Audit log with full compliance info
    await supabase.rpc('create_audit_entry', {
      p_ledger_id: metadata.ledgerId,
      p_action: 'nacha_generated',
      p_entity_type: 'nacha_file',
      p_entity_id: fileRecord?.id,
      p_actor_type: 'api',
      p_ip_address: clientIp,
      p_user_agent: userAgent,
      p_request_id: requestId,
      p_metadata: {
        file_name: fileName,
        batch_count: metadata.batchCount,
        entry_count: metadata.entryCount,
        total_amount: metadata.totalDebitAmount + metadata.totalCreditAmount,
        expires_at: expiresAt.toISOString(),
      },
      p_risk_score: 50,  // Financial data generation
    }).catch(() => {})  // Don't fail on audit log error
    
    return {
      signedUrl: signedUrlData.signedUrl,
      expiresAt,
      fileId: fileRecord?.id || 'unknown',
    }
  } catch (err: any) {
    console.error(`[${requestId}] NACHA storage error:`, err.message)
    return null
  }
}

// ============================================================================
// SECURITY LOGGING
// ============================================================================

export async function logSecurityEvent(
  supabase: SupabaseClient,
  ledgerId: string | null,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    const riskScores: Record<string, number> = {
      'auth_failed': 30,
      'rate_limited': 50,
      'preauth_rate_limited': 60,  // SECURITY FIX M1: Pre-auth rate limit (potential brute force)
      'handler_error': 10,
      'webhook_invalid_signature': 80,
      'webhook_replay_attempt': 70,
      'blocked_ip': 90,
      'blocked_country': 70,  // SECURITY FIX L3: Geo-blocked request
      'ssrf_attempt': 95,
    }
    
    // M2 FIX: Sanitize details before logging
    const sanitizedDetails = sanitizeForAudit({ ...details, ip: undefined, user_agent: undefined })
    
    await supabase.from('audit_log').insert({
      ledger_id: ledgerId,
      action,
      actor_type: 'system',
      actor_id: 'security',
      ip_address: details.ip,
      user_agent: details.user_agent?.substring(0, 500),
      request_id: details.request_id,
      request_body: sanitizedDetails,
      risk_score: riskScores[action] || 10,
    })
  } catch (err) {
    console.error('Failed to log security event:', err)
  }
}

// ============================================================================
// IP EXTRACTION
// ============================================================================

export function getClientIp(req: Request): string | null {
  // Cloudflare
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp
  
  // Standard proxy header
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take only the first IP (client IP), ignore proxies
    const firstIp = forwardedFor.split(',')[0].trim()
    // Basic IP validation
    if (/^[\d.:a-fA-F]+$/.test(firstIp)) {
      return firstIp
    }
  }
  
  // Fallback
  return req.headers.get('x-real-ip')
}

// ============================================================================
// TIMING-SAFE COMPARISON
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 * SECURITY FIX: Properly handles different-length strings without leaking length info
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aLen = a.length
  const bLen = b.length
  const maxLen = Math.max(aLen, bLen)
  
  // XOR lengths - non-zero if they differ, but we still compare all chars
  let result = aLen ^ bLen
  
  // Compare all characters up to maxLen
  // For shorter string, we compare against character code 0 (won't match)
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < aLen ? a.charCodeAt(i) : 0
    const bChar = i < bLen ? b.charCodeAt(i) : 0
    result |= aChar ^ bChar
  }
  
  return result === 0
}

// ============================================================================
// SSRF PROTECTION (M5 Fix)
// ============================================================================

/**
 * Private/internal IP ranges that should never be accessed
 */
const BLOCKED_IP_PATTERNS = [
  /^10\./,                          // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12
  /^192\.168\./,                    // 192.168.0.0/16
  /^127\./,                         // 127.0.0.0/8 (localhost)
  /^169\.254\./,                    // 169.254.0.0/16 (link-local, AWS metadata)
  /^0\./,                           // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // 100.64.0.0/10 (carrier-grade NAT)
  /^192\.0\.0\./,                   // 192.0.0.0/24
  /^192\.0\.2\./,                   // 192.0.2.0/24 (TEST-NET-1)
  /^198\.51\.100\./,                // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./,                 // 203.0.113.0/24 (TEST-NET-3)
  /^224\./,                         // 224.0.0.0/4 (multicast)
  /^240\./,                         // 240.0.0.0/4 (reserved)
]

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
])

/**
 * Check if an IP address is private/internal
 */
export function isPrivateIP(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some(pattern => pattern.test(ip))
}

/**
 * Check if a hostname is blocked
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return BLOCKED_HOSTNAMES.has(lower) || 
         lower.endsWith('.internal') ||
         lower.endsWith('.local') ||
         lower.endsWith('.svc.cluster.local')
}

/**
 * Validate a webhook URL for SSRF protection
 * Returns null if URL is safe, error message if blocked
 */
export function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    
    // Only allow HTTPS in production
    if (isProduction() && parsed.protocol !== 'https:') {
      return 'Only HTTPS URLs allowed in production'
    }
    
    // Block non-HTTP(S) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `Invalid protocol: ${parsed.protocol}`
    }
    
    // Block dangerous hostnames
    if (isBlockedHostname(parsed.hostname)) {
      return 'Blocked hostname'
    }
    
    // Check if hostname looks like an IP
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname)) {
      if (isPrivateIP(parsed.hostname)) {
        return 'Private IP addresses not allowed'
      }
    }
    
    // Block localhost variants
    if (parsed.hostname === '0.0.0.0' || parsed.hostname === '[::]') {
      return 'Invalid hostname'
    }
    
    return null  // URL is safe
  } catch {
    return 'Invalid URL format'
  }
}

/**
 * Safe webhook fetch with SSRF protection
 * Resolves DNS and validates the resolved IP before connecting
 * Logs SSRF attempts to audit_log for security monitoring
 */
export async function safeWebhookFetch(
  url: string, 
  payload: any,
  options: {
    timeout?: number
    headers?: Record<string, string>
    supabase?: SupabaseClient  // SECURITY FIX: For logging SSRF attempts
    ledgerId?: string
    requestId?: string
  } = {}
): Promise<Response> {
  // Step 1: Validate URL format
  const urlError = validateWebhookUrl(url)
  if (urlError) {
    // Log SSRF attempt if supabase client provided
    if (options.supabase) {
      await logSecurityEvent(options.supabase, options.ledgerId || null, 'ssrf_attempt', {
        url: url.substring(0, 200),  // Truncate URL
        error: urlError,
        stage: 'url_validation',
        request_id: options.requestId,
      }).catch(() => {})
    }
    throw new Error(`SSRF Protection: ${urlError}`)
  }
  
  const parsed = new URL(url)
  
  // Step 2: Resolve DNS to get actual IP
  // This prevents DNS rebinding attacks
  let resolvedIP: string
  try {
    const addresses = await Deno.resolveDns(parsed.hostname, 'A')
    if (!addresses || addresses.length === 0) {
      throw new Error('DNS resolution failed')
    }
    resolvedIP = addresses[0]
  } catch (err) {
    throw new Error(`SSRF Protection: Cannot resolve hostname - ${err}`)
  }
  
  // Step 3: Validate the RESOLVED IP (prevents DNS rebinding)
  if (isPrivateIP(resolvedIP)) {
    // Log DNS rebinding attempt
    if (options.supabase) {
      await logSecurityEvent(options.supabase, options.ledgerId || null, 'ssrf_attempt', {
        url: url.substring(0, 200),
        hostname: parsed.hostname,
        resolved_ip: resolvedIP,
        stage: 'dns_rebinding',
        request_id: options.requestId,
      }).catch(() => {})
    }
    throw new Error(`SSRF Protection: Resolved to private IP ${resolvedIP}`)
  }
  
  // Step 4: Make request with timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000)
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Soledgic-Webhook/1.0',
        ...options.headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
