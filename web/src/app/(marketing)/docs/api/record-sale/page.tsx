import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
  SoftwareSourceCodeSchema,
} from '@/components/seo'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Record Sale API - Create Sale Transactions with Revenue Splits',
  description: 'API documentation for recording sales in Soledgic. Supports automatic revenue splits, creator payouts, processing fee handling, and atomic double-entry bookkeeping.',
  keywords: ['record sale API', 'sales transaction', 'revenue split', 'creator payout', 'marketplace API', 'atomic transaction'],
  alternates: { canonical: '/docs/api/record-sale' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Record Sale', href: '/docs/api/record-sale' },
]

const basicExample = `curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: stripe_pi_3abc123def456" \\
  -d '{
    "reference_id": "stripe_pi_3abc123def456",
    "creator_id": "author_jane_doe",
    "amount": 2999,
    "product_name": "Advanced TypeScript Course"
  }'`

const responseExample = `{
  "success": true,
  "transaction_id": "txn_9f8e7d6c5b4a3210",
  "breakdown": {
    "gross_amount": 29.99,
    "processing_fee": 0,
    "net_amount": 29.99,
    "creator_amount": 23.99,
    "platform_amount": 6.00,
    "creator_percent": 80,
    "platform_percent": 20,
    "withheld_amount": 0,
    "available_amount": 23.99,
    "withholdings": []
  },
  "creator_balance": 523.47
}`

const feeExample = `curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "stripe_pi_3abc123def456",
    "creator_id": "author_jane_doe",
    "amount": 2999,
    "processing_fee": 117,
    "processing_fee_paid_by": "creator"
  }'`

export default function RecordSalePage() {
  return (
    <>
      <TechArticleSchema
        headline="Record Sale API Endpoint"
        description="Complete documentation for the /record-sale endpoint including parameters, revenue splits, processing fees, and atomic transaction guarantees."
        slug="api/record-sale"
        proficiencyLevel="Intermediate"
        dependencies="API key, HTTP client"
        datePublished="2025-01-01T00:00:00Z"
        timeRequired={15}
        keywords={['record-sale', 'API', 'transactions', 'revenue split', 'atomic']}
        articleSection="API Reference"
        wordCount={1800}
      />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema
        name="Record Sale API"
        description="Create sale transactions with automatic revenue splits"
        programmingLanguage="JavaScript"
        runtimePlatform="Node.js"
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/record-sale</code>
          </div>
          <p className="text-lg text-muted-foreground">
            Record a <strong>sale transaction</strong> with automatic revenue splitting. 
            This is the primary endpoint for Marketplace mode ledgers.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span>15 min read</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Intermediate</span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* When to use */}
        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg" aria-labelledby="when-to-use">
          <h2 id="when-to-use" className="font-semibold text-blue-900 mb-2">When should you use this endpoint?</h2>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• A customer purchases a product from a creator on your marketplace</li>
            <li>• You need to automatically split revenue between platform and creator</li>
            <li>• You want to track creator balances for eventual payout</li>
            <li>• You're processing Stripe/PayPal payments and need to record the accounting</li>
          </ul>
          <p className="text-sm text-blue-700 mt-2">
            <strong>Not for you?</strong> Use <Link href="/docs/api/record-income" className="underline">/record-income</Link> for 
            Standard mode ledgers without revenue splits.
          </p>
        </section>

        {/* Request Headers */}
        <section className="mb-12" aria-labelledby="headers">
          <h2 id="headers" className="text-xl font-semibold text-foreground mb-4">Headers</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Header</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Value</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">x-api-key</td>
                  <td className="py-3 px-4 text-muted-foreground">Your ledger's API key</td>
                  <td className="py-3 px-4"><span className="text-red-600 text-xs font-medium">Required</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">Content-Type</td>
                  <td className="py-3 px-4 text-muted-foreground">application/json</td>
                  <td className="py-3 px-4"><span className="text-red-600 text-xs font-medium">Required</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">Idempotency-Key</td>
                  <td className="py-3 px-4 text-muted-foreground">Unique key for retry safety (use <code>reference_id</code> value)</td>
                  <td className="py-3 px-4"><span className="text-amber-600 text-xs font-medium">Recommended</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Request Body */}
        <section className="mb-12" aria-labelledby="body">
          <h2 id="body" className="text-xl font-semibold text-foreground mb-4">Request Body</h2>
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
                  <td className="py-3 px-4 text-muted-foreground">
                    Unique identifier (max 255 chars). Use your payment processor's ID (e.g., <code>stripe_pi_xxx</code>). 
                    <span className="text-red-600 ml-1">*</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">creator_id</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Your internal creator/author ID (max 100 chars). 
                    <span className="text-red-600 ml-1">*</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">amount</td>
                  <td className="py-3 px-4 text-muted-foreground">integer</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Gross sale amount <strong>in cents</strong>. $29.99 = 2999. 
                    <span className="text-red-600 ml-1">*</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">processing_fee</td>
                  <td className="py-3 px-4 text-muted-foreground">integer</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Stripe/PayPal fee in cents. Used in split calculation if paid by creator.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">processing_fee_paid_by</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    <code>platform</code>, <code>creator</code>, or <code>split</code>. Default: <code>platform</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">creator_percent</td>
                  <td className="py-3 px-4 text-muted-foreground">number</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Override split (0-100). If not provided, uses creator/tier/ledger default.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">product_id</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Your product/item ID for tracking.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">product_name</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Human-readable product name (max 500 chars).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">skip_withholding</td>
                  <td className="py-3 px-4 text-muted-foreground">boolean</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Skip tax/refund withholding rules for this sale.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">metadata</td>
                  <td className="py-3 px-4 text-muted-foreground">object</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Custom key-value pairs. Not used in calculations.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Basic Example */}
        <section className="mb-12" aria-labelledby="example-basic">
          <h2 id="example-basic" className="text-xl font-semibold text-foreground mb-4">Basic Example</h2>
          <CodeBlock code={basicExample} language="bash" />
        </section>

        {/* Response */}
        <section className="mb-12" aria-labelledby="response">
          <h2 id="response" className="text-xl font-semibold text-foreground mb-4">Response</h2>
          <CodeBlock code={responseExample} language="json" />
          
          <h3 className="font-semibold text-foreground mb-2 mt-4">Response Fields</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li><code className="text-primary">transaction_id</code> — Unique Soledgic transaction ID</li>
            <li><code className="text-primary">breakdown</code> — Complete split calculation (all in dollars)</li>
            <li><code className="text-primary">creator_balance</code> — Creator's new available balance after this sale</li>
          </ul>
        </section>

        {/* With Processing Fee */}
        <section className="mb-12" aria-labelledby="example-fees">
          <h2 id="example-fees" className="text-xl font-semibold text-foreground mb-4">Example: Handling Stripe Fees</h2>
          <p className="text-muted-foreground mb-4">
            If you want to deduct Stripe's fee from the creator's share:
          </p>
          <CodeBlock code={feeExample} language="bash" />
          <p className="text-sm text-muted-foreground mt-4">
            With <code>processing_fee_paid_by: "creator"</code>, the $1.17 Stripe fee is deducted from the creator's $23.99, 
            leaving them with $22.82.
          </p>
        </section>

        {/* Double-Entry Breakdown */}
        <section className="mb-12" aria-labelledby="accounting">
          <h2 id="accounting" className="text-xl font-semibold text-foreground mb-4">Accounting Entries Created</h2>
          <p className="text-muted-foreground mb-4">
            For a $29.99 sale with 80/20 split, Soledgic creates these journal entries atomically:
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
                  <td className="py-2">Cash</td>
                  <td className="py-2 text-muted-foreground">Asset</td>
                  <td className="text-right py-2 text-emerald-600">$29.99</td>
                  <td className="text-right py-2">—</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2">Platform Revenue</td>
                  <td className="py-2 text-muted-foreground">Revenue</td>
                  <td className="text-right py-2">—</td>
                  <td className="text-right py-2 text-blue-600">$6.00</td>
                </tr>
                <tr>
                  <td className="py-2">Creator Balance: author_jane_doe</td>
                  <td className="py-2 text-muted-foreground">Liability</td>
                  <td className="text-right py-2">—</td>
                  <td className="text-right py-2 text-blue-600">$23.99</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            The creator balance is a <strong>liability</strong>—money you owe them. When you call <code>/process-payout</code>, 
            it debits this account (reducing what you owe) and credits Cash (money leaves your bank).
          </p>
        </section>

        {/* Idempotency */}
        <section className="mb-12 p-4 bg-amber-50 border border-amber-200 rounded-lg" aria-labelledby="idempotency">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 id="idempotency" className="font-semibold text-amber-900">Idempotency via reference_id</h3>
              <p className="text-sm text-amber-800 mt-1">
                If you call <code>/record-sale</code> with the same <code>reference_id</code> twice, 
                the second call returns <code>409 Conflict</code> with the existing <code>transaction_id</code>. 
                This prevents double-charging if your webhook fires twice.
              </p>
              <div className="mt-2 bg-amber-100 rounded p-2">
                <code className="text-xs text-amber-900">{`{ "success": false, "error": "Duplicate reference_id", "transaction_id": "txn_existing", "idempotent": true }`}</code>
              </div>
            </div>
          </div>
        </section>

        {/* Error Codes */}
        <section className="mb-12" aria-labelledby="errors">
          <h2 id="errors" className="text-xl font-semibold text-foreground mb-4">Error Responses</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Error</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">Invalid reference_id</td>
                  <td className="py-3 px-4 text-muted-foreground">Must be 1-255 alphanumeric characters</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">Invalid amount</td>
                  <td className="py-3 px-4 text-muted-foreground">Must be positive integer (cents)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">Invalid creator_percent</td>
                  <td className="py-3 px-4 text-muted-foreground">Must be 0-100</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">401</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">Ledger not found</td>
                  <td className="py-3 px-4 text-muted-foreground">Invalid or missing API key</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">409</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">Duplicate reference_id</td>
                  <td className="py-3 px-4 text-muted-foreground">Already processed (idempotent)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">500</code></td>
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">Failed to record sale</td>
                  <td className="py-3 px-4 text-muted-foreground">Database error — contact support</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg" aria-labelledby="related">
          <h2 id="related" className="font-semibold text-foreground mb-3">Related Documentation</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/api/process-payout" className="text-primary hover:underline">POST /process-payout — Pay creators →</Link>
            <Link href="/docs/api/get-balance" className="text-primary hover:underline">GET /get-balance — Check balances →</Link>
            <Link href="/docs/guides/marketplace" className="text-primary hover:underline">Marketplace integration guide →</Link>
            <Link href="/docs/guides/revenue-splits" className="text-primary hover:underline">Configuring revenue splits →</Link>
          </div>
        </section>

        {/* Navigation */}
        <nav className="mt-12 flex justify-between" aria-label="Documentation navigation">
          <Link href="/docs/api" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            API Reference
          </Link>
          <Link href="/docs/api/record-expense" className="flex items-center gap-2 text-primary hover:underline">
            Record Expense
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </main>
    </>
  )
}
