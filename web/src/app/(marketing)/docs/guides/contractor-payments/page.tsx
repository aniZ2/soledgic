import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Users, Check, AlertTriangle } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, HowToSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Contractor Payments Guide - 1099 Compliance',
  description: 'Learn how to track contractor payments, manage W-9 collection, and stay compliant with 1099 reporting requirements.',
  keywords: ['contractor payments', '1099 compliance', 'W-9', 'independent contractor'],
  alternates: { canonical: '/docs/guides/contractor-payments' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guides', href: '/docs' },
  { name: 'Contractor Payments', href: '/docs/guides/contractor-payments' },
]

export default function ContractorPaymentsGuidePage() {
  return (
    <>
      <TechArticleSchema headline="Contractor Payments Guide" description="Track payments and maintain 1099 compliance" slug="guides/contractor-payments" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={15} articleSection="Guides" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema name="How to Manage Contractor Payments" description="1099 compliance for contractor payments" steps={[
        { name: 'Collect W-9', text: 'Obtain W-9 form before first payment' },
        { name: 'Record Payments', text: 'Use record-expense with contractor ID' },
        { name: 'Monitor Thresholds', text: 'Soledgic alerts at $600 threshold' },
        { name: 'File 1099s', text: 'Export 1099-NEC data by January 31' }
      ]} totalTime={20} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-4"><Users className="w-8 h-8 text-primary" /></div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Contractor Payments Guide</h1>
          <p className="text-lg text-muted-foreground">Track payments and maintain <strong>1099 compliance</strong> for independent contractors.</p>
        </header>

        <section className="mb-12 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">$600 Threshold</h3>
              <p className="text-sm text-red-800">You must file 1099-NEC for any contractor paid $600+ in a calendar year. Soledgic tracks this automatically.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 1: Collect W-9</h2>
          <p className="text-muted-foreground mb-4">Before making the first payment, collect a W-9 form with:</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Legal name or business name</li>
            <li>• Tax Identification Number (SSN or EIN)</li>
            <li>• Address</li>
            <li>• Certification signature</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 2: Record Payments</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/process-payout \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creator_id": "contractor_john_doe",
    "amount": 150000,
    "reference_id": "payout_jan_john",
    "description": "January consulting services"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 3: Monitor Thresholds</h2>
          <p className="text-muted-foreground mb-4">Soledgic automatically:</p>
          <ul className="space-y-2">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span className="text-muted-foreground">Tracks YTD payments per contractor</span></li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span className="text-muted-foreground">Sends webhook at $600 threshold</span></li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span className="text-muted-foreground">Flags contractors missing W-9</span></li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Step 4: File 1099s</h2>
          <p className="text-muted-foreground mb-4">By January 31, export your 1099 data:</p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl "https://api.soledgic.com/v1/tax-documents?year=2024&type=1099" \\
  -H "x-api-key: sk_live_your_key"`}</code></pre>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/guides/period-closing" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Period Closing</Link>
          <Link href="/docs/guides/revenue-splits" className="flex items-center gap-2 text-primary hover:underline">Revenue Splits<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
