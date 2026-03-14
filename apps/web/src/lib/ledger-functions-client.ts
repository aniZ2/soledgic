import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface LedgerFunctionOptions {
  ledgerId: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  query?: Record<string, string | number | boolean | null | undefined>
}

/**
 * Call a Soledgic ledger edge function through the Next.js API proxy.
 *
 * The generic parameter `T` is intentionally unused in the return type --
 * the function still returns a raw `Response` so callers can inspect status
 * codes before parsing. Use `T` at the call-site with `.json()` casts:
 *
 * ```ts
 * const res = await callLedgerFunction<RefundResponse>('refunds', opts)
 * const data: RefundResponse = await res.json()
 * ```
 */
export async function callLedgerFunction<T = unknown>(
  endpoint: string,
  options: LedgerFunctionOptions
): Promise<Response> {
  const { ledgerId, method = 'POST', body, query } = options

  const url = new URL(`/api/ledger-functions/${endpoint}`, window.location.origin)
  url.searchParams.set('ledger_id', ledgerId)

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }

  if (method === 'GET') {
    return fetchWithCsrf(url.toString(), { method })
  }

  return fetchWithCsrf(url.toString(), {
    method,
    body: JSON.stringify({ ...(body || {}), ledger_id: ledgerId }),
  })
}
