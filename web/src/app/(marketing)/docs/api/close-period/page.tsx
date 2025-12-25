import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Close Period API - Lock Accounting Periods',
  description: 'API documentation for closing accounting periods to prevent backdating in Soledgic.',
  keywords: ['close period', 'lock period', 'accounting period', 'prevent backdating'],
  alternates: { canonical: '/docs/api/close-period' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Close Period', href: '/docs/api/close-period' },
]

export default function ClosePeriodPage() {
  return (
    <>
      <TechArticleSchema headline="Close Period API" description="Lock accounting periods to prevent backdating and maintain integrity" slug="api/close-period" proficiencyLevel="Advanced" datePublished="2025-01-01T00:00:00Z" timeRequired={6} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Close Period API" description="Lock accounting periods" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/close-period</code>
          </div>
          <p className="text-lg text-muted-foreground"><strong>Close an accounting period</strong> to prevent new transactions from being backdated into it.</p>
        </header>

        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">Irreversible Action</h3>
              <p className="text-sm text-blue-800">Once a period is closed, it cannot be reopened. Ensure all transactions and adjustments are complete before closing.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">period</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Period to close: YYYY-MM or YYYY <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">notes</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Optional closing notes</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: Close Month</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/close-period \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "period": "2024-12",
    "notes": "December 2024 closed - all reconciliations complete"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: Close Year</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/close-period \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "period": "2024",
    "notes": "FY2024 closed after audit review"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Best Practices</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Complete bank reconciliation before closing</li>
            <li>• Review and approve all pending transactions</li>
            <li>• Generate and save period-end reports</li>
            <li>• Close months sequentially (don't skip months)</li>
          </ul>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/profit-loss" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Profit & Loss</Link>
          <Link href="/docs/api/reconcile" className="flex items-center gap-2 text-primary hover:underline">Reconcile<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
