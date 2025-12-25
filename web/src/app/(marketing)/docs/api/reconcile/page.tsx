import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Landmark } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Reconcile API - Bank Reconciliation',
  description: 'API documentation for bank reconciliation and matching transactions with bank statements in Soledgic.',
  keywords: ['reconcile', 'bank reconciliation', 'match transactions', 'bank statement'],
  alternates: { canonical: '/docs/api/reconcile' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Reconcile', href: '/docs/api/reconcile' },
]

export default function ReconcilePage() {
  return (
    <>
      <TechArticleSchema headline="Reconcile API" description="Match ledger transactions with bank statements for reconciliation" slug="api/reconcile" proficiencyLevel="Advanced" datePublished="2025-01-01T00:00:00Z" timeRequired={10} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Reconcile API" description="Bank reconciliation" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/reconcile</code>
          </div>
          <p className="text-lg text-muted-foreground">Match ledger transactions with <strong>bank statements</strong> for reconciliation.</p>
        </header>

        <section className="mb-12 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Landmark className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-emerald-900">Auto-Matching</h3>
              <p className="text-sm text-emerald-800">Soledgic automatically matches transactions by amount and date. Unmatched items are flagged for manual review.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">bank_transactions</td><td className="py-3 px-4">array</td><td className="py-3 px-4">Array of bank transactions <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">statement_date</td><td className="py-3 px-4">date</td><td className="py-3 px-4">Bank statement date <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">ending_balance</td><td className="py-3 px-4">integer</td><td className="py-3 px-4">Statement ending balance (cents)</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/reconcile \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "statement_date": "2025-01-31",
    "ending_balance": 15000000,
    "bank_transactions": [
      { "date": "2025-01-15", "amount": 9900, "description": "STRIPE TRANSFER" },
      { "date": "2025-01-20", "amount": -4999, "description": "VERCEL INC" }
    ]
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "success": true,
  "data": {
    "matched": 45,
    "unmatched_bank": 2,
    "unmatched_ledger": 1,
    "discrepancy": 0,
    "status": "reconciled",
    "unmatched_items": [
      { "source": "bank", "date": "2025-01-28", "amount": 500, "description": "UNKNOWN DEPOSIT" }
    ]
  }
}`}</code></pre>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/close-period" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Close Period</Link>
          <Link href="/docs/api/webhooks" className="flex items-center gap-2 text-primary hover:underline">Webhooks<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
