import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Code, Zap } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
} from '@/components/seo'

export const metadata: Metadata = {
  title: 'API Reference - Complete Endpoint Documentation',
  description: 'Complete API reference for Soledgic accounting endpoints. Record sales with revenue splits, track expenses with IRS categories, process creator payouts, generate CPA-ready reports.',
  keywords: [
    'accounting API',
    'REST API',
    'revenue split API',
    'creator payout API',
    'double-entry bookkeeping API',
    'financial reporting API',
    '1099 tracking API',
    'marketplace accounting',
  ],
  alternates: { canonical: '/docs/api' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
]

const endpoints = [
  {
    category: 'Recording Transactions',
    description: 'Create immutable ledger entries with automatic double-entry bookkeeping',
    items: [
      { 
        method: 'POST', 
        path: '/record-sale', 
        description: 'Record sale with automatic revenue split calculation', 
        useCase: 'Marketplaces & Platforms',
        keywords: 'revenue split, creator balance, 80/20 split',
        href: '/docs/api/record-sale' 
      },
      { 
        method: 'POST', 
        path: '/record-expense', 
        description: 'Track expenses with IRS category mapping', 
        useCase: 'All Businesses',
        keywords: 'tax deduction, Schedule C, expense tracking',
        href: '/docs/api/record-expense' 
      },
      { 
        method: 'POST', 
        path: '/record-income', 
        description: 'Record non-sale income (interest, refunds received)', 
        useCase: 'All Businesses',
        keywords: 'other income, interest, miscellaneous revenue',
        href: '/docs/api/record-income' 
      },
      { 
        method: 'POST', 
        path: '/record-refund', 
        description: 'Process customer refund with split reversal', 
        useCase: 'Marketplaces & E-commerce',
        keywords: 'refund, chargeback, split reversal',
        href: '/docs/api/record-refund' 
      },
      { 
        method: 'POST', 
        path: '/reverse-transaction', 
        description: 'Void a transaction with correcting entries', 
        useCase: 'Error Correction',
        keywords: 'void, correction, audit trail',
        href: '/docs/api/reverse-transaction' 
      },
    ],
  },
  {
    category: 'Invoicing & AR',
    description: 'Create invoices, track payments, and manage accounts receivable',
    items: [
      { 
        method: 'POST', 
        path: '/invoices', 
        description: 'Create, send, and manage invoices', 
        useCase: 'B2B & Services',
        keywords: 'invoice, billing, AR, accounts receivable',
        href: '/docs/api/invoices' 
      },
      { 
        method: 'GET', 
        path: '/ar-aging', 
        description: 'Accounts receivable aging report', 
        useCase: 'Collections & Cash Flow',
        keywords: 'aging, overdue, collections, DSO',
        href: '/docs/api/ar-aging' 
      },
      { 
        method: 'GET', 
        path: '/ap-aging', 
        description: 'Accounts payable aging report', 
        useCase: 'Cash Flow Planning',
        keywords: 'bills, payables, vendor, due dates',
        href: '/docs/api/ap-aging' 
      },
    ],
  },
  {
    category: 'Creator & Contractor Management',
    description: 'Track balances and process payouts for creators, contractors, and vendors',
    items: [
      { 
        method: 'POST', 
        path: '/process-payout', 
        description: 'Pay creators with balance validation and fee handling', 
        useCase: 'Marketplaces & Platforms',
        keywords: 'creator payout, ACH, 1099 tracking',
        href: '/docs/api/process-payout' 
      },
      { 
        method: 'GET', 
        path: '/get-balance', 
        description: 'Get available balance (ledger minus held funds)', 
        useCase: 'Creator Dashboards',
        keywords: 'available balance, held funds, withdrawable',
        href: '/docs/api/get-balance' 
      },
    ],
  },
  {
    category: 'Financial Reports',
    description: 'Generate CPA-ready statements and audit trails',
    items: [
      { 
        method: 'GET', 
        path: '/get-transactions', 
        description: 'List transactions with date, type, and account filters', 
        useCase: 'Audit & Reconciliation',
        keywords: 'transaction history, ledger entries, audit log',
        href: '/docs/api/get-transactions' 
      },
      { 
        method: 'GET', 
        path: '/trial-balance', 
        description: 'Debits = Credits validation report', 
        useCase: 'Accountants & CPAs',
        keywords: 'trial balance, debit credit, period end',
        href: '/docs/api/trial-balance' 
      },
      { 
        method: 'GET', 
        path: '/profit-loss', 
        description: 'Income statement with expense breakdown', 
        useCase: 'Tax Prep & Investors',
        keywords: 'P&L, income statement, net income, gross margin',
        href: '/docs/api/profit-loss' 
      },
      { 
        method: 'GET', 
        path: '/balance-sheet', 
        description: 'Assets = Liabilities + Equity statement', 
        useCase: 'Investors & Lenders',
        keywords: 'balance sheet, assets, liabilities, equity, financial position',
        href: '/docs/api/balance-sheet' 
      },
    ],
  },
  {
    category: 'Period & Reconciliation',
    description: 'Close accounting periods and reconcile with bank statements',
    items: [
      { 
        method: 'POST', 
        path: '/close-period', 
        description: 'Lock a month/quarter to prevent edits', 
        useCase: 'Month-End Close',
        keywords: 'period close, lock entries, fiscal period',
        href: '/docs/api/close-period' 
      },
      { 
        method: 'POST', 
        path: '/reconcile', 
        description: 'Match ledger entries to bank transactions', 
        useCase: 'Bank Reconciliation',
        keywords: 'bank reconciliation, statement matching, balance verification',
        href: '/docs/api/reconcile' 
      },
    ],
  },
  {
    category: 'Webhooks & Events',
    description: 'Real-time notifications for transactions and thresholds',
    items: [
      { 
        method: 'POST', 
        path: '/webhooks', 
        description: 'Subscribe to sale, payout, and 1099 threshold events', 
        useCase: 'Integrations & Automation',
        keywords: 'webhook, event notification, real-time',
        href: '/docs/api/webhooks' 
      },
    ],
  },
]

function MethodBadge({ method }: { method: string }) {
  const colors = {
    GET: 'bg-emerald-100 text-emerald-700',
    POST: 'bg-blue-100 text-blue-700',
    PUT: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${colors[method as keyof typeof colors] || 'bg-gray-100'}`}>
      {method}
    </span>
  )
}

function UseCaseBadge({ useCase }: { useCase: string }) {
  const colors: Record<string, string> = {
    'Marketplaces & Platforms': 'bg-violet-100 text-violet-700',
    'All Businesses': 'bg-slate-100 text-slate-700',
    'Marketplaces & E-commerce': 'bg-violet-100 text-violet-700',
    'Error Correction': 'bg-amber-100 text-amber-700',
    'Creator Dashboards': 'bg-pink-100 text-pink-700',
    'Audit & Reconciliation': 'bg-cyan-100 text-cyan-700',
    'Accountants & CPAs': 'bg-indigo-100 text-indigo-700',
    'Tax Prep & Investors': 'bg-green-100 text-green-700',
    'Month-End Close': 'bg-orange-100 text-orange-700',
    'Bank Reconciliation': 'bg-teal-100 text-teal-700',
    'Integrations & Automation': 'bg-rose-100 text-rose-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${colors[useCase] || 'bg-gray-100 text-gray-700'}`}>
      {useCase}
    </span>
  )
}

export default function ApiReferencePage() {
  return (
    <>
      <TechArticleSchema
        headline="Soledgic API Reference"
        description="Complete API reference for all Soledgic accounting endpoints. Record sales with revenue splits, track expenses, process payouts, and generate financial reports."
        slug="api"
        proficiencyLevel="Intermediate"
        datePublished="2025-01-01T00:00:00Z"
        keywords={['API', 'REST', 'endpoints', 'reference', 'accounting', 'revenue split', 'payout']}
        articleSection="API Reference"
        wordCount={1500}
      />
      <BreadcrumbSchema items={breadcrumbItems} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">API Reference</h1>
          <p className="text-lg text-muted-foreground">
            Complete documentation for all <strong>Soledgic API endpoints</strong>. 
            Double-entry accounting, revenue splits, creator payouts, and CPA-ready reports—all via REST API.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="w-4 h-4" />
              18 endpoints
            </span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* Base URL */}
        <section className="mb-8 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-1">Base URL</h2>
              <code className="text-lg font-mono text-foreground">https://api.soledgic.com/v1</code>
            </div>
            <Link href="/docs/authentication" className="text-sm text-primary hover:underline">
              Authentication →
            </Link>
          </div>
        </section>

        {/* Quick Jump */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg">
          <h2 className="text-sm font-semibold text-foreground mb-3">Jump to Section</h2>
          <div className="flex flex-wrap gap-2">
            {endpoints.map((category) => (
              <a 
                key={category.category}
                href={`#${category.category.toLowerCase().replace(/\s+/g, '-')}`}
                className="px-3 py-1 bg-card border border-border rounded text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
              >
                {category.category}
              </a>
            ))}
          </div>
        </section>

        {/* Endpoints by Category */}
        {endpoints.map((category) => (
          <section 
            key={category.category} 
            id={category.category.toLowerCase().replace(/\s+/g, '-')}
            className="mb-12 scroll-mt-8" 
            aria-labelledby={`category-${category.category.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className="mb-4">
              <h2 
                id={`category-${category.category.toLowerCase().replace(/\s+/g, '-')}`} 
                className="text-xl font-semibold text-foreground flex items-center gap-2"
              >
                <Code className="w-5 h-5 text-primary" />
                {category.category}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
            </div>
            
            {/* Table View for larger screens */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Endpoint</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Description</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Use Case</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-medium w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {category.items.map((endpoint) => (
                      <tr key={endpoint.path} className="hover:bg-muted/50 transition-colors group">
                        <td className="py-3 px-4">
                          <Link href={endpoint.href} className="flex items-center gap-3">
                            <MethodBadge method={endpoint.method} />
                            <code className="font-mono text-foreground group-hover:text-primary transition-colors">
                              {endpoint.path}
                            </code>
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                          <Link href={endpoint.href}>
                            {endpoint.description}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <UseCaseBadge useCase={endpoint.useCase} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link 
                            href={endpoint.href}
                            className="text-muted-foreground group-hover:text-primary transition-colors"
                            aria-label={`View ${endpoint.path} documentation`}
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}

        {/* Common Headers */}
        <section className="mb-12" aria-labelledby="headers">
          <h2 id="headers" className="text-xl font-semibold text-foreground mb-4">Required Headers</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Header</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Value</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">x-api-key</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">sk_live_xxxxx or sk_test_xxxxx</td>
                  <td className="py-3 px-4"><span className="text-red-600 font-medium">Yes</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">Content-Type</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">application/json</td>
                  <td className="py-3 px-4"><span className="text-red-600 font-medium">Yes</span> (POST/PUT)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">Idempotency-Key</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">unique_request_id</td>
                  <td className="py-3 px-4"><span className="text-amber-600 font-medium">Recommended</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Common Parameters */}
        <section className="mb-12" aria-labelledby="common-params">
          <h2 id="common-params" className="text-xl font-semibold text-foreground mb-4">Common Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Parameter</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">reference_id</code></td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Unique identifier for idempotency. Use payment processor IDs (e.g., <code>pi_xxx</code>).</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">amount</code></td>
                  <td className="py-3 px-4 text-muted-foreground">integer</td>
                  <td className="py-3 px-4 text-muted-foreground">Amount in <strong>cents</strong>. $99.00 = <code>9900</code></td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">creator_id</code></td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Your internal creator/vendor ID. Auto-creates on first sale.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">description</code></td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Human-readable description for audit trail</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-primary">metadata</code></td>
                  <td className="py-3 px-4 text-muted-foreground">object</td>
                  <td className="py-3 px-4 text-muted-foreground">Custom key-value pairs (stored but not processed)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Error Codes */}
        <section className="mb-12" aria-labelledby="error-codes">
          <h2 id="error-codes" className="text-xl font-semibold text-foreground mb-4">Error Codes</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Code</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Meaning</th>
                  <th className="text-left py-3 px-4 text-muted-foreground hidden md:table-cell">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4"><code className="text-emerald-600">200</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Success</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Request completed successfully</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-emerald-600">201</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Created</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Resource created successfully</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Bad Request</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Check required parameters and types</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">401</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Unauthorized</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Verify x-api-key header</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">409</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Conflict (Duplicate)</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">reference_id already exists—returns existing transaction</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">422</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Business Logic Error</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Check error message (e.g., insufficient balance)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">423</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Period Closed</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Cannot modify entries in closed accounting period</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">429</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Rate Limited</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Wait and retry with exponential backoff</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">500</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Server Error</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">Safe to retry; contact support if persistent</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg" aria-labelledby="related">
          <h2 id="related" className="font-semibold text-foreground mb-3">Getting Started</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/quickstart" className="text-primary hover:underline">Quickstart Guide (5 min) →</Link>
            <Link href="/docs/authentication" className="text-primary hover:underline">Authentication setup →</Link>
            <Link href="/docs/concepts" className="text-primary hover:underline">Core accounting concepts →</Link>
            <Link href="/docs/guides/marketplace" className="text-primary hover:underline">Marketplace integration guide →</Link>
          </div>
        </section>
      </main>
    </>
  )
}
