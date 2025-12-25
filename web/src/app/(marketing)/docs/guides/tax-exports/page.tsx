import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, FileText, Check, AlertTriangle } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, HowToSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Tax Exports Guide - 1099 & Schedule C Reports',
  description: 'Learn how to export 1099-ready reports and Schedule C expense summaries from Soledgic for tax filing.',
  keywords: ['tax exports', '1099 reports', 'Schedule C', 'tax filing', 'contractor payments'],
  alternates: { canonical: '/docs/guides/tax-exports' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guides', href: '/docs' },
  { name: 'Tax Exports', href: '/docs/guides/tax-exports' },
]

export default function TaxExportsGuidePage() {
  return (
    <>
      <TechArticleSchema headline="Tax Exports Guide" description="Export 1099-ready reports and Schedule C expense summaries for tax filing" slug="guides/tax-exports" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={15} articleSection="Guides" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema name="How to Export Tax Reports from Soledgic" description="Generate 1099 and Schedule C reports for tax filing" steps={[
        { name: 'Export 1099 Report', text: 'Generate a list of all contractors paid $600+ with their tax information' },
        { name: 'Export Schedule C Summary', text: 'Get expense totals by IRS category for your tax return' },
        { name: 'Download CSV/PDF', text: 'Export in your preferred format for your CPA' }
      ]} totalTime={10} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Tax Exports Guide</h1>
          <p className="text-lg text-muted-foreground">Export <strong>1099-ready reports</strong> and <strong>Schedule C summaries</strong> for tax filing.</p>
        </header>

        <section className="mb-12 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Tax Deadline Reminder</h3>
              <p className="text-sm text-amber-800">1099-NEC forms must be filed by <strong>January 31</strong>. Export your reports early to allow time for review.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">1099-NEC Export</h2>
          <p className="text-muted-foreground mb-4">Generate a list of all contractors paid $600 or more during the tax year:</p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/tax-documents?year=2024&type=1099" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
          <p className="text-sm text-muted-foreground">Returns: Name, TIN (last 4), address, total paid, W-9 status</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Schedule C Export</h2>
          <p className="text-muted-foreground mb-4">Get expense totals grouped by IRS Schedule C line items:</p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/generate-tax-summary?year=2024" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Export Formats</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">CSV Export</h3>
              <p className="text-sm text-muted-foreground">Best for importing into tax software or spreadsheets.</p>
              <code className="text-xs text-primary">?format=csv</code>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">PDF Export</h3>
              <p className="text-sm text-muted-foreground">Professional format for sharing with your CPA.</p>
              <code className="text-xs text-primary">?format=pdf</code>
            </div>
          </div>
        </section>

        <section className="mb-12 bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Checklist Before Tax Filing</h2>
          <ul className="space-y-3">
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>All W-9s collected for contractors paid $600+</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>Bank reconciliation complete for the year</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>All receipts uploaded and categorized</span></li>
            <li className="flex items-center gap-3"><Check className="w-5 h-5 text-emerald-600" /><span>Year-end period closed to prevent changes</span></li>
          </ul>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/guides/marketplace" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Marketplace Guide</Link>
          <Link href="/docs" className="flex items-center gap-2 text-primary hover:underline">All Documentation<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
