import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface LedgerFunctionOptions {
  ledgerId: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  query?: Record<string, string | number | boolean | null | undefined>
}

export async function callLedgerFunction(
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
    return fetch(url.toString(), { method, credentials: 'same-origin' })
  }

  return fetchWithCsrf(url.toString(), {
    method,
    body: JSON.stringify({ ...(body || {}), ledger_id: ledgerId }),
  })
}
