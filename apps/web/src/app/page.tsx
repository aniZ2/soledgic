import Link from 'next/link'
import { Check } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    price: 49,
    description: 'For solo founders and small platforms',
    features: [
      '1 ledger',
      'Up to 1,000 transactions/month',
      'API access',
      'Creator payouts',
      'Basic reports',
      'Email support',
    ],
    cta: 'Start free trial',
    popular: false,
  },
  {
    name: 'Growth',
    price: 199,
    description: 'For growing creator platforms',
    features: [
      '3 ledgers',
      'Up to 10,000 transactions/month',
      'Team members (up to 5)',
      'Bank reconciliation',
      '1099 generation',
      'Priority support',
    ],
    cta: 'Start free trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 499,
    description: 'For high-volume platforms',
    features: [
      'Unlimited ledgers',
      'Unlimited transactions',
      'Unlimited team members',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
    cta: 'Contact sales',
    popular: false,
  },
]

const features = [
  {
    title: 'Double-Entry Ledger',
    description: 'Real accounting for creator platforms. Every sale automatically splits between creators and platform.',
  },
  {
    title: 'Creator Payouts',
    description: 'Track balances, process payouts, generate statements. Stripe Connect, PayPal, or manual.',
  },
  {
    title: '1099 Generation',
    description: 'Automatically calculate and generate 1099-K forms for all your creators at tax time.',
  },
  {
    title: 'Bank Reconciliation',
    description: 'Connect via Plaid or import CSV. Auto-match transactions with your ledger.',
  },
  {
    title: 'Revenue Splits',
    description: 'Configurable splits per creator, product, or tier. Withholding rules for refunds and taxes.',
  },
  {
    title: 'API-First',
    description: 'Full REST API with TypeScript SDK. Webhooks for real-time event notifications.',
  },
]

const comparisonFeatures = [
  { feature: 'Double-entry ledger', soledgic: true, stripe: false, quickbooks: true },
  { feature: 'Creator revenue splits', soledgic: true, stripe: 'Connect only', quickbooks: false },
  { feature: 'Automatic 1099s', soledgic: true, stripe: 'Limited', quickbooks: 'Add-on' },
  { feature: 'Bank reconciliation', soledgic: true, stripe: false, quickbooks: true },
  { feature: 'Multi-platform support', soledgic: true, stripe: false, quickbooks: 'Add-on' },
  { feature: 'Period locking', soledgic: true, stripe: false, quickbooks: 'Manual' },
  { feature: 'Frozen statements', soledgic: true, stripe: false, quickbooks: false },
  { feature: 'Withholding rules', soledgic: true, stripe: false, quickbooks: false },
  { feature: 'Full API access', soledgic: true, stripe: true, quickbooks: 'Limited' },
  { feature: 'Webhooks', soledgic: true, stripe: true, quickbooks: false },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-primary">Soledgic</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground">Features</a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
              <a href="#compare" className="text-muted-foreground hover:text-foreground">Compare</a>
              <Link href="/login" className="text-muted-foreground hover:text-foreground">Login</Link>
              <Link 
                href="/signup" 
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
            Accounting for Creator Platforms
          </h1>
          <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto">
            Double-entry accounting designed for platforms that pay creators. 
            Track revenue splits, process payouts, and generate 1099s — all from one API.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/signup" 
              className="bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90"
            >
              Start 14-day free trial
            </Link>
            <a 
              href="#pricing" 
              className="border border-border px-8 py-3 rounded-md text-lg font-medium hover:bg-accent"
            >
              View pricing
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required • Built for Booklyverse, Patreon-style platforms, and marketplaces
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground">
              Everything you need to pay creators
            </h2>
            <p className="mt-4 text-muted-foreground">
              From recording sales to generating tax documents.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="bg-card p-6 rounded-lg border border-border">
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-muted-foreground">
              14-day free trial on all plans.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div 
                key={plan.name} 
                className={`bg-card p-8 rounded-lg border ${
                  plan.popular ? 'border-primary ring-2 ring-primary' : 'border-border'
                }`}
              >
                {plan.popular && (
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <h3 className="text-2xl font-bold text-foreground mt-4">{plan.name}</h3>
                <p className="text-muted-foreground mt-2">{plan.description}</p>
                <div className="mt-6">
                  <span className="text-4xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="mt-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-primary" />
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

      {/* Comparison */}
      <section id="compare" className="py-20 bg-muted/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground">
              Built for creator platforms
            </h2>
            <p className="mt-4 text-muted-foreground">
              Unlike generic payment processors or accounting software.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-medium text-foreground">Feature</th>
                  <th className="text-center py-4 px-4 font-medium text-primary">Soledgic</th>
                  <th className="text-center py-4 px-4 font-medium text-muted-foreground">Stripe</th>
                  <th className="text-center py-4 px-4 font-medium text-muted-foreground">QuickBooks</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((row) => (
                  <tr key={row.feature} className="border-b border-border">
                    <td className="py-4 px-4 text-foreground">{row.feature}</td>
                    <td className="py-4 px-4 text-center">
                      {row.soledgic === true ? (
                        <Check className="h-5 w-5 text-primary mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">{row.soledgic}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {row.stripe === true ? (
                        <Check className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : row.stripe === false ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">{row.stripe}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {row.quickbooks === true ? (
                        <Check className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : row.quickbooks === false ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">{row.quickbooks}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-foreground">
            Ready to simplify creator payouts?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start your 14-day free trial. No credit card required.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-xl font-bold text-primary">Soledgic</span>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <a href="/docs" className="hover:text-foreground">Documentation</a>
              <a href="/privacy" className="hover:text-foreground">Privacy</a>
              <a href="/terms" className="hover:text-foreground">Terms</a>
              <a href="mailto:support@soledgic.com" className="hover:text-foreground">Support</a>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Soledgic. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
