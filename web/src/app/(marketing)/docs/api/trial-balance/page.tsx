import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Trial Balance API - Financial Report',
  description: 'API documentation for generating trial balance reports showing all account balances in Soledgic.',
  keywords: ['trial balance', 'financial report', 'account balances', 'double-entry'],
  alternates: { canonical: '/docs/api/trial-balance' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Trial Balance', href: '/docs/api/trial-balance' },
]

export default function TrialBalancePage() {
  return (
    <>
      <TechArticleSchema headline="Trial Balance API" description="Generate trial balance reports showing all account balances" slug="api/trial-balance" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={8} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Trial Balance API" description="Generate trial balance financial reports" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-mono font-semibold">GET</span>
            <code className="text-2xl font-mono text-foreground">/trial-balance</code>
          </div>
          <p className="text-lg text-muted-foreground">Generate a <strong>trial balance</strong> report showing all account balances. Verifies that debits equal credits.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Query Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">as_of</td><td className="py-3 px-4">date</td><td className="py-3 px-4">Report date (default: today)</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">include_zero</td><td className="py-3 px-4">boolean</td><td className="py-3 px-4">Include accounts with zero balance</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/trial-balance?as_of=2025-01-31" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "success": true,
  "data": {
    "as_of": "2025-01-31",
    "accounts": [
      { "name": "Cash", "type": "asset", "debit": 150000, "credit": 0 },
      { "name": "Revenue", "type": "revenue", "debit": 0, "credit": 100000 },
      { "name": "Expenses", "type": "expense", "debit": 30000, "credit": 0 },
      { "name": "Creator Balances", "type": "liability", "debit": 0, "credit": 80000 }
    ],
    "totals": {
      "total_debits": 180000,
      "total_credits": 180000,
      "is_balanced": true
    }
  }
}`}</code></pre>
          </div>
        </section>

        <section className="mb-12 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <h3 className="font-semibold text-emerald-900 mb-2">Always Balanced</h3>
          <p className="text-sm text-emerald-800">In double-entry accounting, total debits must always equal total credits. If <code>is_balanced</code> is false, there's a data integrity issue—contact support.</p>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/get-transactions" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Get Transactions</Link>
          <Link href="/docs/api/profit-loss" className="flex items-center gap-2 text-primary hover:underline">Profit & Loss<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
