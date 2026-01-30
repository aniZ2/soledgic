import Link from 'next/link'
import { Check, ShieldCheck, Zap, BookLock } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    price: 49,
    description: 'For new platforms that need payments, payouts, and visibility.',
    features: [
      '1 Ledger',
      'Up to 1,000 transactions/mo',
      'Full API & Webhook Access',
      'Creator Payouts',
      'Standard Reporting',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Growth',
    price: 199,
    description: 'For teams managing splits, compliance, and higher volume.',
    features: [
      '3 Ledgers',
      'Up to 10,000 transactions/mo',
      'Team Members (up to 5)',
      'Bank Reconciliation',
      '1099-K Data Exports',
      'Priority Support',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 499,
    description: 'For platforms at scale needing custom workflows and support.',
    features: [
      'Unlimited Ledgers',
      'Unlimited Transactions',
      'Unlimited Team Members',
      'Dedicated Support & SLA',
      'Custom Integrations',
      'Dispute & Escrow Management',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

const features = [
  {
    icon: <BookLock className="h-6 w-6 text-primary" />,
    title: 'Audit-Ready Ledger',
    description: 'Every movement of money is recorded in a double-entry ledger so finance can close faster and trust the numbers.',
  },
  {
    icon: <Zap className="h-6 w-6 text-primary" />,
    title: 'Payments + Payouts in One Flow',
    description: 'Accept payments, issue refunds, and pay sellers from one system while your team sees the full lifecycle.',
  },
  {
    icon: <Check className="h-6 w-6 text-primary" />,
    title: 'Flexible Revenue Splits',
    description: 'Set platform fees, creator earnings, and partner commissions once and apply them across every transaction.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-primary" />,
    title: 'Compliance and Tax Reporting',
    description: 'Use Stripe Connect for KYC/KYB and export 1099-K data with verified, consistent numbers.',
  },
  {
    title: 'Automated Reconciliation',
    description: 'Match payouts and deposits to ledger entries so ops and finance can answer questions quickly.',
  },
  {
    title: 'Developer Tooling',
    description: 'Clean REST APIs, a TypeScript SDK, and webhooks so engineering can ship fast and stay in control.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-lg z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-primary">Soledgic</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">Features</a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Pricing</a>
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">Login</Link>
              <Link 
                href="/signup" 
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 text-sm font-medium"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground">
            Move platform money with clarity
          </h1>
          <p className="mt-6 text-xl text-muted-foreground max-w-3xl mx-auto">
            Accept payments, split revenue, hold funds, and pay sellers while keeping an audit-ready ledger. Ops and finance get visibility; developers get a clean API.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/signup" 
              className="bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90"
            >
              Start 14-Day Free Trial
            </Link>
            <a 
              href="#features" 
              className="border border-border px-8 py-3 rounded-md text-lg font-medium hover:bg-accent"
            >
              Explore Features
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required. Talk to us if you need a custom rollout.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground tracking-tight">
              The platform finance system
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything you need to move money and answer questions fast.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.slice(0, 3).map((feature) => (
              <div key={feature.title} className="bg-card p-6 rounded-lg border border-border">
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
           <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-8">
            {features.slice(3).map((feature) => (
              <div key={feature.title} className="bg-card p-6 rounded-lg border border-border">
                <div className="mb-4">{feature.icon || <Check className="h-6 w-6 text-primary" />}</div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Security Section */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
            <div>
                <h2 className="text-3xl font-bold text-foreground">Secure by design, compliant by partnership</h2>
                <p className="mt-4 text-muted-foreground">
                    We protect the ledger while Stripe Connect handles sensitive identity checks and onboarding flows.
                </p>
                <ul className="mt-6 space-y-4">
                    <li className="flex items-start gap-3">
                        <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                        <div>
                            <h4 className="font-semibold">Vault-Encrypted Secrets</h4>
                            <p className="text-muted-foreground text-sm">API keys and secrets are stored in an encrypted vault, isolated per ledger.</p>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                        <div>
                            <h4 className="font-semibold">Per-Ledger Security</h4>
                            <p className="text-muted-foreground text-sm">Each customer's data is isolated using Postgres Row-Level Security and per-ledger webhook secrets.</p>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                        <div>
                            <h4 className="font-semibold">Stripe-Managed Compliance</h4>
                            <p className="text-muted-foreground text-sm">Identity checks and creator onboarding are handled by Stripe's secure UI.</p>
                        </div>
                    </li>
                </ul>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-background border border-border p-8 rounded-lg">
                <blockquote className="text-lg">
                    "We finally have a single source of truth for payouts, balances, and platform fees. Support can answer questions without engineering."
                </blockquote>
                <p className="mt-4 font-semibold">- Operations lead, marketplace platform</p>
            </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground tracking-tight">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A predictable platform fee plus usage-based transaction fees.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div 
                key={plan.name} 
                className={`bg-card p-8 rounded-lg border flex flex-col ${
                  plan.popular ? 'border-primary ring-2 ring-primary' : 'border-border'
                }`}
              >
                {plan.popular && (
                  <span className="self-center bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full mb-4">
                    Most Popular
                  </span>
                )}
                <h3 className="text-2xl font-bold text-foreground text-center">{plan.name}</h3>
                <p className="text-muted-foreground mt-2 text-center h-12">{plan.description}</p>
                <div className="mt-6 text-center">
                  <span className="text-4xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="mt-8 space-y-3 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-8 block text-center py-3 rounded-md font-medium ${
                    plan.popular 
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-border hover:bg-accent'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-primary/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-foreground tracking-tight">
            Stop stitching together financial tools.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Give every team a clear view of money flow.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90"
          >
            Start Your 14-Day Free Trial
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <span className="text-xl font-bold text-primary">Soledgic</span>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <a href="/docs" className="hover:text-foreground">Documentation</a>
              <a href="/privacy" className="hover:text-foreground">Privacy</a>
              <a href="/terms" className="hover:text-foreground">Terms</a>
              <a href="mailto:support@soledgic.com" className="hover:text-foreground">Support</a>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Soledgic. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
