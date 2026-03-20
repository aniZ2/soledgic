/**
 * Client-side fetch helper that attaches the CSRF token from the
 * __csrf_token cookie as an x-csrf-token header (double-submit pattern).
 */
import { createClient } from '@/lib/supabase/client'

let supabaseClient: ReturnType<typeof createClient> | null = null

export function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)__csrf_token=([^;]*)/)
  return match?.[1]
}

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient()
  }
  return supabaseClient
}

function isInternalApiRequest(url: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function shouldSetJsonContentType(body: BodyInit | null | undefined): boolean {
  if (body === undefined || body === null) return false
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return false
  if (ArrayBuffer.isView(body)) return false
  return true
}

export async function fetchWithCsrf(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = getCsrfToken()
  if (token) headers.set('x-csrf-token', token)
  if (!headers.has('x-requested-with')) headers.set('x-requested-with', 'fetch')

  if (shouldSetJsonContentType(options.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (isInternalApiRequest(url) && !headers.has('authorization')) {
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession()
      if (session?.access_token) {
        headers.set('authorization', `Bearer ${session.access_token}`)
      }
    } catch {
      // Fallback to cookie-based auth only when session cannot be read.
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? 'include',
  })
}
