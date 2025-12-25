import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Get Balance API - Account Balances',
  description: 'API documentation for retrieving account balances including cash, receivables, and creator balances in Soledgic.',
  keywords: ['get balance', 'account balance', 'cash balance', 'creator balance'],
  alternates: { canonical: '/docs/api/get-balance' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Get Balance', href: '/docs/api/get-balance' },
]

export default function GetBalancePage() {
  return (
    <>
      <TechArticleSchema headline="Get Balance API" description="Retrieve account balances for cash, receivables, and creator accounts" slug="api/get-balance" proficiencyLevel="Beginner" datePublished="2025-01-01T00:00:00Z" timeRequired={5} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Get Balance API" description="Retrieve account balances" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-mono font-semibold">GET</span>
            <code className="text-2xl font-mono text-foreground">/get-balance</code>
          </div>
          <p className="text-lg text-muted-foreground">Retrieve <strong>account balances</strong> for cash, receivables, creator balances, and more.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Query Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">account</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Specific account name (optional)</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">creator_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Get specific creator's balance</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">as_of</td><td className="py-3 px-4">date</td><td className="py-3 px-4">Balance as of date</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: All Balances</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/get-balance" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: Creator Balance</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/get-balance?creator_id=creator_jane_123" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "success": true,
  "data": {
    "as_of": "2025-01-15T12:00:00Z",
    "balances": [
      { "account": "Cash", "type": "asset", "balance": 150000 },
      { "account": "Accounts Receivable", "type": "asset", "balance": 25000 },
      { "account": "Platform Revenue", "type": "revenue", "balance": 50000 },
      { "account": "Creator Balances", "type": "liability", "balance": 80000 }
    ],
    "creators": [
      { "id": "creator_jane_123", "name": "Jane Creator", "balance": 45000 },
      { "id": "creator_bob_456", "name": "Bob Artist", "balance": 35000 }
    ]
  }
}`}</code></pre>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/process-payout" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Process Payout</Link>
          <Link href="/docs/api/get-transactions" className="flex items-center gap-2 text-primary hover:underline">Get Transactions<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
