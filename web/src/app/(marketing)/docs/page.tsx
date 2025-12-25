import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Book, Code, Zap, FileText, Users, RefreshCw, Shield } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
} from '@/components/seo'

// ============================================================================
// SEO METADATA
// ============================================================================

export const metadata: Metadata = {
  title: 'API Documentation & Developer Guide',
  description: 'Complete documentation for Soledgic accounting API. Learn how to integrate double-entry bookkeeping, revenue splits, payouts, and tax compliance into your application.',
  keywords: [
    'accounting API documentation',
    'bookkeeping API reference',
    'double-entry API guide',
    'revenue split API docs',
    'payout API documentation',
    '1099 compliance API',
    'financial API reference',
    'ledger API documentation',
  ],
  alternates: {
    canonical: '/docs',
  },
  openGraph: {
    title: 'Soledgic API Documentation',
    description: 'Complete documentation for integrating Soledgic accounting into your application.',
    url: '/docs',
    type: 'website',
  },
}

// ============================================================================
// SCHEMA DATA
// ============================================================================

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
]

const sections = [
  {
    title: 'Getting Started',
    icon: Zap,
    description: 'Start integrating Soledgic in minutes',
    links: [
      { name: 'Quickstart Guide', href: '/docs/quickstart', description: '5-minute integration tutorial', level: 'Beginner' },
      { name: 'Authentication', href: '/docs/authentication', description: 'API key management and security', level: 'Beginner' },
      { name: 'Core Concepts', href: '/docs/concepts', description: 'Understanding double-entry accounting', level: 'Intermediate' },
    ],
  },
  {
    title: 'API Reference',
    icon: Code,
    description: 'Complete endpoint documentation',
    links: [
      { name: 'Record Sale', href: '/docs/api/record-sale', description: 'Create sale transactions with splits', level: 'Intermediate' },
      { name: 'Record Expense', href: '/docs/api/record-expense', description: 'Track expenses with IRS categories', level: 'Intermediate' },
      { name: 'Process Payout', href: '/docs/api/process-payout', description: 'Pay out creator earnings', level: 'Advanced' },
      { name: 'Get Transactions', href: '/docs/api/get-transactions', description: 'Query transaction history', level: 'Intermediate' },
      { name: 'Trial Balance', href: '/docs/api/trial-balance', description: 'Generate trial balance report', level: 'Intermediate' },
      { name: 'Profit & Loss', href: '/docs/api/profit-loss', description: 'Generate P&L statements', level: 'Intermediate' },
    ],
  },
  {
    title: 'Guides',
    icon: Book,
    description: 'Step-by-step integration guides',
    links: [
      { name: 'Marketplace Integration', href: '/docs/guides/marketplace', description: 'Revenue splits and payouts', level: 'Advanced' },
      { name: 'Bank Reconciliation', href: '/docs/guides/reconciliation', description: 'Match transactions with bank', level: 'Advanced' },
      { name: 'Period Closing', href: '/docs/guides/period-closing', description: 'Close accounting periods', level: 'Intermediate' },
      { name: 'Tax Exports', href: '/docs/guides/tax-exports', description: '1099 and Schedule C exports', level: 'Advanced' },
    ],
  },
]

function getLevelColor(level: string) {
  switch (level) {
    case 'Beginner':
      return 'bg-emerald-100 text-emerald-700'
    case 'Intermediate':
      return 'bg-blue-100 text-blue-700'
    case 'Advanced':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export default function DocsPage() {
  return (
    <>
      {/* Structured Data */}
      <TechArticleSchema
        headline="Soledgic API Documentation"
        description="Complete documentation for Soledgic accounting API including quickstart, authentication, and API reference."
        slug=""
        proficiencyLevel="Beginner"
        datePublished="2025-01-01T00:00:00Z"
        keywords={['API', 'documentation', 'accounting', 'double-entry', 'integration']}
        articleSection="Documentation"
      />
      <BreadcrumbSchema items={breadcrumbItems} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumbs */}
        <Breadcrumbs items={breadcrumbItems} />
        
        {/* Hero */}
        <header className="text-center mb-16">
          <h1 className="text-4xl font-bold text-foreground mb-4">API Documentation</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to integrate <strong>double-entry accounting</strong> into your platform. 
            From quickstart to advanced features.
          </p>
        </header>

        {/* Quick Start Code Block */}
        <section className="bg-card border border-border rounded-lg p-6 mb-12" aria-labelledby="quickstart-heading">
          <h2 id="quickstart-heading" className="text-lg font-semibold text-foreground mb-4">Quick Start</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300">
              <code>{`# Record a sale with revenue split
curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 9900,
    "reference_id": "order_123",
    "creator_id": "creator_456",
    "platform_fee_percent": 20
  }'`}</code>
            </pre>
          </div>
          <Link 
            href="/docs/quickstart"
            className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
          >
            View full quickstart guide
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        {/* Sections */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {sections.map((section) => (
            <section key={section.title} aria-labelledby={`section-${section.title.toLowerCase().replace(' ', '-')}`}>
              <div className="flex items-center gap-2 mb-4">
                <section.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 id={`section-${section.title.toLowerCase().replace(' ', '-')}`} className="text-lg font-semibold text-foreground">
                  {section.title}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{section.description}</p>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link 
                      href={link.href}
                      className="group block"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-foreground group-hover:text-primary transition-colors font-medium">
                          {link.name}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getLevelColor(link.level)}`}>
                          {link.level}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* API Endpoints Summary */}
        <section className="mb-16" aria-labelledby="endpoints-heading">
          <h2 id="endpoints-heading" className="text-2xl font-bold text-foreground mb-6">API Endpoints</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground" scope="col">Endpoint</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground" scope="col">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /record-sale</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Record a sale transaction with optional revenue split</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /record-expense</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Record a business expense with IRS category</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /process-payout</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Pay out creator or contractor earnings</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">GET /get-transactions</code></td>
                  <td className="py-3 px-4 text-muted-foreground">List transactions with filters and pagination</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">GET /trial-balance</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Get current trial balance report</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">GET /profit-loss</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Generate profit and loss statement</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /record-refund</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Process a refund with automatic reversal</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /reverse-transaction</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Reverse a transaction (immutable ledger)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /close-period</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Close an accounting period</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="font-mono text-sm text-foreground">POST /reconcile</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Bank reconciliation</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Full documentation for all 27 endpoints available in the <Link href="/docs/api" className="text-primary hover:underline">API Reference</Link> section.
          </p>
        </section>

        {/* Core Concepts */}
        <section className="mb-16" aria-labelledby="concepts-heading">
          <h2 id="concepts-heading" className="text-2xl font-bold text-foreground mb-6">Core Concepts</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <article className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">Double-Entry Ledger</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                Every transaction creates balanced debit and credit entries. Your trial balance always balances, 
                providing <strong>bank-grade integrity</strong> for your financial data.
              </p>
            </article>
            <article className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-3">
                <RefreshCw className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">Immutable History</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                No edits, only reversals. Your <strong>audit trail</strong> is unforgeable and CPA-ready. 
                Perfect for compliance and investor due diligence.
              </p>
            </article>
            <article className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-3">
                <Users className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">Creator Accounts</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                Automatic <strong>revenue splitting</strong> for marketplace platforms. Track creator balances, 
                payouts, and 1099 thresholds automatically.
              </p>
            </article>
            <article className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">Schedule C Categories</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                Expenses automatically mapped to <strong>IRS Schedule C</strong> lines. Tax-time simplicity 
                with export-ready reports.
              </p>
            </article>
          </div>
        </section>
        
        {/* CTA */}
        <section className="bg-[#1C1917] text-white rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to integrate?</h2>
          <p className="text-stone-400 mb-6 max-w-xl mx-auto">
            Get your API key and start building in minutes. Full documentation and support included.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/signup"
              className="inline-flex items-center justify-center gap-2 bg-white text-[#1C1917] px-6 py-3 rounded-lg font-medium hover:bg-stone-100 transition-colors"
            >
              Get API Key
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link 
              href="/docs/quickstart"
              className="inline-flex items-center justify-center gap-2 border border-stone-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors"
            >
              Read Quickstart
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
