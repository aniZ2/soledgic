import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Profit & Loss API - Income Statement',
  description: 'API documentation for generating profit and loss (P&L) statements by period in Soledgic.',
  keywords: ['profit loss', 'P&L', 'income statement', 'financial report'],
  alternates: { canonical: '/docs/api/profit-loss' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Profit & Loss', href: '/docs/api/profit-loss' },
]

export default function ProfitLossPage() {
  return (
    <>
      <TechArticleSchema headline="Profit & Loss API" description="Generate profit and loss (income) statements by period" slug="api/profit-loss" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={8} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Profit & Loss API" description="Generate P&L income statements" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-mono font-semibold">GET</span>
            <code className="text-2xl font-mono text-foreground">/profit-loss</code>
          </div>
          <p className="text-lg text-muted-foreground">Generate a <strong>profit and loss statement</strong> (income statement) for a specified period.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Query Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">year</td><td className="py-3 px-4">integer</td><td className="py-3 px-4">Report year (default: current)</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">month</td><td className="py-3 px-4">integer</td><td className="py-3 px-4">Report month (1-12, optional)</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">start_date</td><td className="py-3 px-4">date</td><td className="py-3 px-4">Custom start date</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">end_date</td><td className="py-3 px-4">date</td><td className="py-3 px-4">Custom end date</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/profit-loss?year=2025" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "success": true,
  "data": {
    "period": { "start": "2025-01-01", "end": "2025-12-31" },
    "revenue": {
      "total": 500000,
      "categories": [
        { "name": "Sales Revenue", "amount": 450000 },
        { "name": "Platform Fees", "amount": 50000 }
      ]
    },
    "expenses": {
      "total": 150000,
      "categories": [
        { "name": "Software", "amount": 24000 },
        { "name": "Advertising", "amount": 36000 },
        { "name": "Contract Labor", "amount": 60000 },
        { "name": "Office Expenses", "amount": 30000 }
      ]
    },
    "net_income": 350000
  }
}`}</code></pre>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/trial-balance" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Trial Balance</Link>
          <Link href="/docs/guides/marketplace" className="flex items-center gap-2 text-primary hover:underline">Marketplace Guide<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
