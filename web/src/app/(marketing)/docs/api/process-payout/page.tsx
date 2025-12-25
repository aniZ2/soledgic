import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, AlertTriangle, DollarSign } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Process Payout API - Pay Creators & Contractors',
  description: 'API documentation for processing payouts to creators and contractors in Soledgic. Validates available balance, handles payout fees, and maintains audit trail.',
  keywords: ['process payout', 'creator payout', 'contractor payment', '1099 tracking', 'available balance'],
  alternates: { canonical: '/docs/api/process-payout' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Process Payout', href: '/docs/api/process-payout' },
]

const exampleRequest = `curl -X POST https://api.soledgic.com/v1/process-payout \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: payout_2025_w52_jane" \\
  -d '{
    "creator_id": "author_jane_doe",
    "amount": 50000,
    "reference_id": "payout_2025_w52_jane",
    "payout_method": "ach",
    "description": "Week 52 earnings payout"
  }'`

const successResponse = `{
  "success": true,
  "transaction_id": "txn_payout_xyz789",
  "breakdown": {
    "gross_payout": 500.00,
    "fees": 0,
    "net_to_creator": 500.00
  },
  "previous_balance": 2420.32,
  "new_balance": 1920.32
}`

const insufficientResponse = `{
  "success": false,
  "error": "Insufficient balance. Available: $420.32, Requested: $500.00",
  "code": "INSUFFICIENT_BALANCE",
  "details": {
    "ledger_balance": 920.32,
    "held_amount": 500.00,
    "available": 420.32
  }
}`

const feesExample = `{
  "creator_id": "author_jane_doe",
  "amount": 50000,
  "fees": 200,
  "fees_paid_by": "creator",
  "reference_id": "payout_with_fee"
}`

export default function ProcessPayoutPage() {
  return (
    <>
      <TechArticleSchema headline="Process Payout API" description="Pay out creator and contractor earnings with balance validation and 1099 tracking" slug="api/process-payout" proficiencyLevel="Advanced" datePublished="2025-01-01T00:00:00Z" timeRequired={15} articleSection="API Reference" wordCount={1800} />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Process Payout API" description="Process creator and contractor payouts" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono font-semibold">POST</span>
            <code className="text-2xl font-mono text-foreground">/process-payout</code>
          </div>
          <p className="text-lg text-muted-foreground">
            Process a <strong>payout</strong> to a creator or contractor. Validates available balance (excluding held funds), 
            creates double-entry journal entries, and fires webhooks.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span>15 min read</span>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">Advanced</span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* When to use */}
        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="font-semibold text-blue-900 mb-2">When should you use this endpoint?</h2>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Paying out a creator's earnings (weekly, monthly, or on-demand)</li>
            <li>• Paying a contractor for completed work</li>
            <li>• Running automated payout batches</li>
          </ul>
        </section>

        {/* Important Warning */}
        <section className="mb-12 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900">Balance Validation</h3>
              <p className="text-sm text-amber-800 mt-1">
                This endpoint validates against <strong>available balance</strong>, not ledger balance. 
                Available = Ledger Balance - Held Funds. If a creator has $500 in refund reserves, 
                they can't withdraw that portion until the hold expires.
              </p>
            </div>
          </div>
        </section>

        {/* Headers */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Headers</h2>
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
                  <td className="py-3 px-4 text-muted-foreground">Unique key for retry safety (use <code>reference_id</code>)</td>
                  <td className="py-3 px-4"><span className="text-muted-foreground text-xs">Recommended</span></td>
                </tr>
              </tbody>
            </table>
          </div>
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
                  <td className="py-3 px-4 font-mono text-primary">creator_id</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Creator/contractor ID (max 100 chars) <span className="text-red-600">*</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">amount</td>
                  <td className="py-3 px-4 text-muted-foreground">integer</td>
                  <td className="py-3 px-4 text-muted-foreground">Payout amount in cents <span className="text-red-600">*</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">reference_id</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Unique identifier for idempotency (max 255 chars) <span className="text-red-600">*</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">payout_method</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground"><code>ach</code>, <code>check</code>, <code>wire</code>, <code>paypal</code></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">fees</td>
                  <td className="py-3 px-4 text-muted-foreground">integer</td>
                  <td className="py-3 px-4 text-muted-foreground">Payout processing fees in cents</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">fees_paid_by</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground"><code>platform</code> or <code>creator</code>. Default: <code>platform</code></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-primary">description</td>
                  <td className="py-3 px-4 text-muted-foreground">string</td>
                  <td className="py-3 px-4 text-muted-foreground">Payout description (max 500 chars)</td>
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

        {/* Success Response */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Success Response</h2>
          <CodeBlock code={successResponse} language="json" />
          <ul className="text-sm text-muted-foreground space-y-1 mt-4">
            <li><code className="text-primary">gross_payout</code> — Amount before any fee deductions</li>
            <li><code className="text-primary">fees</code> — Payout processing fees (if any)</li>
            <li><code className="text-primary">net_to_creator</code> — What the creator actually receives</li>
            <li><code className="text-primary">previous_balance</code> / <code className="text-primary">new_balance</code> — Available balance before/after</li>
          </ul>
        </section>

        {/* Insufficient Balance */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Insufficient Balance Response</h2>
          <p className="text-muted-foreground mb-4">
            If the creator doesn't have enough available balance:
          </p>
          <CodeBlock code={insufficientResponse} language="json" />
          <p className="text-sm text-muted-foreground mt-4">
            The <code>held_amount</code> shows funds locked for refund reserves or tax withholding.
          </p>
        </section>

        {/* Accounting Entries */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Accounting Entries Created</h2>
          <p className="text-muted-foreground mb-4">
            For a $500 payout (platform pays fees):
          </p>
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground">Account</th>
                  <th className="text-right py-2 text-muted-foreground">Debit</th>
                  <th className="text-right py-2 text-muted-foreground">Credit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2">Creator Balance: author_jane_doe</td>
                  <td className="text-right py-2 text-emerald-600">$500.00</td>
                  <td className="text-right py-2">—</td>
                </tr>
                <tr>
                  <td className="py-2">Cash</td>
                  <td className="text-right py-2">—</td>
                  <td className="text-right py-2 text-blue-600">$500.00</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            Debiting Creator Balance reduces the liability (what you owe them). Crediting Cash shows money left your account.
          </p>
        </section>

        {/* With Fees */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Example: Fees Paid by Creator</h2>
          <p className="text-muted-foreground mb-4">
            If you charge a $2 ACH fee and the creator pays it:
          </p>
          <CodeBlock code={feesExample} language="json" />
          <p className="text-sm text-muted-foreground mt-4">
            Response: <code>gross_payout: 500.00, fees: 2.00, net_to_creator: 498.00</code>
          </p>
        </section>

        {/* Error Codes */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Error Codes</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Code</th>
                  <th className="text-left py-3 px-4 text-muted-foreground">Cause & Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 font-mono text-xs">INSUFFICIENT_BALANCE</td>
                  <td className="py-3 px-4 text-muted-foreground">Available balance &lt; requested amount. Check <code>details.available</code> in response.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 font-mono text-xs">HELD_FUNDS_RESTRICTION</td>
                  <td className="py-3 px-4 text-muted-foreground">Funds are held for refund reserve or tax withholding. Wait for hold to expire or release manually.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">400</code></td>
                  <td className="py-3 px-4 font-mono text-xs">INVALID_AMOUNT</td>
                  <td className="py-3 px-4 text-muted-foreground">Amount must be positive integer (cents). Check for decimals or negative values.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">404</code></td>
                  <td className="py-3 px-4 font-mono text-xs">CREATOR_NOT_FOUND</td>
                  <td className="py-3 px-4 text-muted-foreground">No creator account with this ID. Creator accounts are auto-created on first sale.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">409</code></td>
                  <td className="py-3 px-4 font-mono text-xs">DUPLICATE_REFERENCE</td>
                  <td className="py-3 px-4 text-muted-foreground">This <code>reference_id</code> was already processed. Idempotent—returns existing transaction.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-amber-600">423</code></td>
                  <td className="py-3 px-4 font-mono text-xs">PERIOD_CLOSED</td>
                  <td className="py-3 px-4 text-muted-foreground">Accounting period is closed. Use a date in the current open period.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">500</code></td>
                  <td className="py-3 px-4 font-mono text-xs">TRANSACTION_FAILED</td>
                  <td className="py-3 px-4 text-muted-foreground">Database error. Safe to retry—transaction was not committed.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Webhooks */}
        <section className="mb-12 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-emerald-900">Webhook: payout.created</h3>
              <p className="text-sm text-emerald-800 mt-1">
                After a successful payout, Soledgic fires a <code>payout.created</code> webhook with the transaction details, 
                creator balances, and timestamp. Use this to trigger your actual payment (Stripe Connect, ACH batch, etc.).
              </p>
            </div>
          </div>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg">
          <h2 className="font-semibold text-foreground mb-3">Related Documentation</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/api/get-balance" className="text-primary hover:underline">GET /get-balance — Check creator balances →</Link>
            <Link href="/docs/api/webhooks" className="text-primary hover:underline">Webhooks — payout.created event →</Link>
            <Link href="/docs/guides/marketplace" className="text-primary hover:underline">Marketplace integration guide →</Link>
            <Link href="/docs/guides/contractor-payments" className="text-primary hover:underline">Contractor payments & 1099 →</Link>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/record-refund" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Record Refund</Link>
          <Link href="/docs/api/get-balance" className="flex items-center gap-2 text-primary hover:underline">Get Balance<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
