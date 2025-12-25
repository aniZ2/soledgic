import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Repeat } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, HowToSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Revenue Splits Guide - Configure Payout Percentages',
  description: 'Learn how to configure revenue splits for marketplace platforms, including per-creator and per-product percentages.',
  keywords: ['revenue splits', 'payout percentages', 'creator economy', 'platform fees'],
  alternates: { canonical: '/docs/guides/revenue-splits' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guides', href: '/docs' },
  { name: 'Revenue Splits', href: '/docs/guides/revenue-splits' },
]

export default function RevenueSplitsGuidePage() {
  return (
    <>
      <TechArticleSchema headline="Revenue Splits Guide" description="Configure flexible revenue splits for marketplace platforms" slug="guides/revenue-splits" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={12} articleSection="Guides" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema name="How to Configure Revenue Splits" description="Set up platform fees and creator payouts" steps={[
        { name: 'Set Default Split', text: 'Configure ledger-wide default percentage' },
        { name: 'Per-Creator Overrides', text: 'Set custom splits for specific creators' },
        { name: 'Per-Transaction Override', text: 'Override at sale time if needed' }
      ]} totalTime={10} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-4"><Repeat className="w-8 h-8 text-primary" /></div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Revenue Splits Guide</h1>
          <p className="text-lg text-muted-foreground">Configure flexible <strong>revenue splits</strong> for your marketplace platform.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Split Hierarchy</h2>
          <p className="text-muted-foreground mb-4">Soledgic applies splits in this order of precedence:</p>
          <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
            <li><strong>Transaction-level</strong> — Override via platform_fee_percent in /record-sale</li>
            <li><strong>Creator-level</strong> — Default split set on creator account</li>
            <li><strong>Ledger-level</strong> — Global default for the ledger</li>
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Example: 80/20 Split</h2>
          <p className="text-muted-foreground mb-4">Creator gets 80%, platform keeps 20%:</p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "reference_id": "order_123",
    "creator_id": "creator_jane",
    "platform_fee_percent": 20
  }'`}</code></pre>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-medium text-foreground mb-2">Result for $100 sale:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Platform Revenue: $20.00</li>
              <li>• Creator Balance: $80.00</li>
            </ul>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Set Creator Default</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/manage-contractors \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "update",
    "external_id": "creator_jane",
    "default_split_percent": 85
  }'`}</code></pre>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Now Jane gets 85% on all sales unless overridden.</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Common Split Scenarios</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Scenario</th><th className="text-left py-3 px-4">Platform</th><th className="text-left py-3 px-4">Creator</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-3 px-4">Standard marketplace</td><td className="py-3 px-4">20%</td><td className="py-3 px-4">80%</td></tr>
                <tr><td className="py-3 px-4">Premium creators</td><td className="py-3 px-4">10%</td><td className="py-3 px-4">90%</td></tr>
                <tr><td className="py-3 px-4">New creator promo</td><td className="py-3 px-4">0%</td><td className="py-3 px-4">100%</td></tr>
                <tr><td className="py-3 px-4">High-volume seller</td><td className="py-3 px-4">15%</td><td className="py-3 px-4">85%</td></tr>
                <tr><td className="py-3 px-4">Enterprise partner</td><td className="py-3 px-4">5%</td><td className="py-3 px-4">95%</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Multi-Party Splits</h2>
          <p className="text-muted-foreground mb-4">For complex scenarios (e.g., affiliates), use metadata to track and process separately:</p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "amount": 10000,
  "creator_id": "creator_jane",
  "platform_fee_percent": 20,
  "metadata": {
    "affiliate_id": "affiliate_bob",
    "affiliate_percent": 5
  }
}`}</code></pre>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Process affiliate payouts separately based on metadata.</p>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/guides/contractor-payments" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Contractor Payments</Link>
          <Link href="/docs" className="flex items-center gap-2 text-primary hover:underline">All Documentation<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
