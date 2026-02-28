// CSRF protection utilities for Next.js API routes
// Implements double-submit cookie pattern and origin validation

import { cookies } from 'next/headers'
import { generateCsrfToken } from './csrf-token'

const CSRF_COOKIE_NAME = '__csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

const EXTRA_ALLOWED_ORIGINS = (process.env.CSRF_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Allowed origins for CSRF validation
const ALLOWED_ORIGINS = [
  'https://soledgic.com',
  'https://www.soledgic.com',
  'https://app.soledgic.com',
  'https://booklyverse.com',
  'https://www.booklyverse.com',
  'https://app.booklyverse.com',
  // Development
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  ...EXTRA_ALLOWED_ORIGINS,
]

/**
 * Set CSRF token cookie
 */
export async function setCsrfCookie(): Promise<string> {
  const token = generateCsrfToken()
  const cookieStore = await cookies()
  
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,  // Must be readable by JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })
  
  return token
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_COOKIE_NAME)?.value
}

/**
 * Validate CSRF token from request
 * Implements double-submit cookie pattern
 */
export async function validateCsrfToken(request: Request): Promise<boolean> {
  // GET, HEAD, OPTIONS don't need CSRF protection (they should be idempotent)
  const method = request.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true
  }
  
  // Get token from cookie
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value
  
  if (!cookieToken) {
    console.warn('CSRF: No token in cookie')
    return false
  }
  
  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  
  if (!headerToken) {
    console.warn('CSRF: No token in header')
    return false
  }
  
  // Constant-time comparison
  return timingSafeEqual(cookieToken, headerToken)
}

/**
 * Validate origin header
 */
export function validateOrigin(
  request: Request,
  options: { requireExplicitOrigin?: boolean } = {}
): boolean {
  const origin = request.headers.get('origin')
  const requireExplicitOrigin = options.requireExplicitOrigin === true
  const requestOrigin = new URL(request.url).origin
  
  // No origin header - could be same-origin request or server-to-server
  // For mutating session-auth routes, require an explicit same-origin signal.
  if (!origin) {
    // Check referer as fallback
    const referer = request.headers.get('referer')
    if (referer) {
      try {
        const refererUrl = new URL(referer)
        if (refererUrl.origin === requestOrigin) {
          return true
        }
        return ALLOWED_ORIGINS.some(allowed => {
          const allowedUrl = new URL(allowed)
          return refererUrl.origin === allowedUrl.origin
        })
      } catch {
        return false
      }
    }

    if (requireExplicitOrigin) {
      const requestedWith = (request.headers.get('x-requested-with') || '').toLowerCase().trim()
      return requestedWith === 'fetch' || requestedWith === 'xmlhttprequest'
    }

    return true
  }

  if (origin === requestOrigin) {
    return true
  }

  return ALLOWED_ORIGINS.includes(origin)
}

/**
 * Full CSRF validation: origin + token
 */
export async function validateCsrf(request: Request): Promise<{ valid: boolean; error?: string }> {
  const method = request.method.toUpperCase()
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)

  // Validate origin first
  if (!validateOrigin(request, { requireExplicitOrigin: isMutation })) {
    return { valid: false, error: 'Invalid origin' }
  }
  
  // Then validate CSRF token for state-changing methods
  if (isMutation) {
    const tokenValid = await validateCsrfToken(request)
    if (!tokenValid) {
      return { valid: false, error: 'Invalid CSRF token' }
    }
  }
  
  return { valid: true }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * API route wrapper with CSRF protection
 */
export function withCsrfProtection<T>(
  handler: (request: Request) => Promise<T>
): (request: Request) => Promise<T | Response> {
  return async (request: Request) => {
    const { valid, error } = await validateCsrf(request)
    
    if (!valid) {
      return new Response(
        JSON.stringify({ error: error || 'CSRF validation failed' }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    return handler(request)
  }
}
