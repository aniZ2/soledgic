import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, BookOpen, Scale, RefreshCw, Layers, DollarSign, FileText, Shield, Clock } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
} from '@/components/seo'

export const metadata: Metadata = {
  title: 'Core Concepts - Double-Entry Accounting Fundamentals',
  description: 'Understand the core concepts of Soledgic: ledgers, dual-mode accounting, atomic transactions, revenue splits, withholding, and the immutable audit trail.',
  keywords: ['double-entry accounting', 'bookkeeping fundamentals', 'debits credits', 'ledger concepts', 'atomic transactions', 'revenue splits'],
  alternates: { canonical: '/docs/concepts' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Core Concepts', href: '/docs/concepts' },
]

export default function ConceptsPage() {
  return (
    <>
      <TechArticleSchema
        headline="Core Concepts: Understanding Soledgic"
        description="Deep dive into Soledgic's architecture: ledgers, dual-mode accounting, atomic transactions, revenue splits, and audit trails."
        slug="concepts"
        proficiencyLevel="Intermediate"
        datePublished="2025-01-01T00:00:00Z"
        timeRequired={20}
        keywords={['double-entry', 'accounting', 'ledger', 'atomic', 'revenue splits']}
        articleSection="Getting Started"
        wordCount={2000}
      />
      <BreadcrumbSchema items={breadcrumbItems} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Core Concepts</h1>
          <p className="text-lg text-muted-foreground">
            Understanding how Soledgic handles <strong>double-entry bookkeeping</strong>, 
            revenue splits, and financial integrity for modern platforms.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="w-4 h-4" />
              20 min read
            </span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
              Intermediate
            </span>
            <span className="text-xs">Last updated: December 2025</span>
          </div>
        </header>

        {/* Table of Contents */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg">
          <h2 className="font-semibold text-foreground mb-3">In this guide</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li><a href="#ledgers" className="text-primary hover:underline">1. Ledgers & Multi-tenancy</a></li>
            <li><a href="#modes" className="text-primary hover:underline">2. Marketplace vs Standard Mode</a></li>
            <li><a href="#double-entry" className="text-primary hover:underline">3. Double-Entry Principle</a></li>
            <li><a href="#atomic" className="text-primary hover:underline">4. Atomic Transactions</a></li>
            <li><a href="#splits" className="text-primary hover:underline">5. Revenue Split Priority Chain</a></li>
            <li><a href="#withholding" className="text-primary hover:underline">6. Withholding & Held Funds</a></li>
            <li><a href="#immutability" className="text-primary hover:underline">7. Immutable Audit Trail</a></li>
          </ul>
        </section>

        {/* Ledgers */}
        <section className="mb-12" id="ledgers" aria-labelledby="ledgers-heading">
          <h2 id="ledgers-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Ledgers & Multi-tenancy
          </h2>
          <p className="text-muted-foreground mb-4">
            A <strong>ledger</strong> is a complete, isolated set of financial books. Each ledger has its own:
          </p>
          <ul className="space-y-2 text-muted-foreground mb-4">
            <li>• Chart of accounts (Cash, Revenue, Expenses, Creator Balances, etc.)</li>
            <li>• Transactions and journal entries</li>
            <li>• Creator/contractor accounts and balances</li>
            <li>• Split configurations and tiers</li>
            <li>• API key for authentication</li>
          </ul>
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-2">When to create separate ledgers:</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Different businesses:</strong> Booklyverse and Vantage Registry each get their own ledger</li>
              <li>• <strong>Environments:</strong> Development, staging, production</li>
              <li>• <strong>Client separation:</strong> If you're an agency managing books for multiple clients</li>
            </ul>
          </div>
        </section>

        {/* Two Modes */}
        <section className="mb-12" id="modes" aria-labelledby="modes-heading">
          <h2 id="modes-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-primary" />
            Marketplace vs Standard Mode
          </h2>
          <p className="text-muted-foreground mb-4">
            Soledgic operates in two modes, set when you create a ledger. The mode determines default account structures and available features:
          </p>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
              <h3 className="font-semibold text-violet-900 mb-2">🏪 Marketplace Mode</h3>
              <p className="text-sm text-violet-800 mb-3">For platforms with creator payouts</p>
              <p className="text-sm text-violet-700 mb-2"><strong>Primary endpoint:</strong> <code className="bg-violet-100 px-1 rounded">/record-sale</code></p>
              <ul className="text-xs text-violet-700 space-y-1">
                <li>• Records sale with automatic revenue split</li>
                <li>• Creates creator_balance liability accounts</li>
                <li>• Tracks per-creator earnings for 1099 reporting</li>
                <li>• Supports withholding (tax reserves, refund buffers)</li>
              </ul>
            </div>
            
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h3 className="font-semibold text-emerald-900 mb-2">📊 Standard Mode</h3>
              <p className="text-sm text-emerald-800 mb-3">For traditional business accounting</p>
              <p className="text-sm text-emerald-700 mb-2"><strong>Primary endpoint:</strong> <code className="bg-emerald-100 px-1 rounded">/record-income</code></p>
              <ul className="text-xs text-emerald-700 space-y-1">
                <li>• Records income without splits</li>
                <li>• Standard chart of accounts</li>
                <li>• P&L and Trial Balance reports</li>
                <li>• Bank reconciliation</li>
              </ul>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Both modes support <code>/record-expense</code> and all reporting endpoints. The mode primarily affects how income is recorded.
          </p>
        </section>

        {/* Double-Entry Principle */}
        <section className="mb-12" id="double-entry" aria-labelledby="double-entry-heading">
          <h2 id="double-entry-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" />
            The Double-Entry Principle
          </h2>
          <p className="text-muted-foreground mb-4">
            Every transaction in Soledgic creates <strong>at least two journal entries</strong>—one debit and one credit. 
            Total debits must always equal total credits. This is enforced at the database level.
          </p>
          
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center mb-4">
            <p className="text-xl font-mono font-bold text-foreground">
              Assets = Liabilities + Equity
            </p>
            <p className="text-sm text-muted-foreground mt-2">Every transaction maintains this balance</p>
          </div>
          
          <h3 className="font-semibold text-foreground mb-2">Example: $29.99 Sale with 80/20 Split</h3>
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
                  <td className="text-right py-2">-</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2">Platform Revenue</td>
                  <td className="py-2 text-muted-foreground">Revenue</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2 text-blue-600">$6.00</td>
                </tr>
                <tr>
                  <td className="py-2">Creator Balance (Jane)</td>
                  <td className="py-2 text-muted-foreground">Liability</td>
                  <td className="text-right py-2">-</td>
                  <td className="text-right py-2 text-blue-600">$23.99</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t border-border">
                  <td className="py-2 pt-3" colSpan={2}>Total</td>
                  <td className="text-right py-2 pt-3">$29.99</td>
                  <td className="text-right py-2 pt-3">$29.99</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <p className="text-muted-foreground">
            The creator's $23.99 is a <strong>liability</strong>—money you owe them. When you pay it out, 
            you'll debit Creator Balance (reducing the liability) and credit Cash (money leaves your account).
          </p>
        </section>

        {/* Atomic Transactions */}
        <section className="mb-12" id="atomic" aria-labelledby="atomic-heading">
          <h2 id="atomic-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Atomic Transactions
          </h2>
          <p className="text-muted-foreground mb-4">
            Every Soledgic API call that creates financial entries uses <strong>database transactions</strong>. 
            This means all entries are committed together or none are—there's no partial state.
          </p>
          
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-foreground mb-2">What "atomic" guarantees:</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>If <code>/record-sale</code> returns success, <em>all</em> entries (cash, revenue, creator balance) are committed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>If anything fails (network, database, validation), nothing is committed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Your trial balance always balances—there's no "orphan entries" state</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Duplicate <code>reference_id</code> calls return 409 and the existing transaction ID (idempotent)</span>
              </li>
            </ul>
          </div>
          
          <p className="text-sm text-muted-foreground">
            This is implemented using PostgreSQL's <code>record_sale_atomic</code> database function, 
            which wraps all inserts in a single transaction block.
          </p>
        </section>

        {/* Revenue Split Priority */}
        <section className="mb-12" id="splits" aria-labelledby="splits-heading">
          <h2 id="splits-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" />
            Revenue Split Priority Chain
          </h2>
          <p className="text-muted-foreground mb-4">
            When <code>/record-sale</code> calculates the split, it follows a <strong>5-level priority chain</strong>:
          </p>
          
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <strong className="text-foreground">Request-level</strong>
                  <p className="text-muted-foreground">Pass <code>creator_percent</code> in the API call to override everything</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/80 text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <strong className="text-foreground">Creator-level</strong>
                  <p className="text-muted-foreground">Custom split set on the creator's account (e.g., premium creators get 90%)</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/60 text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <strong className="text-foreground">Product-level</strong>
                  <p className="text-muted-foreground">Split configured for specific products (coming soon)</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/40 text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <div>
                  <strong className="text-foreground">Tier-level</strong>
                  <p className="text-muted-foreground">Creator's tier (Bronze 75%, Silver 80%, Gold 85%, Platinum 90%)</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                <div>
                  <strong className="text-foreground">Ledger default</strong>
                  <p className="text-muted-foreground">Falls back to ledger's <code>default_split_percent</code> (typically 80%)</p>
                </div>
              </li>
            </ol>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Configure tiers via <code>/manage-splits</code>. Creators can auto-promote based on lifetime earnings thresholds you define.
          </p>
        </section>

        {/* Withholding */}
        <section className="mb-12" id="withholding" aria-labelledby="withholding-heading">
          <h2 id="withholding-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            Withholding & Held Funds
          </h2>
          <p className="text-muted-foreground mb-4">
            Soledgic can automatically hold a portion of creator earnings for various reasons:
          </p>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">🏛️ Tax Reserves</h3>
              <p className="text-sm text-muted-foreground">
                Hold a percentage (e.g., 10%) until the creator provides W-9 information. 
                Protects you from backup withholding requirements.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">🔄 Refund Buffers</h3>
              <p className="text-sm text-muted-foreground">
                Hold earnings for a period (e.g., 30 days) to cover potential chargebacks. 
                Especially useful for digital goods with refund windows.
              </p>
            </div>
          </div>
          
          <p className="text-muted-foreground mb-4">
            <strong>Available Balance</strong> = Ledger Balance - Held Funds
          </p>
          
          <p className="text-sm text-muted-foreground">
            When you call <code>/process-payout</code>, Soledgic validates against the <em>available</em> balance, 
            not the total ledger balance. This prevents paying out funds you may need for refunds.
          </p>
        </section>

        {/* Immutability */}
        <section className="mb-12" id="immutability" aria-labelledby="immutability-heading">
          <h2 id="immutability-heading" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Immutable Audit Trail
          </h2>
          <p className="text-muted-foreground mb-4">
            Soledgic maintains an <strong>immutable audit log</strong>. Transactions cannot be edited or deleted—only reversed.
          </p>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-amber-900 mb-2">What gets logged:</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• Every API call (endpoint, request body, response status)</li>
              <li>• IP address of the caller</li>
              <li>• Timestamp (UTC)</li>
              <li>• Risk score (for fraud detection)</li>
              <li>• Actor type (API, dashboard, system)</li>
            </ul>
          </div>
          
          <p className="text-muted-foreground mb-4">
            To correct a mistake, use <code>/reverse-transaction</code>. This creates a new transaction that 
            <em>offsets</em> the original, preserving the complete history.
          </p>
          
          <p className="text-sm text-muted-foreground">
            <strong>Why this matters:</strong> When your CPA audits your books, they see every action ever taken. 
            When investors do due diligence, they see unforgeable records. When the IRS asks questions, you have answers.
          </p>
        </section>

        {/* Related Pages */}
        <section className="mb-12 p-4 bg-muted/50 rounded-lg" aria-labelledby="related">
          <h2 id="related" className="font-semibold text-foreground mb-3">Related Documentation</h2>
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Link href="/docs/quickstart" className="text-primary hover:underline">Quickstart guide →</Link>
            <Link href="/docs/api/record-sale" className="text-primary hover:underline">POST /record-sale reference →</Link>
            <Link href="/docs/guides/marketplace" className="text-primary hover:underline">Marketplace integration guide →</Link>
            <Link href="/docs/guides/revenue-splits" className="text-primary hover:underline">Configuring revenue splits →</Link>
          </div>
        </section>

        {/* Navigation */}
        <nav className="mt-12 flex justify-between" aria-label="Documentation navigation">
          <Link href="/docs/authentication" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Authentication
          </Link>
          <Link href="/docs/api/record-sale" className="flex items-center gap-2 text-primary hover:underline">
            API Reference
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </main>
    </>
  )
}
