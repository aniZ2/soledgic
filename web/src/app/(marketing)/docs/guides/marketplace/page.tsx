import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Store, Check, AlertTriangle, Zap } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
  HowToSchema,
} from '@/components/seo'

export const metadata: Metadata = {
  title: 'Marketplace Integration Guide - Revenue Splits & Creator Payouts',
  description: 'Complete guide to integrating Soledgic for marketplace platforms. Configure tiered revenue splits, track creator balances, process payouts, and maintain 1099 compliance.',
  keywords: ['marketplace integration', 'revenue splits', 'creator payouts', 'creator economy', 'platform accounting', '1099 compliance', 'tiered splits'],
  alternates: { canonical: '/docs/guides/marketplace' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guides', href: '/docs' },
  { name: 'Marketplace Integration', href: '/docs/guides/marketplace' },
]

const howToSteps = [
  { name: 'Create Marketplace Ledger', text: 'Create a ledger in Marketplace mode to enable revenue splitting and creator balance tracking.' },
  { name: 'Configure Split Tiers', text: 'Set up Bronze/Silver/Gold/Platinum tiers with escalating creator percentages based on lifetime earnings.' },
  { name: 'Register Creators', text: 'Creators are auto-provisioned on first sale, or pre-register via manage-contractors for W-9 collection.' },
  { name: 'Record Sales', text: 'Call POST /record-sale with creator_id and amount. The API atomically calculates split and updates balances.' },
  { name: 'Process Payouts', text: 'Pay creators via POST /process-payout. The API validates available balance minus held funds.' },
]

export default function MarketplaceGuidePage() {
  return (
    <>
      <TechArticleSchema
        headline="Marketplace Integration Guide"
        description="Complete guide to building a creator economy platform with Soledgic: tiered revenue splits, balance tracking, payouts, and tax compliance."
        slug="guides/marketplace"
        proficiencyLevel="Advanced"
        dependencies="Soledgic API key (Marketplace mode), understanding of double-entry accounting"
        datePublished="2025-01-01T00:00:00Z"
        timeRequired={30}
        keywords={['marketplace', 'revenue splits', 'creator payouts', '1099', 'tiered splits']}
        articleSection="Guides"
        wordCount={2800}
      />
      <BreadcrumbSchema items={breadcrumbItems} />
      <HowToSchema
        name="How to Integrate Soledgic for Marketplace Platforms"
        description="Step-by-step guide to implementing tiered revenue splits and creator payouts"
        steps={howToSteps}
        totalTime={120}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Store className="w-8 h-8 text-violet-600" />
            <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">Marketplace Mode</span>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Marketplace Integration Guide</h1>
          <p className="text-lg text-muted-foreground">
            Build a <strong>creator economy platform</strong> with automatic revenue splits, 
            tiered commissions, balance tracking, and 1099 compliance.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span>30 min read</span>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">Advanced</span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* Overview */}
        <section className="mb-12 p-6 bg-violet-50 border border-violet-200 rounded-lg" aria-labelledby="overview">
          <h2 id="overview" className="text-lg font-semibold text-violet-900 mb-3">What You'll Build</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <ul className="space-y-2 text-violet-800">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-600 flex-shrink-0" />Automatic 80/20 (or custom) revenue splitting</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-600 flex-shrink-0" />5-tier split priority chain</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-600 flex-shrink-0" />Real-time creator balance tracking</li>
            </ul>
            <ul className="space-y-2 text-violet-800">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-600 flex-shrink-0" />Withholding for taxes and refund reserves</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-600 flex-shrink-0" />Automatic 1099 threshold tracking at $600</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-600 flex-shrink-0" />Auto-tier promotion based on earnings</li>
            </ul>
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-12" aria-labelledby="architecture">
          <h2 id="architecture" className="text-2xl font-semibold text-foreground mb-4">Architecture Overview</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`┌─────────────────────────────────────────────────────────────────┐
│                      YOUR PLATFORM                              │
│              (Gumroad, Teachable, Booklyverse)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Stripe webhook fires
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POST /record-sale                            │
│  { reference_id: "pi_xxx", creator_id: "author_123", amount }   │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │  Cash    │   │ Platform │   │   Creator    │
        │ +$29.99  │   │ Revenue  │   │   Balance    │
        │ (Debit)  │   │  +$6.00  │   │   +$23.99    │
        └──────────┘   └──────────┘   └──────────────┘`}</code>
            </pre>
          </div>
        </section>

        {/* Step 1: Configure Tiers */}
        <section className="mb-12" aria-labelledby="step-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">1</div>
            <h2 id="step-1" className="text-2xl font-semibold text-foreground">Configure Split Tiers</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            Set up tiered splits to reward high-performing creators. Creators auto-promote based on lifetime earnings:
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/manage-splits \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "set_tiers",
    "tiers": [
      { "name": "Bronze",   "min_earnings": 0,     "creator_percent": 75 },
      { "name": "Silver",   "min_earnings": 5000,  "creator_percent": 80 },
      { "name": "Gold",     "min_earnings": 25000, "creator_percent": 85 },
      { "name": "Platinum", "min_earnings": 100000,"creator_percent": 90 }
    ]
  }'`}</code>
            </pre>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground">Tier</th>
                  <th className="text-left py-2 text-muted-foreground">Lifetime Earnings</th>
                  <th className="text-left py-2 text-muted-foreground">Creator %</th>
                  <th className="text-left py-2 text-muted-foreground">Platform %</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="py-2">🥉 Bronze</td><td className="py-2 text-muted-foreground">$0 - $4,999</td><td className="py-2">75%</td><td className="py-2">25%</td></tr>
                <tr><td className="py-2">🥈 Silver</td><td className="py-2 text-muted-foreground">$5,000 - $24,999</td><td className="py-2">80%</td><td className="py-2">20%</td></tr>
                <tr><td className="py-2">🥇 Gold</td><td className="py-2 text-muted-foreground">$25,000 - $99,999</td><td className="py-2">85%</td><td className="py-2">15%</td></tr>
                <tr><td className="py-2">💎 Platinum</td><td className="py-2 text-muted-foreground">$100,000+</td><td className="py-2">90%</td><td className="py-2">10%</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Step 2: Record Sales */}
        <section className="mb-12" aria-labelledby="step-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">2</div>
            <h2 id="step-2" className="text-2xl font-semibold text-foreground">Record Sales (Stripe Integration)</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            In your Stripe webhook handler, when <code>payment_intent.succeeded</code> fires:
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`// Next.js API route: /api/webhooks/stripe
export async function POST(req: Request) {
  const event = await stripe.webhooks.constructEvent(...)
  
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object
    const { creator_id, product_id } = pi.metadata
    
    const response = await fetch('https://api.soledgic.com/v1/record-sale', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.SOLEDGIC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: pi.id,  // Idempotency key
        creator_id: creator_id,
        amount: pi.amount,    // Already in cents
        processing_fee: Math.round(pi.amount * 0.029 + 30),
        processing_fee_paid_by: 'platform',
        product_id: product_id,
      }),
    })
    
    const result = await response.json()
    console.log('Creator balance:', result.creator_balance)
  }
  
  return new Response('OK', { status: 200 })
}`}</code>
            </pre>
          </div>
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-emerald-900">Pro Tip: Idempotency</h3>
                <p className="text-sm text-emerald-800">
                  Using <code>pi_xxx</code> as <code>reference_id</code> means duplicate webhooks return 409 with the existing transaction—no double-charges.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Step 3: Check Balances */}
        <section className="mb-12" aria-labelledby="step-3">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">3</div>
            <h2 id="step-3" className="text-2xl font-semibold text-foreground">Check Creator Balances</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            Display available balances in your creator dashboard:
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl "https://api.soledgic.com/v1/get-balances?creator_id=author_jane" \\
  -H "x-api-key: sk_live_your_api_key"`}</code>
            </pre>
          </div>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`{
  "success": true,
  "data": {
    "creator_id": "author_jane",
    "ledger_balance": 2547.82,
    "held_funds": 127.50,
    "available_balance": 2420.32,
    "lifetime_earnings": 15823.47,
    "current_tier": "Silver",
    "ytd_earnings": 8234.19,
    "pending_1099": true
  }
}`}</code>
            </pre>
          </div>
          <p className="text-sm text-muted-foreground">
            <strong>Key fields:</strong> <code>available_balance</code> is what the creator can withdraw (ledger balance minus held funds). 
            <code>pending_1099</code> indicates they've crossed the $600 threshold this year.
          </p>
        </section>

        {/* Step 4: Process Payouts */}
        <section className="mb-12" aria-labelledby="step-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">4</div>
            <h2 id="step-4" className="text-2xl font-semibold text-foreground">Process Payouts</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            When a creator requests a payout (or you run weekly payouts):
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/process-payout \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creator_id": "author_jane",
    "amount": 200000,
    "reference_id": "payout_2025_w52_jane",
    "payout_method": "ach",
    "description": "Week 52 earnings payout"
  }'`}</code>
            </pre>
          </div>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`{
  "success": true,
  "transaction_id": "txn_payout_xyz789",
  "breakdown": {
    "gross_payout": 2000.00,
    "fees": 0,
    "net_to_creator": 2000.00
  },
  "previous_balance": 2420.32,
  "new_balance": 420.32
}`}</code>
            </pre>
          </div>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900">Balance Validation</h3>
                <p className="text-sm text-amber-800">
                  The API validates against <code>available_balance</code>, not <code>ledger_balance</code>. 
                  If a creator has $500 in held funds (refund reserve), they can't withdraw that portion.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Step 5: Handle Refunds */}
        <section className="mb-12" aria-labelledby="step-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">5</div>
            <h2 id="step-5" className="text-2xl font-semibold text-foreground">Handle Refunds</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            When a customer refunds, the split reverses. Call <code>/record-refund</code> with the original sale's reference_id:
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl -X POST https://api.soledgic.com/v1/record-refund \\
  -H "x-api-key: sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "original_reference_id": "pi_original_sale",
    "reference_id": "refund_pi_original",
    "reason": "Customer requested refund within 30-day window"
  }'`}</code>
            </pre>
          </div>
          <p className="text-sm text-muted-foreground">
            This debits the creator's balance by their share ($23.99) and debits Platform Revenue by the platform share ($6.00). 
            If the creator's balance goes negative, their next payout is blocked until it's positive.
          </p>
        </section>

        {/* 1099 Compliance */}
        <section className="mb-12 bg-card border border-border rounded-lg p-6" aria-labelledby="compliance">
          <h2 id="compliance" className="text-xl font-semibold text-foreground mb-4">1099 Compliance</h2>
          <p className="text-muted-foreground mb-4">
            Soledgic automatically tracks year-to-date earnings per creator. At $600, the <code>pending_1099</code> flag goes true.
          </p>
          <h3 className="font-semibold text-foreground mb-2">W-9 Collection</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Collect W-9 information when creators sign up or when they hit the threshold. Store their TIN (SSN or EIN) 
            and legal name via <code>/manage-contractors</code>.
          </p>
          <h3 className="font-semibold text-foreground mb-2">Export 1099 Data</h3>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300">
              <code>{`curl "https://api.soledgic.com/v1/tax-documents?year=2025&type=1099" \\
  -H "x-api-key: sk_live_your_api_key"`}</code>
            </pre>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Returns: Creator name, TIN (masked), address, and total payments. Ready for your 1099 filing service.
          </p>
        </section>

        {/* Best Practices */}
        <section className="mb-12 bg-card border border-border rounded-lg p-6" aria-labelledby="best-practices">
          <h2 id="best-practices" className="text-xl font-semibold text-foreground mb-4">Best Practices</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-foreground">Use payment processor IDs as reference_id</strong>
                <p className="text-sm text-muted-foreground">Stripe's <code>pi_xxx</code>, PayPal's <code>PAYID-xxx</code>—gives you free idempotency</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-foreground">Set up webhooks for threshold alerts</strong>
                <p className="text-sm text-muted-foreground">Get notified when creators hit $600 so you can prompt for W-9</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-foreground">Hold funds for refund windows</strong>
                <p className="text-sm text-muted-foreground">If you offer 30-day refunds, hold 10-15% for that period to prevent negative balances</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-foreground">Reconcile monthly</strong>
                <p className="text-sm text-muted-foreground">Match Soledgic balances with your Stripe/bank data before closing the period</p>
              </div>
            </li>
          </ul>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg" aria-labelledby="related">
          <h2 id="related" className="font-semibold text-foreground mb-3">Related Documentation</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/api/record-sale" className="text-primary hover:underline">POST /record-sale reference →</Link>
            <Link href="/docs/api/process-payout" className="text-primary hover:underline">POST /process-payout reference →</Link>
            <Link href="/docs/guides/revenue-splits" className="text-primary hover:underline">Configuring revenue splits →</Link>
            <Link href="/docs/guides/tax-exports" className="text-primary hover:underline">1099 export guide →</Link>
          </div>
        </section>

        {/* Navigation */}
        <nav className="mt-12 flex justify-between" aria-label="Documentation navigation">
          <Link href="/docs/api/webhooks" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Webhooks API
          </Link>
          <Link href="/docs/guides/tax-exports" className="flex items-center gap-2 text-primary hover:underline">
            Tax Exports Guide
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </main>
    </>
  )
}
