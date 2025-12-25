import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Landmark, Check } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, HowToSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Bank Reconciliation Guide - Match Transactions',
  description: 'Learn how to reconcile your Soledgic ledger with bank statements, match transactions, and resolve discrepancies.',
  keywords: ['bank reconciliation', 'match transactions', 'bank statement', 'discrepancies'],
  alternates: { canonical: '/docs/guides/reconciliation' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guides', href: '/docs' },
  { name: 'Bank Reconciliation', href: '/docs/guides/reconciliation' },
]

export default function ReconciliationGuidePage() {
  return (
    <>
      <TechArticleSchema headline="Bank Reconciliation Guide" description="Match ledger transactions with bank statements and resolve discrepancies" slug="guides/reconciliation" proficiencyLevel="Advanced" datePublished="2025-01-01T00:00:00Z" timeRequired={20} articleSection="Guides" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema name="How to Reconcile Bank Statements in Soledgic" description="Step-by-step bank reconciliation process" steps={[
        { name: 'Export Bank Statement', text: 'Download your bank statement in CSV format' },
        { name: 'Upload to Soledgic', text: 'Import bank transactions via API or dashboard' },
        { name: 'Auto-Match', text: 'Soledgic automatically matches transactions' },
        { name: 'Review Unmatched', text: 'Manually review and resolve discrepancies' }
      ]} totalTime={30} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-4"><Landmark className="w-8 h-8 text-primary" /></div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Bank Reconciliation Guide</h1>
          <p className="text-lg text-muted-foreground">Match your ledger with <strong>bank statements</strong> to ensure accuracy.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Why Reconcile?</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />Catch data entry errors</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />Identify missing transactions</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />Detect unauthorized charges</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />Maintain audit-ready books</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 1: Export Bank Statement</h2>
          <p className="text-muted-foreground mb-4">Download your statement in CSV format from your bank. Most banks support this in their online banking portal.</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 2: Import to Soledgic</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/reconcile \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "statement_date": "2025-01-31",
    "ending_balance": 15000000,
    "bank_transactions": [...]
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 3: Review Matches</h2>
          <p className="text-muted-foreground mb-4">Soledgic auto-matches by amount and date (±2 days). Review unmatched items and either:</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Create missing transactions</li>
            <li>• Manually match similar transactions</li>
            <li>• Mark as bank fee/interest</li>
          </ul>
        </section>

        <section className="mb-12 bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Best Practices</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 text-emerald-600 mt-0.5" /><span><strong>Reconcile monthly</strong> — Don't let it pile up</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 text-emerald-600 mt-0.5" /><span><strong>Close periods after</strong> — Lock reconciled months</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 text-emerald-600 mt-0.5" /><span><strong>Document discrepancies</strong> — Note why items didn't match</span></li>
          </ul>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/guides/marketplace" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Marketplace Guide</Link>
          <Link href="/docs/guides/period-closing" className="flex items-center gap-2 text-primary hover:underline">Period Closing<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
