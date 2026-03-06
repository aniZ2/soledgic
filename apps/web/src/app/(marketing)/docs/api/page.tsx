import { API_ENDPOINT_CATALOG, type ApiEndpointDoc } from './catalog'

type SampleValue = string | number | boolean | Record<string, never> | string[]

const METHOD_BADGE_CLASS: Record<string, string> = {
  GET: 'bg-blue-500/20 text-blue-600',
  POST: 'bg-green-500/20 text-green-600',
  PUT: 'bg-amber-500/20 text-amber-600',
  PATCH: 'bg-purple-500/20 text-purple-600',
  DELETE: 'bg-red-500/20 text-red-600',
}

const AUTH_BADGE_CLASS: Record<ApiEndpointDoc['auth'], string> = {
  'API key': 'bg-emerald-500/20 text-emerald-600',
  'Public/JWT': 'bg-indigo-500/20 text-indigo-600',
  'Webhook signature': 'bg-orange-500/20 text-orange-600',
  'Custom/internal': 'bg-slate-500/20 text-slate-600',
}

const CATEGORY_ORDER = [
  'Transactions',
  'Payouts',
  'Checkouts',
  'Accounts',
  'Ledgers',
  'Reports',
  'Invoices',
  'Budgets & Recurring',
  'Webhooks',
  'Tax',
  'Reconciliation',
  'Risk & Security',
  'Billing',
  'Health',
  'Internal',
] as const

const ENDPOINT_CATEGORIES: Record<string, string> = {
  'record-sale': 'Transactions',
  'record-refund': 'Transactions',
  'record-expense': 'Transactions',
  'record-income': 'Transactions',
  'record-adjustment': 'Transactions',
  'record-transfer': 'Transactions',
  'record-opening-balance': 'Transactions',
  'get-transactions': 'Transactions',
  'reverse-transaction': 'Transactions',
  'record-bill': 'Transactions',
  'pay-bill': 'Transactions',
  'import-transactions': 'Transactions',

  'process-payout': 'Payouts',
  'check-payout-eligibility': 'Payouts',
  'execute-payout': 'Payouts',
  'scheduled-payouts': 'Payouts',

  'create-checkout': 'Checkouts',
  'receive-payment': 'Checkouts',
  'preflight-authorization': 'Checkouts',
  'release-funds': 'Checkouts',

  'create-creator': 'Accounts',
  'delete-creator': 'Accounts',
  'get-balance': 'Accounts',
  'get-balances': 'Accounts',
  'manage-splits': 'Accounts',
  'register-instrument': 'Accounts',

  'create-ledger': 'Ledgers',
  'list-ledgers': 'Ledgers',
  'close-period': 'Ledgers',
  'frozen-statements': 'Ledgers',

  'generate-report': 'Reports',
  'profit-loss': 'Reports',
  'balance-sheet': 'Reports',
  'trial-balance': 'Reports',
  'ar-aging': 'Reports',
  'ap-aging': 'Reports',
  'export-report': 'Reports',
  'generate-pdf': 'Reports',
  'send-statements': 'Reports',
  'get-runway': 'Reports',

  'invoices': 'Invoices',

  'manage-budgets': 'Budgets & Recurring',
  'manage-recurring': 'Budgets & Recurring',
  'manage-contractors': 'Budgets & Recurring',

  'webhooks': 'Webhooks',
  'configure-alerts': 'Webhooks',

  'tax-documents': 'Tax',
  'generate-tax-summary': 'Tax',
  'submit-tax-info': 'Tax',

  'reconcile': 'Reconciliation',
  'import-bank-statement': 'Reconciliation',
  'manage-bank-accounts': 'Reconciliation',

  'configure-risk-policy': 'Risk & Security',
  'risk-evaluation': 'Risk & Security',
  'security-alerts': 'Risk & Security',
  'send-breach-alert': 'Risk & Security',

  'billing': 'Billing',
  'project-intent': 'Billing',

  'health-check': 'Health',

  'process-webhooks': 'Internal',
  'test-cleanup': 'Internal',
  'upload-receipt': 'Internal',
  'bill-overages': 'Internal',
  'ops-monitor': 'Internal',
  'process-processor-inbox': 'Internal',
  'reconcile-checkout-ledger': 'Internal',
}

function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function getCategory(endpoint: string): string {
  return ENDPOINT_CATEGORIES[endpoint] ?? 'Other'
}

function getSampleValue(name: string, type: string): SampleValue {
  const literal = type.match(/'([^']+)'/)
  if (literal) return literal[1]
  if (/\bboolean\b/i.test(type)) return true
  if (/\bnumber\b/i.test(type)) return name.includes('percent') ? 20 : 1000
  if (/\[\]|Array<.+>/i.test(type)) return ['item_1']
  if (/Record<|object|\{/.test(type)) return {}
  if (name.includes('email')) return 'user@example.com'
  if (name.includes('date')) return '2026-01-01'
  if (name.includes('id')) return `${name}_123`
  return 'value'
}

function toQueryValue(value: SampleValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.join(',')
  return 'true'
}

function buildQueryString(entry: ApiEndpointDoc): string {
  const queryParams = entry.parameters.filter((param) => param.in === 'query').slice(0, 4)
  if (queryParams.length === 0) return ''
  const query = queryParams
    .map((param) => `${param.name}=${encodeURIComponent(toQueryValue(getSampleValue(param.name, param.type)))}`)
    .join('&')
  return `?${query}`
}

function buildExampleBody(entry: ApiEndpointDoc): string {
  const bodyParams = entry.parameters
    .filter((param) => param.in === 'body')
    .sort((a, b) => Number(b.required) - Number(a.required))
    .slice(0, 8)

  if (bodyParams.length === 0) {
    return JSON.stringify({ example: 'value' }, null, 2)
  }

  const body: Record<string, SampleValue> = {}
  for (const param of bodyParams) {
    body[param.name] = getSampleValue(param.name, param.type)
  }
  return JSON.stringify(body, null, 2)
}

function formatCurl(parts: string[]): string {
  return parts.map((part, index) => (index < parts.length - 1 ? `${part} \\` : part)).join('\n')
}

function buildCurlExample(entry: ApiEndpointDoc): string {
  const method = entry.methods[0] ?? 'POST'
  const query = buildQueryString(entry)
  const url = `https://api.soledgic.com${entry.path}${query}`
  const headers: string[] = []

  if (entry.auth === 'API key') {
    headers.push('  -H "x-api-key: sk_test_YOUR_API_KEY"')
  } else if (entry.auth === 'Public/JWT') {
    headers.push('  -H "Authorization: Bearer YOUR_JWT_TOKEN"')
  } else if (entry.auth === 'Webhook signature') {
    headers.push('  -H "x-webhook-signature: YOUR_SIGNATURE"')
  }

  if (method === 'GET') {
    return formatCurl([`curl -X GET "${url}"`, ...headers])
  }

  const body = buildExampleBody(entry)
  return formatCurl([
    `curl -X ${method} "${url}"`,
    ...headers,
    '  -H "Content-Type: application/json"',
    `  -d '${body}'`,
  ])
}

function EndpointRow({ entry }: { entry: ApiEndpointDoc }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 px-3">
        <div className="font-medium text-foreground">{entry.title}</div>
        <code className="text-xs text-muted-foreground">{entry.path}</code>
      </td>
      <td className="py-2 px-3">
        <div className="flex flex-wrap gap-1">
          {entry.methods.map((method) => (
            <span
              key={`${entry.endpoint}-${method}`}
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                METHOD_BADGE_CLASS[method] ?? 'bg-slate-500/20 text-slate-600'
              }`}
            >
              {method}
            </span>
          ))}
        </div>
      </td>
      <td className="py-2 px-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${AUTH_BADGE_CLASS[entry.auth]}`}>
          {entry.auth}
        </span>
      </td>
      <td className="py-2 px-3">
        {entry.deprecated ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-600">
            Deprecated
          </span>
        ) : entry.internal ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-600">
            Internal
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-600">
            Public
          </span>
        )}
      </td>
      <td className="py-2 px-3">
        <a href={`#${entry.endpoint}`} className="text-primary hover:underline">
          View details
        </a>
      </td>
    </tr>
  )
}

function EndpointDetails({ entry }: { entry: ApiEndpointDoc }) {
  return (
    <details id={entry.endpoint} className="border border-border rounded-lg p-4 bg-card">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-foreground">{entry.title}</div>
            <code className="text-xs text-muted-foreground">{entry.path}</code>
          </div>
          <div className="flex flex-wrap gap-1">
            {entry.methods.map((method) => (
              <span
                key={`${entry.endpoint}-summary-${method}`}
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  METHOD_BADGE_CLASS[method] ?? 'bg-slate-500/20 text-slate-600'
                }`}
              >
                {method}
              </span>
            ))}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${AUTH_BADGE_CLASS[entry.auth]}`}>
              {entry.auth}
            </span>
            {entry.internal && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-600">
                Internal
              </span>
            )}
            {entry.deprecated && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-600">
                Deprecated
              </span>
            )}
          </div>
        </div>
      </summary>

      <div className="mt-4 pt-4 border-t border-border space-y-4">
        <p className="text-muted-foreground">{entry.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-900 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Gateway path</div>
            <code className="text-sm text-slate-300">https://api.soledgic.com{entry.path}</code>
          </div>
          <div className="bg-slate-900 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Supabase function</div>
            <code className="text-sm text-slate-300">/functions/v1/{entry.endpoint}</code>
          </div>
        </div>

        <div className="bg-muted/40 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Source</div>
          <code className="text-sm">{entry.source}</code>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Parameters</h3>
          {entry.parameters.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-foreground">Location</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground">Name</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.parameters.map((param) => (
                    <tr key={`${entry.endpoint}-${param.in}-${param.name}`} className="border-b border-border last:border-0">
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-500/20 text-slate-600">
                          {param.in}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{param.name}</code>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground font-mono text-xs">{param.type}</td>
                      <td className="py-2 px-3">
                        {param.required ? (
                          <span className="text-emerald-600">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No formal parameters were inferred for this endpoint from source declarations.
            </p>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Example Request</h3>
          <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-slate-300">{buildCurlExample(entry)}</pre>
          </div>
        </div>
      </div>
    </details>
  )
}

export default function ApiReferencePage() {
  const catalog = [...API_ENDPOINT_CATALOG].sort((a, b) => a.endpoint.localeCompare(b.endpoint))
  const totalEndpoints = catalog.length
  const internalCount = catalog.filter((entry) => entry.internal).length
  const deprecatedCount = catalog.filter((entry) => entry.deprecated).length
  const publicCount = catalog.filter((entry) => !entry.internal && !entry.deprecated).length

  // Group endpoints by category
  const grouped = new Map<string, ApiEndpointDoc[]>()
  for (const entry of catalog) {
    const cat = getCategory(entry.endpoint)
    const list = grouped.get(cat) ?? []
    list.push(entry)
    grouped.set(cat, list)
  }

  // Build ordered list of categories (CATEGORY_ORDER first, then any unmapped)
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c)),
  ]

  // Public categories for Quick Reference grid (exclude Internal)
  const publicCategories = orderedCategories.filter((c) => c !== 'Internal')

  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">API Reference</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Full generated reference for every Soledgic API endpoint.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Base URLs</h2>
        <div className="space-y-3">
          <div className="bg-slate-900 rounded-lg p-4">
            <code className="text-sm text-slate-300">https://api.soledgic.com/v1</code>
          </div>
          <div className="bg-slate-900 rounded-lg p-4">
            <code className="text-sm text-slate-300">https://YOUR_PROJECT.supabase.co/functions/v1</code>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Most endpoints use <code className="bg-muted px-1.5 py-0.5 rounded">x-api-key</code>. Billing, bootstrap, and
          webhook endpoints use JWT or signature-based auth as shown per endpoint below.
        </p>
      </section>

      <section id="quick-reference" className="mb-12 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Quick Reference</h2>
        <p className="text-muted-foreground mb-4">
          {totalEndpoints} endpoints ({publicCount} public, {internalCount} internal
          {deprecatedCount > 0 ? `, ${deprecatedCount} deprecated` : ''}) organized
          into {publicCategories.length} resource groups.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {publicCategories.map((cat) => {
            const entries = grouped.get(cat) ?? []
            return (
              <a
                key={cat}
                href={`#cat-${categorySlug(cat)}`}
                className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
              >
                <div className="font-semibold text-foreground text-sm">{cat}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {entries.length} endpoint{entries.length !== 1 ? 's' : ''}
                </div>
              </a>
            )
          })}
        </div>
      </section>

      <section id="endpoint-details" className="scroll-mt-20">
        {orderedCategories.map((cat) => {
          const entries = grouped.get(cat) ?? []
          const slug = categorySlug(cat)

          return (
            <section key={cat} id={`cat-${slug}`} className="mb-12 scroll-mt-20">
              <h2 className="text-2xl font-semibold text-foreground mb-4">{cat}</h2>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-foreground">Endpoint</th>
                      <th className="text-left py-2 px-3 font-medium text-foreground">Methods</th>
                      <th className="text-left py-2 px-3 font-medium text-foreground">Auth</th>
                      <th className="text-left py-2 px-3 font-medium text-foreground">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-foreground">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <EndpointRow key={entry.endpoint} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                {entries.map((entry) => (
                  <EndpointDetails key={entry.endpoint} entry={entry} />
                ))}
              </div>
            </section>
          )
        })}
      </section>

      <section id="error-responses" className="mb-12 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Error Responses</h2>
        <p className="text-muted-foreground mb-4">All endpoints return a consistent error envelope.</p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`{
  "success": false,
  "error": "Error message here",
  "request_id": "req_xxx"
}`}
          </pre>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Code</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">400</code></td>
                <td className="py-2 px-3 text-muted-foreground">Validation or malformed request</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">401</code></td>
                <td className="py-2 px-3 text-muted-foreground">Missing or invalid authentication</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">403</code></td>
                <td className="py-2 px-3 text-muted-foreground">Forbidden or account inactive</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">404</code></td>
                <td className="py-2 px-3 text-muted-foreground">Resource not found</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">409</code></td>
                <td className="py-2 px-3 text-muted-foreground">State conflict (duplicate or invalid transition)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">413</code></td>
                <td className="py-2 px-3 text-muted-foreground">Payload too large</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">429</code></td>
                <td className="py-2 px-3 text-muted-foreground">Rate limit exceeded</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">500</code></td>
                <td className="py-2 px-3 text-muted-foreground">Internal server error</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
