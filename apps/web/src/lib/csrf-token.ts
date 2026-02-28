const CSRF_TOKEN_LENGTH_BYTES = 32

/**
 * Generate a cryptographically secure CSRF token as lowercase hex.
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH_BYTES)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
