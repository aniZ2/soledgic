/**
 * Client-side fetch helper that attaches the CSRF token from the
 * __csrf_token cookie as an x-csrf-token header (double-submit pattern).
 */

export function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)__csrf_token=([^;]*)/)
  return match?.[1]
}

export async function fetchWithCsrf(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = getCsrfToken()
  if (token) headers.set('x-csrf-token', token)
  if (!headers.has('x-requested-with')) headers.set('x-requested-with', 'fetch')
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(url, { ...options, headers })
}
