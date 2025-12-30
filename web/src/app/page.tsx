import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Check,
  BookOpen,
  Shield,
  Landmark,
  FileText,
  Scale,
  Repeat,
  Receipt,
  TrendingUp,
  Users,
  Clock,
  Sparkles,
  Building2,
  Briefcase,
  Store,
  PenTool,
  Calculator,
  PiggyBank,
  FileSearch,
  Wallet,
  Layers,
  Zap,
  DollarSign,
  CreditCard,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Bell,
  Code2,
  Database,
  Eye,
  FileCheck,
  AlertTriangle,
  Target
} from 'lucide-react';

// ============================================================================
// PAGE-SPECIFIC METADATA
// ============================================================================

export const metadata: Metadata = {
  title: 'Double-Entry Accounting API with Predictive Authorization | Soledgic',
  description: 'The only ledger that proves transactions were authorized before they happened and predicts cash shortfalls before bills arrive. Double-entry bookkeeping, revenue splits, shadow ledger projections. API-first.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Soledgic | Accounting API with Shadow Ledger & Breach Prediction',
    description: 'Bridge legal intent and financial reality. Register contracts, project obligations, predict cash shortfalls. Double-entry accounting API for modern platforms.',
    url: '/',
    type: 'website',
  },
};

// ============================================================================
// STRUCTURED DATA FOR LANDING PAGE
// ============================================================================

const landingPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Soledgic - Double-Entry Accounting Software',
  description: 'Professional accounting software for freelancers, startups, and creator platforms.',
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://soledgic.com',
      },
    ],
  },
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'Soledgic',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: [
      {
        '@type': 'Offer',
        name: 'Pro',
        price: '49',
        priceCurrency: 'USD',
        priceValidUntil: '2026-12-31',
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        name: 'Business',
        price: '249',
        priceCurrency: 'USD',
        priceValidUntil: '2026-12-31',
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        name: 'Scale',
        price: '999',
        priceCurrency: 'USD',
        priceValidUntil: '2026-12-31',
        availability: 'https://schema.org/InStock',
      },
    ],
    featureList: [
      'Double-entry bookkeeping',
      'Authorizing instruments (contract proof)',
      'Shadow ledger projections',
      'Cash breach prediction',
      'Revenue split management',
      'Payout processing',
      '1099 compliance tracking',
      'Bank reconciliation',
      'REST API access',
    ],
  },
};

// FAQ Schema for rich snippets
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is double-entry accounting?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Double-entry accounting is a bookkeeping method where every transaction affects at least two accounts—a debit and a credit. This ensures your books always balance and provides an accurate audit trail.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between Standard and Marketplace mode?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Standard mode is designed for freelancers and SMBs with traditional accounting needs. Marketplace mode is built for platforms that split revenue with creators, including automatic balance tracking and payout management.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Soledgic help with 1099 compliance?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Soledgic automatically tracks contractor payments and flags when they reach the $600 IRS threshold for 1099 reporting. You can export 1099-ready reports for tax filing.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, all plans include a 14-day free trial with no credit card required. You can explore all features before committing.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Soledgic have an API?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Soledgic is API-first. Every feature available in the dashboard can be accessed via our REST API. Record sales, expenses, process payouts, and generate reports programmatically.',
      },
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      
      <div className="bg-[#FAFAF9] text-[#1C1917] antialiased">
        {/* Navigation */}
        <nav className="fixed w-full z-50 bg-[#FAFAF9]/90 backdrop-blur-sm border-b border-stone-200/60" role="navigation" aria-label="Main navigation">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Soledgic Home">
              <div className="w-7 h-7 bg-[#1C1917] rounded-md flex items-center justify-center">
                <Landmark className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden="true" />
              </div>
              <span className="font-semibold text-[15px] tracking-tight">Soledgic</span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8 text-[13px] text-stone-600">
              <Link href="#capabilities" className="hover:text-stone-900 transition-colors">Capabilities</Link>
              <Link href="#features" className="hover:text-stone-900 transition-colors">Features</Link>
              <Link href="#pricing" className="hover:text-stone-900 transition-colors">Pricing</Link>
              <Link href="/docs" className="hover:text-stone-900 transition-colors">Docs</Link>
            </div>
            
            <div className="flex items-center gap-3">
              <Link 
                href="/login" 
                className="text-[13px] text-stone-600 hover:text-stone-900 transition-colors"
              >
                Sign in
              </Link>
              <Link 
                href="/signup" 
                className="bg-[#1C1917] text-white px-4 py-1.5 rounded-md text-[13px] font-medium hover:bg-[#292524] transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <header className="pt-32 pb-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full tracking-wide">
                    API-FIRST
                  </span>
                  <span className="text-[11px] font-semibold text-violet-700 bg-violet-100 px-2 py-1 rounded-full tracking-wide">
                    DOUBLE-ENTRY
                  </span>
                </div>
                
                <h1 className="text-4xl md:text-[48px] font-semibold leading-[1.1] tracking-tight text-[#1C1917] mb-6">
                  Accounting Infrastructure<br />
                  <span className="text-stone-500">for Modern Platforms</span>
                </h1>

                <p className="text-lg text-stone-600 leading-relaxed mb-4 max-w-xl">
                  The <strong>double-entry accounting API</strong> that handles everything:
                  expense tracking, revenue splits, creator payouts, and tax compliance.
                  One API call, perfect books.
                </p>

                <p className="text-[15px] text-stone-500 leading-relaxed mb-8 max-w-xl border-l-2 border-amber-400 pl-4 italic">
                  The only ledger that can prove a transaction was authorized before it happened
                  and predict a cash shortfall before the bill arrives.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <Link 
                    href="/signup" 
                    className="inline-flex items-center justify-center gap-2 bg-[#1C1917] text-white px-6 py-3 rounded-lg text-[15px] font-medium hover:bg-[#292524] transition-colors"
                  >
                    Start Free Trial
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <Link 
                    href="/docs/quickstart" 
                    className="inline-flex items-center justify-center gap-2 bg-white text-[#1C1917] border border-stone-300 px-6 py-3 rounded-lg text-[15px] font-medium hover:bg-stone-50 transition-colors"
                  >
                    <Code2 className="w-4 h-4" aria-hidden="true" />
                    View API Docs
                  </Link>
                </div>
                
                <p className="text-[13px] text-stone-500">
                  ✓ 14-day free trial · ✓ No credit card required · ✓ Full API access
                </p>
              </div>
              
              {/* Hero Visual - API Code Sample */}
              <div className="relative">
                <div className="bg-[#1C1917] rounded-xl p-6 shadow-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="ml-2 text-stone-500 text-xs">record-sale.js</span>
                  </div>
                  <pre className="text-[13px] text-stone-300 overflow-x-auto">
                    <code>{`// One API call = complete accounting
const sale = await soledgic.recordSale({
  creator_id: "author_jane",
  amount: 2999,        // $29.99
  reference_id: "stripe_pi_xxx"
});

// Response: Automatic 80/20 split
{
  "creator_balance": 2399,  // $23.99
  "platform_revenue": 600,  // $6.00
  "transaction_id": "txn_abc123"
}`}</code>
                  </pre>
                </div>
                
                {/* Floating badges */}
                <div className="absolute -right-4 top-8 bg-white rounded-lg shadow-lg p-3 border border-stone-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-stone-900">Double-entry</p>
                      <p className="text-[10px] text-stone-500">Auto-balanced</p>
                    </div>
                  </div>
                </div>
                
                <div className="absolute -left-4 bottom-12 bg-white rounded-lg shadow-lg p-3 border border-stone-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-stone-900">Instant</p>
                      <p className="text-[10px] text-stone-500">&lt;50ms latency</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Capabilities Overview */}
        <section id="capabilities" className="py-20 px-6 border-y border-stone-200 bg-white" aria-labelledby="capabilities-heading">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] font-semibold text-stone-400 tracking-widest mb-3">WHAT YOU CAN DO</p>
              <h2 id="capabilities-heading" className="text-3xl font-semibold text-[#1C1917] mb-4">One API. Complete Accounting.</h2>
              <p className="text-stone-600 max-w-2xl mx-auto">
                Everything you need to track money flowing in and out. Via dashboard or API.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Record Sales */}
              <CapabilityCard
                icon={<ArrowUpRight className="w-5 h-5" />}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                title="Record Sales"
                description="Log revenue with optional creator splits. Stripe webhook fires, one API call, books updated."
                endpoint="POST /record-sale"
                features={['Automatic revenue splits', 'Creator balance tracking', 'Idempotency via reference_id']}
              />
              
              {/* Track Expenses */}
              <CapabilityCard
                icon={<ArrowDownRight className="w-5 h-5" />}
                iconBg="bg-red-100"
                iconColor="text-red-600"
                title="Track Expenses"
                description="Log business expenses with IRS-mapped categories. Software, ads, contractors, travel—all tracked."
                endpoint="POST /record-expense"
                features={['30+ IRS categories', 'Receipt attachment', 'Vendor tracking']}
              />
              
              {/* Process Payouts */}
              <CapabilityCard
                icon={<Wallet className="w-5 h-5" />}
                iconBg="bg-violet-100"
                iconColor="text-violet-600"
                title="Process Payouts"
                description="Pay creators and contractors. Balance validation, fee handling, complete audit trail."
                endpoint="POST /process-payout"
                features={['Available balance check', 'Fee deduction options', '1099 threshold tracking']}
              />
              
              {/* Handle Refunds */}
              <CapabilityCard
                icon={<RefreshCw className="w-5 h-5" />}
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                title="Handle Refunds"
                description="Process refunds with automatic split reversal. Creator balance adjusted, books stay balanced."
                endpoint="POST /record-refund"
                features={['Automatic split reversal', 'Balance adjustment', 'Original transaction link']}
              />
              
              {/* Generate Reports */}
              <CapabilityCard
                icon={<BarChart3 className="w-5 h-5" />}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                title="Generate Reports"
                description="P&L statements, trial balance, transaction logs. CPA-ready exports in JSON or CSV."
                endpoint="GET /profit-loss"
                features={['Income statement', 'Expense breakdown', 'Date range filtering']}
              />
              
              {/* Reconcile */}
              <CapabilityCard
                icon={<Scale className="w-5 h-5" />}
                iconBg="bg-teal-100"
                iconColor="text-teal-600"
                title="Bank Reconciliation"
                description="Match ledger entries to bank statements. Find discrepancies. Lock closed periods."
                endpoint="POST /reconcile"
                features={['Statement matching', 'Discrepancy tracking', 'Period locking']}
              />
            </div>
          </div>
        </section>

        {/* Two Modes Section */}
        <section className="py-20 px-6 bg-[#FAFAF9]" aria-labelledby="modes-heading">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] font-semibold text-stone-400 tracking-widest mb-3">TWO MODES</p>
              <h2 id="modes-heading" className="text-3xl font-semibold text-[#1C1917] mb-4">Choose your starting point.</h2>
              <p className="text-stone-600 max-w-2xl mx-auto">
                Same powerful engine. Different defaults and terminology.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* Standard Mode */}
              <article className="rounded-2xl border border-stone-200 p-8 bg-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-emerald-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-[#1C1917]">Standard Mode</h3>
                    <p className="text-[13px] text-stone-500">For freelancers, agencies & SMBs</p>
                  </div>
                </div>
                
                <p className="text-[15px] text-stone-600 mb-6">
                  Traditional business accounting. Track every dollar in and out with proper categorization.
                </p>
                
                <ul className="space-y-3 mb-6" aria-label="Standard mode features">
                  <ModeFeature icon={<DollarSign className="w-4 h-4" />}>Income & expense tracking</ModeFeature>
                  <ModeFeature icon={<Receipt className="w-4 h-4" />}>Receipt uploads with OCR</ModeFeature>
                  <ModeFeature icon={<Calculator className="w-4 h-4" />}>IRS Schedule C categories</ModeFeature>
                  <ModeFeature icon={<Users className="w-4 h-4" />}>Contractor 1099 management</ModeFeature>
                  <ModeFeature icon={<PiggyBank className="w-4 h-4" />}>Tax reserve calculations</ModeFeature>
                  <ModeFeature icon={<FileText className="w-4 h-4" />}>P&L and cash flow reports</ModeFeature>
                </ul>
                
                <div className="p-4 bg-stone-50 rounded-lg">
                  <p className="text-[12px] text-stone-500 mb-2">Perfect for:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] bg-white border border-stone-200 px-2 py-1 rounded">Freelancers</span>
                    <span className="text-[11px] bg-white border border-stone-200 px-2 py-1 rounded">Consultants</span>
                    <span className="text-[11px] bg-white border border-stone-200 px-2 py-1 rounded">Agencies</span>
                    <span className="text-[11px] bg-white border border-stone-200 px-2 py-1 rounded">Startups</span>
                  </div>
                </div>
              </article>
              
              {/* Marketplace Mode */}
              <article className="rounded-2xl border-2 border-violet-200 p-8 bg-white relative">
                <div className="absolute -top-3 right-8 bg-violet-600 text-white text-[10px] font-semibold px-3 py-1 rounded-full">
                  POPULAR
                </div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Store className="w-6 h-6 text-violet-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-[#1C1917]">Marketplace Mode</h3>
                    <p className="text-[13px] text-stone-500">For creator platforms</p>
                  </div>
                </div>
                
                <p className="text-[15px] text-stone-600 mb-6">
                  Built for platforms splitting revenue with creators. Automatic balances and payouts.
                </p>
                
                <ul className="space-y-3 mb-6" aria-label="Marketplace mode features">
                  <ModeFeature icon={<Repeat className="w-4 h-4" />}>Configurable revenue splits</ModeFeature>
                  <ModeFeature icon={<Wallet className="w-4 h-4" />}>Creator balance tracking</ModeFeature>
                  <ModeFeature icon={<CreditCard className="w-4 h-4" />}>Batch payout processing</ModeFeature>
                  <ModeFeature icon={<Shield className="w-4 h-4" />}>1099 threshold alerts at $600</ModeFeature>
                  <ModeFeature icon={<FileSearch className="w-4 h-4" />}>W-9 status management</ModeFeature>
                  <ModeFeature icon={<Bell className="w-4 h-4" />}>Webhook notifications</ModeFeature>
                </ul>
                
                <div className="p-4 bg-violet-50 rounded-lg">
                  <p className="text-[12px] text-violet-600 mb-2">Perfect for:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] bg-white border border-violet-200 px-2 py-1 rounded text-violet-700">Course platforms</span>
                    <span className="text-[11px] bg-white border border-violet-200 px-2 py-1 rounded text-violet-700">Marketplaces</span>
                    <span className="text-[11px] bg-white border border-violet-200 px-2 py-1 rounded text-violet-700">Publishing</span>
                    <span className="text-[11px] bg-white border border-violet-200 px-2 py-1 rounded text-violet-700">Affiliates</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Shadow Ledger / Predictive Authorization Section */}
        <section className="py-24 px-6 bg-gradient-to-b from-stone-900 to-stone-950 text-white" aria-labelledby="shadow-heading">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 mb-6">
                <Eye className="w-4 h-4 text-amber-400" />
                <span className="text-[12px] font-semibold text-amber-400 tracking-wide">NEW: SHADOW LEDGER</span>
              </div>
              <h2 id="shadow-heading" className="text-3xl md:text-4xl font-semibold mb-4">
                See the future.<br />
                <span className="text-stone-400">Before the bill arrives.</span>
              </h2>
              <p className="text-stone-400 max-w-2xl mx-auto text-lg">
                Soledgic bridges legal intent and financial reality. Register contracts, project obligations,
                and know your cash position months in advance.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-16">
              {/* Authorizing Instruments */}
              <div className="bg-stone-800/50 rounded-2xl p-8 border border-stone-700/50">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6">
                  <FileCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Authorizing Instruments</h3>
                <p className="text-stone-400 text-[15px] leading-relaxed mb-6">
                  Register POs, contracts, and agreements as ledger-native authorization records.
                  When expenses arrive, the system proves they were pre-authorized.
                </p>
                <code className="text-[11px] bg-stone-900 px-3 py-1.5 rounded text-emerald-400 font-mono">
                  POST /register-instrument
                </code>
              </div>

              {/* Ghost Entries */}
              <div className="bg-stone-800/50 rounded-2xl p-8 border border-stone-700/50">
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center mb-6">
                  <Eye className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Ghost Entries</h3>
                <p className="text-stone-400 text-[15px] leading-relaxed mb-6">
                  Project future obligations from contract cadence. Monthly subscriptions become
                  12 ghost entries that never touch your real books until fulfilled.
                </p>
                <code className="text-[11px] bg-stone-900 px-3 py-1.5 rounded text-violet-400 font-mono">
                  POST /project-intent
                </code>
              </div>

              {/* Breach Prediction */}
              <div className="bg-stone-800/50 rounded-2xl p-8 border border-stone-700/50">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Breach Prediction</h3>
                <p className="text-stone-400 text-[15px] leading-relaxed mb-6">
                  Compare current cash against projected obligations. Know if you can cover
                  upcoming commitments before they become overdue.
                </p>
                <code className="text-[11px] bg-stone-900 px-3 py-1.5 rounded text-amber-400 font-mono">
                  GET /get-runway → breach_risk
                </code>
              </div>
            </div>

            {/* Visual Demo */}
            <div className="bg-stone-900 rounded-xl p-6 border border-stone-800">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-2 text-stone-500 text-xs">shadow-ledger-response.json</span>
              </div>
              <pre className="text-[13px] text-stone-300 overflow-x-auto">
                <code>{`// GET /get-runway response
{
  "actuals": {
    "cash_balance": 50000,
    "runway": { "months": 8, "status": "healthy" }
  },
  "obligations": {
    "pending_total": 75000,
    "pending_count": 15,
    "items": [
      { "expected_date": "2025-02-01", "amount": 5000, "counterparty": "AWS" },
      { "expected_date": "2025-02-15", "amount": 3000, "counterparty": "Stripe" }
    ]
  },
  "breach_risk": {
    "at_risk": true,
    "shortfall": 25000,
    "coverage_ratio": 0.67
  }
}`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* API-First Section */}
        <section className="py-24 px-6 bg-[#1C1917] text-white" aria-labelledby="api-heading">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-[11px] font-semibold text-stone-500 tracking-widest mb-3">API-FIRST</p>
                <h2 id="api-heading" className="text-3xl font-semibold mb-4">Built for developers.</h2>
                <p className="text-stone-400 text-[15px] leading-relaxed mb-8">
                  Every feature is accessible via REST API. Record transactions from your payment webhooks, 
                  generate reports for your dashboard, process payouts from your admin panel.
                </p>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-medium">Instant Integration</p>
                      <p className="text-[13px] text-stone-500">Connect in minutes, not weeks</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center">
                      <Database className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-medium">Idempotent Endpoints</p>
                      <p className="text-[13px] text-stone-500">Safe retries, no double-entries</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-violet-500" />
                    </div>
                    <div>
                      <p className="font-medium">Webhook Events</p>
                      <p className="text-[13px] text-stone-500">Real-time notifications</p>
                    </div>
                  </div>
                </div>
                
                <Link 
                  href="/docs/api" 
                  className="inline-flex items-center gap-2 mt-8 text-amber-500 hover:text-amber-400 font-medium"
                >
                  Explore API Reference
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              
              <div className="bg-stone-900 rounded-xl p-6 border border-stone-800">
                <div className="text-[13px] text-stone-500 mb-4">Available Endpoints</div>
                <div className="space-y-2">
                  <EndpointRow method="POST" path="/record-sale" desc="Record sale with split" />
                  <EndpointRow method="POST" path="/record-expense" desc="Track business expense" />
                  <EndpointRow method="POST" path="/record-income" desc="Log other income" />
                  <EndpointRow method="POST" path="/process-payout" desc="Pay creator" />
                  <EndpointRow method="POST" path="/register-instrument" desc="Register authorization" />
                  <EndpointRow method="POST" path="/project-intent" desc="Project obligations" />
                  <EndpointRow method="GET" path="/get-runway" desc="Runway + breach risk" />
                  <EndpointRow method="GET" path="/profit-loss" desc="P&L report" />
                  <EndpointRow method="POST" path="/reconcile" desc="Bank reconciliation" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 px-6 bg-white" aria-labelledby="features-heading">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] font-semibold text-stone-400 tracking-widest mb-3">FEATURES</p>
              <h2 id="features-heading" className="text-3xl font-semibold text-[#1C1917] mb-4">Everything you need to stay compliant.</h2>
            </div>
            
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
              <FeatureChip icon={<Scale />} label="Double-Entry Ledger" />
              <FeatureChip icon={<Repeat />} label="Revenue Splits" />
              <FeatureChip icon={<FileCheck />} label="Authorization Proof" />
              <FeatureChip icon={<Eye />} label="Shadow Ledger" />
              <FeatureChip icon={<AlertTriangle />} label="Breach Prediction" />
              <FeatureChip icon={<Target />} label="Snap-to Matching" />
              <FeatureChip icon={<Users />} label="1099 Tracking" />
              <FeatureChip icon={<PiggyBank />} label="Tax Reserves" />
              <FeatureChip icon={<Landmark />} label="Bank Reconciliation" />
              <FeatureChip icon={<TrendingUp />} label="Cash Runway" />
              <FeatureChip icon={<FileText />} label="P&L Reports" />
              <FeatureChip icon={<Shield />} label="Audit Trail" />
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-24 px-6 bg-[#FAFAF9] border-y border-stone-200" aria-labelledby="use-cases-heading">
          <div className="max-w-6xl mx-auto">
            <div className="mb-16">
              <p className="text-[11px] font-semibold text-stone-400 tracking-widest mb-3">USE CASES</p>
              <h2 id="use-cases-heading" className="text-3xl font-semibold text-[#1C1917]">Works for how you work.</h2>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <UseCaseCard 
                icon={<PenTool className="w-5 h-5" />}
                title="Freelancers"
                mode="Standard"
                description="Track income, expenses, and quarterly taxes. Export for your CPA."
              />
              <UseCaseCard 
                icon={<Building2 className="w-5 h-5" />}
                title="Startups"
                mode="Standard"
                description="Monitor runway, manage burn rate, stay investor-ready."
              />
              <UseCaseCard 
                icon={<Store className="w-5 h-5" />}
                title="Creator Platforms"
                mode="Marketplace"
                description="Revenue splits, creator payouts, 1099 compliance at scale."
              />
              <UseCaseCard 
                icon={<Briefcase className="w-5 h-5" />}
                title="Agencies"
                mode="Either"
                description="Contractor payments, project expenses, client billing."
              />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 px-6 bg-white" aria-labelledby="pricing-heading">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] font-semibold text-stone-400 tracking-widest mb-3">PRICING</p>
              <h2 id="pricing-heading" className="text-3xl font-semibold text-[#1C1917] mb-4">Simple pricing. No surprises.</h2>
              <p className="text-stone-600">Start free. Scale as you grow. Same pricing for both modes.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {/* Pro */}
              <article className="border border-stone-200 rounded-2xl p-8 bg-[#FAFAF9]">
                <p className="text-[13px] font-semibold text-stone-500 mb-2">PRO</p>
                <div className="mb-6">
                  <span className="text-4xl font-semibold">$49</span>
                  <span className="text-stone-500">/mo</span>
                </div>
                <p className="text-[15px] text-stone-600 mb-8">
                  For freelancers and early-stage businesses.
                </p>
                <ul className="space-y-3 mb-8" aria-label="Pro plan features">
                  <PricingFeature>3 ledgers</PricingFeature>
                  <PricingFeature>Unlimited transactions</PricingFeature>
                  <PricingFeature>Full API access</PricingFeature>
                  <PricingFeature>Receipt OCR</PricingFeature>
                  <PricingFeature>Email support</PricingFeature>
                </ul>
                <Link 
                  href="/signup?plan=pro"
                  className="block w-full text-center bg-white border border-stone-300 text-[#1C1917] px-6 py-3 rounded-lg text-[15px] font-medium hover:bg-stone-50 transition-colors"
                >
                  Start Free Trial
                </Link>
              </article>
              
              {/* Business */}
              <article className="border-2 border-[#1C1917] rounded-2xl p-8 bg-white relative">
                <div className="absolute -top-3 left-8 bg-[#1C1917] text-white text-[11px] font-semibold px-3 py-1 rounded-full">
                  POPULAR
                </div>
                <p className="text-[13px] font-semibold text-stone-500 mb-2">BUSINESS</p>
                <div className="mb-6">
                  <span className="text-4xl font-semibold">$249</span>
                  <span className="text-stone-500">/mo</span>
                </div>
                <p className="text-[15px] text-stone-600 mb-8">
                  For growing teams and platforms.
                </p>
                <ul className="space-y-3 mb-8" aria-label="Business plan features">
                  <PricingFeature>10 ledgers</PricingFeature>
                  <PricingFeature>Up to 10 team members</PricingFeature>
                  <PricingFeature>Bank reconciliation</PricingFeature>
                  <PricingFeature>Webhooks</PricingFeature>
                  <PricingFeature>Priority support</PricingFeature>
                </ul>
                <Link 
                  href="/signup?plan=business"
                  className="block w-full text-center bg-[#1C1917] text-white px-6 py-3 rounded-lg text-[15px] font-medium hover:bg-[#292524] transition-colors"
                >
                  Start Free Trial
                </Link>
              </article>
              
              {/* Scale */}
              <article className="border border-stone-200 rounded-2xl p-8 bg-[#FAFAF9]">
                <p className="text-[13px] font-semibold text-stone-500 mb-2">SCALE</p>
                <div className="mb-6">
                  <span className="text-4xl font-semibold">$999</span>
                  <span className="text-stone-500">/mo</span>
                </div>
                <p className="text-[15px] text-stone-600 mb-8">
                  For enterprises with complex needs.
                </p>
                <ul className="space-y-3 mb-8" aria-label="Scale plan features">
                  <PricingFeature>Unlimited ledgers</PricingFeature>
                  <PricingFeature>Unlimited team members</PricingFeature>
                  <PricingFeature>Dedicated support</PricingFeature>
                  <PricingFeature>SLA guarantee</PricingFeature>
                  <PricingFeature>Custom integrations</PricingFeature>
                </ul>
                <Link 
                  href="/signup?plan=scale"
                  className="block w-full text-center bg-white border border-stone-300 text-[#1C1917] px-6 py-3 rounded-lg text-[15px] font-medium hover:bg-stone-50 transition-colors"
                >
                  Contact Sales
                </Link>
              </article>
            </div>
            
            <p className="text-center text-[13px] text-stone-500 mt-8">
              All plans include a 14-day free trial. No credit card required.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-6 bg-[#1C1917] text-white" aria-labelledby="cta-heading">
          <div className="max-w-2xl mx-auto text-center">
            <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-6" aria-hidden="true" />
            <h2 id="cta-heading" className="text-3xl font-semibold mb-4">
              Ready to get your books in order?
            </h2>
            <p className="text-stone-400 mb-8 text-lg">
              One API call. Perfect double-entry. Complete compliance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link 
                href="/signup" 
                className="inline-flex items-center justify-center gap-2 bg-white text-[#1C1917] px-8 py-4 rounded-lg text-[15px] font-medium hover:bg-stone-100 transition-colors"
              >
                Start Your Free Trial
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link 
                href="/docs/quickstart" 
                className="inline-flex items-center justify-center gap-2 border border-stone-600 text-white px-8 py-4 rounded-lg text-[15px] font-medium hover:bg-stone-800 transition-colors"
              >
                Read the Docs
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-6 border-t border-stone-800 bg-[#1C1917]" role="contentinfo">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-stone-800 rounded flex items-center justify-center">
                <Landmark className="w-3.5 h-3.5 text-stone-400" strokeWidth={2.5} aria-hidden="true" />
              </div>
              <span className="font-semibold text-[14px] tracking-tight text-stone-400">Soledgic</span>
            </div>
            
            <nav className="flex items-center gap-8 text-[13px] text-stone-500" aria-label="Footer navigation">
              <Link href="/docs" className="hover:text-white transition-colors">Documentation</Link>
              <Link href="/docs/api" className="hover:text-white transition-colors">API Reference</Link>
              <Link href="/docs/quickstart" className="hover:text-white transition-colors">Quickstart</Link>
              <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            </nav>
            
            <p className="text-[13px] text-stone-600">
              © 2025 Soledgic. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

// Component for Capability Cards
function CapabilityCard({ 
  icon, 
  iconBg, 
  iconColor, 
  title, 
  description, 
  endpoint, 
  features 
}: { 
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  description: string
  endpoint: string
  features: string[]
}) {
  return (
    <article className="p-6 rounded-xl border border-stone-200 bg-[#FAFAF9] hover:border-stone-300 transition-all hover:shadow-sm">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} mb-4`}>
        {icon}
      </div>
      <h3 className="font-semibold text-[#1C1917] mb-2">{title}</h3>
      <p className="text-[14px] text-stone-500 leading-relaxed mb-4">{description}</p>
      <code className="text-[11px] bg-stone-200 px-2 py-1 rounded text-stone-700 font-mono">{endpoint}</code>
      <ul className="mt-4 space-y-1">
        {features.map((f, i) => (
          <li key={i} className="text-[12px] text-stone-500 flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-500" />
            {f}
          </li>
        ))}
      </ul>
    </article>
  )
}

// Component for Feature Chips
function FeatureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-stone-200 bg-[#FAFAF9]">
      <div className="text-stone-500">{icon}</div>
      <span className="text-[14px] font-medium text-[#1C1917]">{label}</span>
    </div>
  )
}

// Component for Endpoint Rows
function EndpointRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  const methodColor = method === 'GET' ? 'text-emerald-400' : 'text-blue-400'
  return (
    <div className="flex items-center justify-between py-2 border-b border-stone-800 last:border-0">
      <div className="flex items-center gap-3">
        <span className={`text-[11px] font-mono font-semibold ${methodColor}`}>{method}</span>
        <span className="text-[13px] font-mono text-stone-300">{path}</span>
      </div>
      <span className="text-[12px] text-stone-500">{desc}</span>
    </div>
  )
}

function UseCaseCard({ icon, title, mode, description }: { icon: React.ReactNode; title: string; mode: string; description: string }) {
  return (
    <article className="p-6 rounded-xl bg-white border border-stone-200">
      <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600 mb-4" aria-hidden="true">
        {icon}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-[#1C1917]">{title}</h3>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          mode === 'Marketplace' ? 'bg-violet-100 text-violet-700' :
          mode === 'Standard' ? 'bg-emerald-100 text-emerald-700' :
          'bg-stone-100 text-stone-600'
        }`}>
          {mode}
        </span>
      </div>
      <p className="text-[14px] text-stone-500 leading-relaxed">{description}</p>
    </article>
  );
}

function ModeFeature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[14px] text-stone-600">
      <div className="text-stone-400">{icon}</div>
      {children}
    </li>
  );
}

function PricingFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[14px] text-stone-600">
      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
      {children}
    </li>
  );
}
