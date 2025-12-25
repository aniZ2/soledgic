import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Check, Clock, Zap } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
  HowToSchema,
} from '@/components/seo'

// ============================================================================
// SEO METADATA
// ============================================================================

export const metadata: Metadata = {
  title: 'Quickstart Guide - Get Started in 5 Minutes',
  description: 'Learn how to integrate Soledgic double-entry accounting into your application. Create a ledger, record sales with automatic revenue splits, track expenses, and generate financial reports.',
  keywords: [
    'accounting API quickstart',
    'bookkeeping API tutorial',
    'double-entry accounting integration',
    'Soledgic getting started',
    'financial API tutorial',
    'revenue split API',
    'creator payout API',
  ],
  alternates: {
    canonical: '/docs/quickstart',
  },
  openGraph: {
    title: 'Soledgic Quickstart Guide',
    description: 'Get up and running with Soledgic accounting API in 5 minutes.',
    url: '/docs/quickstart',
    type: 'article',
  },
}

// ============================================================================
// SCHEMA DATA
// ============================================================================

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Quickstart', href: '/docs/quickstart' },
]

const howToSteps = [
  {
    name: 'Create a Ledger',
    text: 'Sign up and create your first ledger. Choose Marketplace mode for platforms with revenue splits, or Standard mode for traditional business accounting.',
  },
  {
    name: 'Record a Sale',
    text: 'Use POST /record-sale with reference_id, creator_id, and amount (in cents). The API automatically calculates the split and updates creator balances atomically.',
  },
  {
    name: 'Record Expenses',
    text: 'Track expenses with POST /record-expense. Include category, vendor_name, and description for proper categorization and tax reporting.',
  },
  {
    name: 'Process Payouts',
    text: 'Pay creators with POST /process-payout. The API validates available balance, deducts held funds, and maintains complete audit trail.',
  },
  {
    name: 'Generate Reports',
    text: 'Use GET /profit-loss and GET /trial-balance for CPA-ready financial statements. Export as JSON or CSV.',
  },
]

export default function QuickstartPage() {
  return (
    <>
      {/* Structured Data */}
      <TechArticleSchema
        headline="Soledgic Quickstart Guide"
        description="Learn how to integrate Soledgic double-entry accounting into your application in 5 minutes."
        slug="quickstart"
        proficiencyLevel="Beginner"
        dependencies="Soledgic API key, HTTP client (curl, fetch, axios)"
        datePublished="2025-01-01T00:00:00Z"
        timeRequired={5}
        keywords={['quickstart', 'tutorial', 'getting started', 'API integration', 'revenue splits']}
        articleSection="Getting Started"
        wordCount={1200}
      />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema
        name="How to Integrate Soledgic Accounting API"
        description="Step-by-step guide to set up double-entry accounting with automatic revenue splits"
        steps={howToSteps}
        totalTime={5}
        estimatedCost={{ currency: 'USD', value: '0' }}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Quickstart Guide</h1>
          <p className="text-lg text-muted-foreground">
            Get up and running with <strong>Soledgic</strong> in 5 minutes. This guide covers both 
            Marketplace mode (for platforms like Gumroad or Teachable) and Standard mode (for traditional businesses).
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              5 min read
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
              Beginner
            </span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* When to use this guide */}
        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg" aria-labelledby="when-to-use">
          <h2 id="when-to-use" className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            When should you use Soledgic?
          </h2>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• You're building a <strong>marketplace</strong> and need to split revenue with creators (80/20, tiered, etc.)</li>
            <li>• You need <strong>double-entry bookkeeping</strong> without the complexity of traditional accounting software</li>
            <li>• You want <strong>automatic 1099 tracking</strong> for contractor payments over $600</li>
            <li>• You need <strong>CPA-ready reports</strong> (P&L, Trial Balance) via API</li>
          </ul>
        </section>

        {/* Prerequisites */}
        <section className="mb-12 p-4 bg-amber-50 border border-amber-200 rounded-lg" aria-labelledby="prerequisites">
          <h2 id="prerequisites" className="font-semibold text-amber-900 mb-2">Prerequisites</h2>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>• A Soledgic account (<Link href="/signup" className="underline font-medium">sign up free</Link>)</li>
            <li>• Your API key (starts with <code className="bg-amber-100 px-1 rounded">sk_live_</code> or <code className="bg-amber-100 px-1 rounded">sk_test_</code>)</li>
            <li>• An HTTP client (curl, Postman, or any programming language)</li>
          </ul>
        </section>

        {/* Step 1: Choose Your Mode */}
        <section className="mb-12" aria-labelledby="step-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold" aria-hidden="true">1</div>
            <h2 id="step-1" className="text-2xl font-semibold text-foreground">Choose Your Mode</h2>
          </div>
          
          <p className="text-muted-foreground mb-4">
            Soledgic operates in two modes. Choose based on your business model:
          </p>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">🏪 Marketplace Mode</h3>
              <p className="text-sm text-muted-foreground mb-2">For platforms with revenue splits</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Automatic creator balance tracking</li>
                <li>• Configurable split percentages (per-creator, per-product, tiered)</li>
                <li>• Withholding for taxes and refund reserves</li>
                <li>• 1099 threshold tracking at $600</li>
              </ul>
              <p className="text-xs text-primary mt-2">Examples: Gumroad, Teachable, Booklyverse</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">📊 Standard Mode</h3>
              <p className="text-sm text-muted-foreground mb-2">For traditional business accounting</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Income and expense tracking</li>
                <li>• Double-entry journal entries</li>
                <li>• P&L and Trial Balance reports</li>
                <li>• Bank reconciliation</li>
              </ul>
              <p className="text-xs text-primary mt-2">Examples: Consulting firms, agencies, SaaS</p>
            </div>
          </div>
        </section>

        {/* Step 2: Record a Sale (Marketplace) */}
        <section className="mb-12" aria-labelledby="step-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold" aria-hidden="true">2</div>
            <h2 id="step-2" className="text-2xl font-semibold text-foreground">Record a Sale (Marketplace Mode)</h2>
          </div>
          
          <p className="text-muted-foreground mb-4">
            When a customer purchases from a creator, call <code className="px-1.5 py-0.5 bg-muted rounded text-sm">/record-sale</code>. 
            The API automatically calculates the split, creates double-entry journal entries, and updates the creator's available balance.
          </p>
          
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "stripe_pi_abc123",
    "creator_id": "author_jane_doe",
    "amount": 2999,
    "product_name": "Advanced TypeScript Course"
  }'`}</code>
            </pre>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            <strong>Important:</strong> Amounts are in <strong>cents</strong>. The example above is $29.99.
          </p>
          
          <h3 className="font-semibold text-foreground mb-2">Response</h3>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`{
  "success": true,
  "transaction_id": "txn_9f8e7d6c5b4a",
  "breakdown": {
    "gross_amount": 29.99,
    "processing_fee": 0,
    "net_amount": 29.99,
    "creator_amount": 23.99,
    "platform_amount": 6.00,
    "creator_percent": 80,
    "platform_percent": 20
  },
  "creator_balance": 523.47
}`}</code>
            </pre>
          </div>
          
          <p className="text-muted-foreground">
            The creator now has $23.99 added to their balance. The platform earned $6.00. All entries are atomic—if anything fails, nothing is committed.
          </p>
        </section>

        {/* Step 3: Record Income (Standard) */}
        <section className="mb-12" aria-labelledby="step-3">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold" aria-hidden="true">3</div>
            <h2 id="step-3" className="text-2xl font-semibold text-foreground">Record Income (Standard Mode)</h2>
          </div>
          
          <p className="text-muted-foreground mb-4">
            For traditional businesses without revenue splits, use <code className="px-1.5 py-0.5 bg-muted rounded text-sm">/record-income</code>:
          </p>
          
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/record-income \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "inv_2025_001",
    "amount": 500000,
    "description": "January consulting retainer - Acme Corp"
  }'`}</code>
            </pre>
          </div>
          
          <p className="text-sm text-muted-foreground mt-2">
            This creates: Debit Cash $5,000 / Credit Revenue $5,000
          </p>
        </section>

        {/* Step 4: Record an Expense */}
        <section className="mb-12" aria-labelledby="step-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold" aria-hidden="true">4</div>
            <h2 id="step-4" className="text-2xl font-semibold text-foreground">Record an Expense</h2>
          </div>
          
          <p className="text-muted-foreground mb-4">
            Track business expenses with proper categorization for tax reporting:
          </p>
          
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/record-expense \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "exp_vercel_dec",
    "amount": 2000,
    "description": "Pro plan - December 2025",
    "category": "software",
    "vendor_name": "Vercel Inc",
    "tax_deductible": true
  }'`}</code>
            </pre>
          </div>
          
          <p className="text-muted-foreground">
            Categories include: <code>software</code>, <code>advertising</code>, <code>office</code>, <code>travel</code>, <code>meals</code>, <code>professional_services</code>, and more. 
            These map to IRS Schedule C line items for easy tax filing.
          </p>
        </section>

        {/* Step 5: Process a Payout */}
        <section className="mb-12" aria-labelledby="step-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold" aria-hidden="true">5</div>
            <h2 id="step-5" className="text-2xl font-semibold text-foreground">Process a Payout</h2>
          </div>
          
          <p className="text-muted-foreground mb-4">
            When it's time to pay a creator, use <code className="px-1.5 py-0.5 bg-muted rounded text-sm">/process-payout</code>. 
            The API validates available balance (excluding held funds) and prevents overpayment:
          </p>
          
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/process-payout \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creator_id": "author_jane_doe",
    "amount": 50000,
    "reference_id": "payout_dec_2025_jane",
    "payout_method": "ach",
    "description": "December 2025 earnings payout"
  }'`}</code>
            </pre>
          </div>
          
          <h3 className="font-semibold text-foreground mb-2">Response</h3>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300">
              <code>{`{
  "success": true,
  "transaction_id": "txn_payout_abc123",
  "breakdown": {
    "gross_payout": 500.00,
    "fees": 0,
    "net_to_creator": 500.00
  },
  "previous_balance": 523.47,
  "new_balance": 23.47
}`}</code>
            </pre>
          </div>
        </section>

        {/* Step 6: Generate Reports */}
        <section className="mb-12" aria-labelledby="step-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold" aria-hidden="true">6</div>
            <h2 id="step-6" className="text-2xl font-semibold text-foreground">Generate Reports</h2>
          </div>
          
          <p className="text-muted-foreground mb-4">
            Get CPA-ready financial statements:
          </p>
          
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`# Profit & Loss Statement
curl "https://api.soledgic.com/v1/profit-loss?start_date=2025-01-01&end_date=2025-12-31" \\
  -H "x-api-key: sk_live_your_api_key"

# Trial Balance
curl "https://api.soledgic.com/v1/trial-balance" \\
  -H "x-api-key: sk_live_your_api_key"`}</code>
            </pre>
          </div>
        </section>

        {/* What's Next */}
        <section className="bg-card border border-border rounded-lg p-6 mb-12" aria-labelledby="whats-next">
          <h2 id="whats-next" className="text-xl font-semibold text-foreground mb-4">What's Next?</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground">
                <Link href="/docs/guides/marketplace" className="text-primary hover:underline font-medium">Set up tiered revenue splits</Link> — Configure 80/20, 85/15, or custom splits per creator tier
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground">
                <Link href="/docs/api/webhooks" className="text-primary hover:underline font-medium">Configure webhooks</Link> — Get notified when creators hit 1099 thresholds or payouts are processed
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground">
                <Link href="/docs/guides/reconciliation" className="text-primary hover:underline font-medium">Set up bank reconciliation</Link> — Match your ledger with bank statements monthly
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground">
                <Link href="/docs/guides/tax-exports" className="text-primary hover:underline font-medium">Export 1099 reports</Link> — Generate contractor payment summaries for tax filing
              </span>
            </li>
          </ul>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg" aria-labelledby="related">
          <h2 id="related" className="font-semibold text-foreground mb-3">Related Documentation</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/api/record-sale" className="text-primary hover:underline">POST /record-sale reference →</Link>
            <Link href="/docs/api/record-expense" className="text-primary hover:underline">POST /record-expense reference →</Link>
            <Link href="/docs/api/process-payout" className="text-primary hover:underline">POST /process-payout reference →</Link>
            <Link href="/docs/concepts" className="text-primary hover:underline">Core accounting concepts →</Link>
          </div>
        </section>

        {/* Navigation */}
        <nav className="mt-12 flex justify-between" aria-label="Documentation navigation">
          <Link href="/docs" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Docs
          </Link>
          <Link href="/docs/authentication" className="flex items-center gap-2 text-primary hover:underline">
            Authentication
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </main>
    </>
  )
}
