import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Record Income API - Track Other Income',
  description: 'API documentation for recording non-sale income like interest, refunds received, and miscellaneous income in Soledgic.',
  keywords: ['record income', 'other income', 'interest income', 'miscellaneous income'],
  alternates: { canonical: '/docs/api/record-income' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Record Income', href: '/docs/api/record-income' },
]

export default function RecordIncomePage() {
  return (
    <>
      <TechArticleSchema headline="Record Income API" description="Record non-sale income like interest and miscellaneous income" slug="api/record-income" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={6} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Record Income API" description="Track other income sources" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/record-income</code>
          </div>
          <p className="text-lg text-muted-foreground">Record <strong>non-sale income</strong> such as interest, refunds received, or miscellaneous income.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Parameters</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Parameter</th><th className="text-left py-3 px-4">Type</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4 font-mono text-primary">amount</td><td className="py-3 px-4">integer</td><td className="py-3 px-4">Amount in cents <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">reference_id</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Unique identifier <span className="text-red-600">*</span></td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">income_type</td><td className="py-3 px-4">string</td><td className="py-3 px-4">interest, refund_received, other</td></tr>
                <tr><td className="py-3 px-4 font-mono text-primary">description</td><td className="py-3 px-4">string</td><td className="py-3 px-4">Income description</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/record-income \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1500,
    "reference_id": "interest_jan_2025",
    "income_type": "interest",
    "description": "Bank account interest - January"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Accounting Entries</h2>
          <div className="bg-card border border-border rounded-lg p-4">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="text-left py-2">Account</th><th className="text-right py-2">Debit</th><th className="text-right py-2">Credit</th></tr></thead>
              <tbody>
                <tr><td className="py-2">Cash</td><td className="text-right py-2 text-emerald-600">$15.00</td><td className="text-right py-2">-</td></tr>
                <tr><td className="py-2">Other Income</td><td className="text-right py-2">-</td><td className="text-right py-2 text-blue-600">$15.00</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/record-expense" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Record Expense</Link>
          <Link href="/docs/api/record-refund" className="flex items-center gap-2 text-primary hover:underline">Record Refund<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
