/**
 * Security Utilities Library
 * Centralized security functions for the Soledgic web application
 */

import { randomBytes, createHmac } from 'crypto'

// ============================================================================
// REDIRECT VALIDATION
// ============================================================================

/**
 * Validates a redirect URL to prevent open redirect attacks
 * @param path - The redirect path to validate
 * @returns true if the path is safe to redirect to
 */
export function isValidRedirect(path: string): boolean {
  if (!path || typeof path !== 'string') return false

  // Must start with /
  if (!path.startsWith('/')) return false

  // Must not be a protocol-relative URL (//evil.com)
  if (path.startsWith('//')) return false

  // Must not contain protocol
  if (path.includes('://')) return false

  // Must not contain backslashes (URL encoding bypass)
  if (path.includes('\\')) return false

  // Must not contain null bytes
  if (path.includes('\0')) return false

  // Check for URL-encoded bypasses
  try {
    const decoded = decodeURIComponent(path)
    if (decoded.startsWith('//') || decoded.includes('://')) return false
  } catch {
    return false
  }

  // Normalize and check again
  try {
    const url = new URL(path, 'http://localhost')
    if (url.origin !== 'http://localhost') return false
  } catch {
    return false
  }

  return true
}

/**
 * Sanitizes a redirect path, returning a safe default if invalid
 * @param path - The redirect path to sanitize
 * @param defaultPath - The default path to return if invalid (default: '/dashboard')
 * @returns A safe redirect path
 */
export function sanitizeRedirect(path: string, defaultPath = '/dashboard'): string {
  return isValidRedirect(path) ? path : defaultPath
}

// ============================================================================
// CSRF PROTECTION
// ============================================================================

function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (secret) {
    return secret
  }

  // Only allow fallback in development - NEVER in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECURITY ERROR: CSRF_SECRET environment variable is required in production. ' +
      'Set CSRF_SECRET to a random 32+ character string.'
    )
  }

  // Development-only warning
  console.warn(
    '⚠️  CSRF_SECRET not set - using development fallback. ' +
    'This is insecure and will fail in production.'
  )

  return 'development-only-csrf-secret-do-not-use-in-production'
}

const CSRF_SECRET = getCsrfSecret()
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000 // 1 hour in milliseconds

/**
 * Generates a CSRF token for form protection
 * @param sessionId - The user's session ID for binding
 * @returns A CSRF token string
 */
export function generateCsrfToken(sessionId: string): string {
  const timestamp = Date.now().toString(36)
  const random = randomBytes(16).toString('hex')
  const data = `${sessionId}:${timestamp}:${random}`
  const signature = createHmac('sha256', CSRF_SECRET)
    .update(data)
    .digest('hex')
    .slice(0, 32)

  return `${data}:${signature}`
}

/**
 * Validates a CSRF token
 * @param token - The token to validate
 * @param sessionId - The expected session ID
 * @returns true if the token is valid
 */
export function validateCsrfToken(token: string, sessionId: string): boolean {
  if (!token || typeof token !== 'string') return false

  const parts = token.split(':')
  if (parts.length !== 4) return false

  const [tokenSessionId, timestamp, random, signature] = parts

  // Verify session ID matches
  if (tokenSessionId !== sessionId) return false

  // Verify timestamp is not expired
  const tokenTime = parseInt(timestamp, 36)
  if (isNaN(tokenTime) || Date.now() - tokenTime > CSRF_TOKEN_EXPIRY) return false

  // Verify signature
  const data = `${tokenSessionId}:${timestamp}:${random}`
  const expectedSignature = createHmac('sha256', CSRF_SECRET)
    .update(data)
    .digest('hex')
    .slice(0, 32)

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) return false

  let result = 0
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }

  return result === 0
}

// ============================================================================
// INPUT SANITIZATION
// ============================================================================

/**
 * Sanitizes a string to prevent XSS attacks
 * @param input - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return ''

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Validates and sanitizes an email address
 * @param email - The email to validate
 * @returns The sanitized email or null if invalid
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return null

  const trimmed = email.trim().toLowerCase()
  if (trimmed.length > 254) return null

  // Basic email regex - not perfect but catches most issues
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
  if (!emailRegex.test(trimmed)) return null

  return trimmed
}

/**
 * Validates and sanitizes an ID (alphanumeric with hyphens/underscores)
 * @param id - The ID to validate
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns The sanitized ID or null if invalid
 */
export function sanitizeId(id: string, maxLength = 100): string | null {
  if (!id || typeof id !== 'string') return null
  if (id.length === 0 || id.length > maxLength) return null

  // Only allow alphanumeric, hyphen, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null

  return id
}

/**
 * Validates a UUID v4 format
 * @param uuid - The UUID to validate
 * @returns true if valid UUID v4 format
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

// ============================================================================
// RATE LIMITING HELPERS
// ============================================================================

/**
 * Generates a rate limit key for a user/IP
 * @param identifier - User ID or IP address
 * @param action - The action being rate limited
 * @returns A rate limit key
 */
export function getRateLimitKey(identifier: string, action: string): string {
  return `ratelimit:${action}:${identifier}`
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Returns security headers for API responses
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
  }
}

// ============================================================================
// PASSWORD VALIDATION
// ============================================================================

/**
 * Validates password strength
 * @param password - The password to validate
 * @returns An object with isValid and any error messages
 */
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required'] }
  }

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  // Check for common weak passwords
  const commonPasswords = ['password123', 'qwerty123456', 'admin12345']
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password is too common')
  }

  return { isValid: errors.length === 0, errors }
}

// ============================================================================
// AUDIT LOGGING HELPERS
// ============================================================================

/**
 * Sanitizes data for audit logging (removes sensitive fields)
 */
export function sanitizeForAudit(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = new Set([
    'password',
    'secret',
    'token',
    'api_key',
    'apiKey',
    'access_token',
    'refresh_token',
    'authorization',
    'ssn',
    'tax_id',
    'account_number',
    'routing_number',
    'credit_card',
    'cvv',
  ])

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForAudit(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}
