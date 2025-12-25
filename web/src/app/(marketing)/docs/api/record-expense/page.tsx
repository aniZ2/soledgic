import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Record Expense API - Track Business Expenses',
  description: 'API documentation for recording business expenses in Soledgic. Supports expense categories, vendor tracking, receipt URLs, and automatic double-entry bookkeeping.',
  keywords: ['record expense', 'business expense', 'expense tracking', 'tax categories', 'double-entry'],
  alternates: { canonical: '/docs/api/record-expense' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Record Expense', href: '/docs/api/record-expense' },
]

const exampleRequest = `curl -X POST https://api.soledgic.com/v1/record-expense \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "exp_vercel_dec_2025",
    "amount": 2000,
    "description": "Vercel Pro - December 2025",
    "category": "software",
    "vendor_name": "Vercel Inc",
    "paid_from": "credit_card",
    "tax_deductible": true
  }'`

const exampleResponse = `{
  "success": true,
  "transaction_id": "txn_exp_abc123",
  "amount": 20.00,
  "category": "software",
  "paid_from": "credit_card"
}`

export default function RecordExpensePage() {
  return (
    <>
      <TechArticleSchema headline="Record Expense API" description="Track business expenses with category mapping and receipt attachments" slug="api/record-expense" proficiencyLevel="Intermediate" datePublished="2025-01-01T00:00:00Z" timeRequired={10} articleSection="API Reference" wordCount={1200} />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Record Expense API" description="Track business expenses with double-entry bookkeeping" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/record-expense</code>
          </div>
          <p className="text-lg text-muted-foreground">
            Record a <strong>business expense</strong> with category tracking, vendor information, and optional receipt attachment.
            Works in both Marketplace and Standard mode.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span>10 min read</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Intermediate</span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* When to use */}
        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="font-semibold text-blue-900 mb-2">When should you use this endpoint?</h2>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Recording software subscriptions (Vercel, AWS, Stripe)</li>
            <li>• Tracking advertising spend (Google Ads, Facebook)</li>
            <li>• Logging contractor payments (if not using /process-payout)</li>
            <li>• Any business expense you want in your P&L</li>
          </ul>
        </section>

        {/* Parameters */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Request Body</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Parameter</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">reference_id</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Unique identifier (max 255 chars) <span className="text-red-600">*</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">amount</td>
                  <td className="py-3 px-4 text-muted-foreground">integer</td>
                  <td className="py-3 px-4 text-muted-foreground">Amount in cents ($49.99 = 4999) <span className="text-red-600">*</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">description</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Expense description (max 500 chars) <span className="text-red-600">*</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">category</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Category code (see below)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">vendor_id</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Your internal vendor ID</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">vendor_name</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Human-readable vendor name (max 200 chars)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">paid_from</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground"><code>cash</code> or <code>credit_card</code>. Default: <code>cash</code></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">receipt_url</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">HTTPS URL to receipt image/PDF</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">tax_deductible</td>
                  <td className="py-3 px-4 text-muted-foreground">boolean</td>
                  <td className="py-3 px-4 text-muted-foreground">Default: <code>true</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Example */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example</h2>
          <CodeBlock code={exampleRequest} language="bash" />
        </section>

        {/* Response */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <CodeBlock code={exampleResponse} language="json" />
        </section>

        {/* Accounting Entries */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Accounting Entries Created</h2>
          <p className="text-muted-foreground mb-4">
            For a $20 expense paid by credit card:
          </p>
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground">Account</th>
                  <th className="text-left py-2 text-muted-foreground">Type</th>
                  <th className="text-right py-2 text-muted-foreground">Debit</th>
                  <th className="text-right py-2 text-muted-foreground">Credit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2">Software (Expense)</td>
                  <td className="py-2 text-muted-foreground">Expense</td>
                  <td className="text-right py-2 text-emerald-600">$20.00</td>
                  <td className="text-right py-2">—</td>
                </tr>
                <tr>
                  <td className="py-2">Credit Card (Liability)</td>
                  <td className="py-2 text-muted-foreground">Liability</td>
                  <td className="text-right py-2">—</td>
                  <td className="text-right py-2 text-blue-600">$20.00</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            If <code>paid_from: "cash"</code>, it credits the Cash account instead (asset decreases).
          </p>
        </section>

        {/* Categories */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Expense Categories</h2>
          <p className="text-muted-foreground mb-4">
            Use these category codes for proper expense grouping. They'll appear in your P&L report:
          </p>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Code</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Name</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Examples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-2 px-4 font-mono text-primary">software</td><td className="py-2 px-4">Software & SaaS</td><td className="py-2 px-4 text-muted-foreground">Vercel, AWS, Stripe, Figma</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">advertising</td><td className="py-2 px-4">Advertising</td><td className="py-2 px-4 text-muted-foreground">Google Ads, Facebook Ads</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">professional_services</td><td className="py-2 px-4">Professional Services</td><td className="py-2 px-4 text-muted-foreground">Legal, accounting, consulting</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">office</td><td className="py-2 px-4">Office Expenses</td><td className="py-2 px-4 text-muted-foreground">Supplies, equipment under $2,500</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">travel</td><td className="py-2 px-4">Travel</td><td className="py-2 px-4 text-muted-foreground">Flights, hotels, conferences</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">meals</td><td className="py-2 px-4">Meals & Entertainment</td><td className="py-2 px-4 text-muted-foreground">Business meals (50% deductible)</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">insurance</td><td className="py-2 px-4">Insurance</td><td className="py-2 px-4 text-muted-foreground">Business insurance, E&O</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">rent</td><td className="py-2 px-4">Rent / Lease</td><td className="py-2 px-4 text-muted-foreground">Office rent, coworking</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">utilities</td><td className="py-2 px-4">Utilities</td><td className="py-2 px-4 text-muted-foreground">Internet, phone</td></tr>
                <tr><td className="py-2 px-4 font-mono text-primary">contract_labor</td><td className="py-2 px-4">Contract Labor</td><td className="py-2 px-4 text-muted-foreground">Freelancers, contractors</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            If no category is provided, expenses default to "Operating Expenses".
          </p>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg">
          <h2 className="font-semibold text-foreground mb-3">Related Documentation</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/api/profit-loss" className="text-primary hover:underline">GET /profit-loss — View expense totals →</Link>
            <Link href="/docs/guides/tax-exports" className="text-primary hover:underline">Export expenses for tax filing →</Link>
            <Link href="/docs/api/record-sale" className="text-primary hover:underline">POST /record-sale — Record income →</Link>
            <Link href="/docs/guides/reconciliation" className="text-primary hover:underline">Bank reconciliation guide →</Link>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/record-sale" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Record Sale</Link>
          <Link href="/docs/api/record-income" className="flex items-center gap-2 text-primary hover:underline">Record Income<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
