import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Shield } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Reverse Transaction API - Correct Accounting Errors',
  description: 'API documentation for reversing transactions in Soledgic. Creates offsetting entries to maintain immutable audit trail.',
  keywords: ['reverse transaction', 'correction', 'audit trail', 'immutable ledger'],
  alternates: { canonical: '/docs/api/reverse-transaction' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Reverse Transaction', href: '/docs/api/reverse-transaction' },
]

export default function ReverseTransactionPage() {
  return (
    <>
      <TechArticleSchema headline="Reverse Transaction API" description="Correct accounting errors by creating reversing entries that maintain audit trail" slug="api/reverse-transaction" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={8} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Reverse Transaction API" description="Create reversing entries for corrections" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/reverse-transaction</code>
          </div>
          <p className="text-lg text-muted-foreground">Correct accounting errors by creating <strong>reversing entries</strong> that offset the original transaction.</p>
        </header>

        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">Immutable Ledger</h3>
              <p className="text-sm text-blue-800">Transactions are never deleted or modified. Reversals create new entries that offset the original, preserving a complete audit trail.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">transaction_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">ID of transaction to reverse <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">reason</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Reason for reversal <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">reference_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Unique identifier for reversal</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/reverse-transaction \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "transaction_id": "txn_abc123def456",
    "reason": "Entered wrong amount - should have been $50 not $500",
    "reference_id": "reversal_txn_abc123"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">How It Works</h2>
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">Original Transaction (Expense: $500)</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1">Expenses</td><td className="text-right text-emerald-600">$500</td><td className="text-right">-</td></tr>
                  <tr><td className="py-1">Cash</td><td className="text-right">-</td><td className="text-right text-blue-600">$500</td></tr>
                </tbody>
              </table>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">Reversing Entry (Created by API)</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1">Cash</td><td className="text-right text-emerald-600">$500</td><td className="text-right">-</td></tr>
                  <tr><td className="py-1">Expenses</td><td className="text-right">-</td><td className="text-right text-blue-600">$500</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">Net effect: Both transactions remain in the ledger, but the balances are zeroed out.</p>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/record-refund" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Record Refund</Link>
          <Link href="/docs/api/process-payout" className="flex items-center gap-2 text-primary hover:underline">Process Payout<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
