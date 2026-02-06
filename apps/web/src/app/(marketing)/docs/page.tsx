import Link from 'next/link'
import { BookOpen, Key, Code, Lightbulb, Bell, Package, ArrowRight } from 'lucide-react'

const sections = [
  {
    title: 'Quickstart',
    description: 'Get up and running with Soledgic in under 5 minutes',
    href: '/docs/quickstart',
    icon: BookOpen,
  },
  {
    title: 'Authentication',
    description: 'Learn how to authenticate your API requests',
    href: '/docs/authentication',
    icon: Key,
  },
  {
    title: 'Core Concepts',
    description: 'Understand ledgers, accounts, and double-entry accounting',
    href: '/docs/concepts',
    icon: Lightbulb,
  },
  {
    title: 'API Reference',
    description: 'Complete reference for all API endpoints',
    href: '/docs/api',
    icon: Code,
  },
  {
    title: 'Webhooks',
    description: 'Receive real-time notifications for ledger events',
    href: '/docs/webhooks',
    icon: Bell,
  },
  {
    title: 'SDKs & Libraries',
    description: 'Official SDKs for JavaScript, Python, and more',
    href: '/docs/sdks',
    icon: Package,
  },
]

export default function DocsPage() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Soledgic Documentation
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl">
          Double-entry accounting for creator platforms. Track revenue splits, manage payouts,
          and maintain an immutable audit trail.
        </p>
      </div>

      {/* Quick example */}
      <div className="bg-slate-900 rounded-lg p-6 mb-12 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-slate-400">Record your first sale</span>
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">POST</span>
        </div>
        <pre className="text-sm text-slate-300">
{`curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_test_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "order_123",
    "creator_id": "creator_456",
    "amount": 2999,
    "description": "Digital product sale"
  }'`}
        </pre>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <Link
              key={section.title}
              href={section.href}
              className="group block p-6 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                    {section.title}
                    <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {section.description}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Features */}
      <div className="border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-6">Why Soledgic?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold text-foreground mb-2">Double-Entry Accounting</h3>
            <p className="text-sm text-muted-foreground">
              Every transaction creates balanced entries. Your books always reconcile,
              with a complete audit trail.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Test & Live Modes</h3>
            <p className="text-sm text-muted-foreground">
              Develop with test API keys, then switch to live when ready.
              Data is completely isolated between modes.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Built for Platforms</h3>
            <p className="text-sm text-muted-foreground">
              Handle creator revenue splits, tax withholding, and payout scheduling
              out of the box.
            </p>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="mt-12 p-6 bg-muted/50 rounded-lg">
        <h2 className="font-semibold text-foreground mb-2">Need help?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Can&apos;t find what you&apos;re looking for? Our team is here to help.
        </p>
        <div className="flex gap-4">
          <a
            href="mailto:support@soledgic.com"
            className="text-sm text-primary hover:underline"
          >
            Contact support →
          </a>
          <Link
            href="/docs/api"
            className="text-sm text-primary hover:underline"
          >
            API Reference →
          </Link>
        </div>
      </div>
    </div>
  )
}
