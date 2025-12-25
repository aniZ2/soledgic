import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Record Refund API - Process Customer Refunds',
  description: 'API documentation for processing refunds in Soledgic with automatic reversal of original transactions and creator balance adjustments.',
  keywords: ['record refund', 'process refund', 'customer refund', 'reversal'],
  alternates: { canonical: '/docs/api/record-refund' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Record Refund', href: '/docs/api/record-refund' },
]

export default function RecordRefundPage() {
  return (
    <>
      <TechArticleSchema headline="Record Refund API" description="Process customer refunds with automatic reversal of original transactions" slug="api/record-refund" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={8} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Record Refund API" description="Process customer refunds" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/record-refund</code>
          </div>
          <p className="text-lg text-muted-foreground">Process a <strong>customer refund</strong> with automatic reversal of the original sale transaction.</p>
        </header>

        <section className="mb-12 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Marketplace Mode</h3>
              <p className="text-sm text-amber-800">For marketplace ledgers, refunds automatically deduct from the creator's balance if the original sale had a revenue split.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">original_reference_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Reference ID of original sale <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">amount</td><td className="py-3 px-4">integer</td><td className="py-3 px-4">Refund amount (partial or full)</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">reference_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Unique refund identifier <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">reason</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Refund reason</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: Full Refund</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/record-refund \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "original_reference_id": "order_12345",
    "reference_id": "refund_order_12345",
    "reason": "Customer requested cancellation"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: Partial Refund</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/record-refund \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "original_reference_id": "order_12345",
    "amount": 5000,
    "reference_id": "refund_partial_12345",
    "reason": "50% refund for service issue"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Accounting Entries (Marketplace)</h2>
          <p className="text-sm text-muted-foreground mb-4">For a $100 sale with 20% platform fee, full refund creates:</p>
          <div className="bg-card border border-border rounded-lg p-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="text-left py-2">Account</th><th className="text-right py-2">Debit</th><th className="text-right py-2">Credit</th></tr></thead>
              <tbody>
                <tr><td className="py-2">Platform Revenue</td><td className="text-right py-2 text-emerald-600">$20.00</td><td className="text-right py-2">-</td></tr>
                <tr><td className="py-2">Creator Balance</td><td className="text-right py-2 text-emerald-600">$80.00</td><td className="text-right py-2">-</td></tr>
                <tr><td className="py-2">Cash</td><td className="text-right py-2">-</td><td className="text-right py-2 text-blue-600">$100.00</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/record-income" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Record Income</Link>
          <Link href="/docs/api/reverse-transaction" className="flex items-center gap-2 text-primary hover:underline">Reverse Transaction<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
