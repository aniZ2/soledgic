import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Lock, Check, AlertTriangle } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, HowToSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Period Closing Guide - Lock Accounting Periods',
  description: 'Learn how to properly close accounting periods in Soledgic to maintain data integrity and prevent backdating.',
  keywords: ['period closing', 'accounting period', 'lock period', 'month-end close'],
  alternates: { canonical: '/docs/guides/period-closing' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guides', href: '/docs' },
  { name: 'Period Closing', href: '/docs/guides/period-closing' },
]

export default function PeriodClosingGuidePage() {
  return (
    <>
      <TechArticleSchema headline="Period Closing Guide" description="Properly close accounting periods to maintain integrity" slug="guides/period-closing" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={15} articleSection="Guides" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema name="How to Close Accounting Periods" description="Month-end and year-end closing procedures" steps={[
        { name: 'Complete All Transactions', text: 'Ensure all transactions for the period are recorded' },
        { name: 'Reconcile Bank', text: 'Match ledger with bank statement' },
        { name: 'Review Reports', text: 'Generate and review P&L and trial balance' },
        { name: 'Close Period', text: 'Lock the period via API or dashboard' }
      ]} totalTime={60} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-4"><Lock className="w-8 h-8 text-primary" /></div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Period Closing Guide</h1>
          <p className="text-lg text-muted-foreground">Properly close <strong>accounting periods</strong> to maintain data integrity.</p>
        </header>

        <section className="mb-12 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Irreversible</h3>
              <p className="text-sm text-amber-800">Once closed, periods cannot be reopened. Complete all adjustments before closing.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Pre-Close Checklist</h2>
          <ul className="space-y-3">
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>All invoices sent and recorded</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>All expenses entered with receipts</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>Bank reconciliation complete</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>Creator payouts processed</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>Trial balance reviewed (debits = credits)</span></li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Close the Period</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/close-period \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "period": "2025-01",
    "notes": "January 2025 closed - reconciliation complete"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Year-End Close</h2>
          <p className="text-muted-foreground mb-4">For year-end, additional steps include:</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Export 1099 reports before closing</li>
            <li>• Generate annual P&L and balance sheet</li>
            <li>• Close all 12 months first, then close the year</li>
            <li>• Archive reports for 7+ years</li>
          </ul>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/guides/reconciliation" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Reconciliation</Link>
          <Link href="/docs/guides/tax-exports" className="flex items-center gap-2 text-primary hover:underline">Tax Exports<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
