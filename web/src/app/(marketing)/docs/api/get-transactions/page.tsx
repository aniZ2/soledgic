import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Get Transactions API - Query Transaction History',
  description: 'API documentation for listing and filtering transactions with pagination support in Soledgic.',
  keywords: ['get transactions', 'transaction history', 'query transactions', 'filter', 'pagination'],
  alternates: { canonical: '/docs/api/get-transactions' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Get Transactions', href: '/docs/api/get-transactions' },
]

export default function GetTransactionsPage() {
  return (
    <>
      <TechArticleSchema headline="Get Transactions API" description="List and filter transactions with pagination support" slug="api/get-transactions" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={8} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Get Transactions API" description="Query transaction history" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-mono font-semibold">GET</span>
            <code className="text-2xl font-mono text-foreground">/get-transactions</code>
          </div>
          <p className="text-lg text-muted-foreground">List and filter <strong>transactions</strong> with pagination support.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Query Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">type</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Filter by type: sale, expense, payout, refund</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">start_date</td><td className="py-3 px-4">date</td><td className="py-3 px-4">Start of date range</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">end_date</td><td className="py-3 px-4">date</td><td className="py-3 px-4">End of date range</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">creator_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Filter by creator</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">limit</td><td className="py-3 px-4">integer</td><td className="py-3 px-4">Results per page (default: 50, max: 100)</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">cursor</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Pagination cursor</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/get-transactions?type=sale&start_date=2025-01-01&limit=20" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "txn_abc123",
        "type": "sale",
        "amount": 9900,
        "reference_id": "order_12345",
        "description": "Product purchase",
        "created_at": "2025-01-15T10:30:00Z",
        "entries": [
          { "account": "Cash", "debit": 9900, "credit": 0 },
          { "account": "Revenue", "debit": 0, "credit": 9900 }
        ]
      }
    ],
    "pagination": {
      "has_more": true,
      "next_cursor": "eyJpZCI6InR4bl94eXoifQ=="
    }
  }
}`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Pagination</h2>
          <p className="text-muted-foreground mb-4">Use cursor-based pagination for large result sets:</p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`# First page
curl "https://api.soledgic.com/v1/get-transactions?limit=50"

# Next page
curl "https://api.soledgic.com/v1/get-transactions?limit=50&cursor=eyJpZCI6InR4bl94eXoifQ=="`}</code></pre>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/get-balance" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Get Balance</Link>
          <Link href="/docs/api/trial-balance" className="flex items-center gap-2 text-primary hover:underline">Trial Balance<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
