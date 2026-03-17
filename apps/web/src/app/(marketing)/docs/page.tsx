import Link from 'next/link'
import { BookOpen, Key, Code, Lightbulb, Bell, Package, ArrowRight } from 'lucide-react'
import { API_BASE_URL } from './constants'

const sections = [
  {
    title: 'Quickstart',
    description: 'Create a participant, launch checkout, inspect balances, and send payouts',
    href: '/docs/quickstart',
    icon: BookOpen,
  },
  {
    title: 'Authentication',
    description: 'Authenticate resource requests with API keys and environment isolation',
    href: '/docs/authentication',
    icon: Key,
  },
  {
    title: 'Core Concepts',
    description: 'Understand the resource layer, ledger guarantees, holds, and replay safety',
    href: '/docs/concepts',
    icon: Lightbulb,
  },
  {
    title: 'API Reference',
    description: 'Generated reference for treasury resources and supporting accounting APIs',
    href: '/docs/api',
    icon: Code,
  },
  {
    title: 'Webhooks',
    description: 'Receive checkout, payout, and refund events from the platform',
    href: '/docs/webhooks',
    icon: Bell,
  },
  {
    title: 'SDKs & Libraries',
    description: 'Use the TypeScript SDK or integrate directly over REST',
    href: '/docs/sdks',
    icon: Package,
  },
]

export default function DocsPage() {
  return (
    <div>
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Soledgic Documentation
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl">
          Treasury infrastructure for platforms. Model participants, balances, holds, checkout
          sessions, payouts, refunds, reconciliations, fraud checks, compliance monitoring, and
          tax workflows on top of a ledger-native core.
        </p>
      </div>

      <div className="bg-slate-900 rounded-lg p-6 mb-12 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-slate-400">Create your first participant</span>
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">POST</span>
        </div>
        <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/participants \\
  -H "x-api-key: slk_test_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "participant_id": "creator_456",
    "display_name": "Jane Creator",
    "email": "jane@example.com",
    "default_split_percent": 80
  }'`}
        </pre>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6 mb-12">
        <h2 className="text-lg font-semibold text-foreground mb-2">Resource Flow</h2>
        <div className="bg-card border border-border rounded-lg p-4 mb-4 overflow-x-auto">
          <pre className="text-sm text-muted-foreground">
{`participant
  -> checkout_session
  -> wallet balance / hold
  -> payout
  -> refund

reconciliations
  -> fraud evaluation
  -> compliance monitoring
  -> tax documents / summaries`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground">
          The public API is resource-first. Edge functions validate and route requests into shared
          treasury services, and those services commit balanced ledger writes through PostgreSQL RPCs.
          <Link href="/docs/concepts#architecture" className="text-primary hover:underline ml-1">
            See the architecture details
          </Link>
        </p>
      </div>

      <div className="mb-12 rounded-lg border border-slate-500/20 bg-slate-500/10 p-4">
        <p className="text-sm text-slate-700">
          Shared identity, participant linking, ecosystems, and fixture cleanup are operator control-plane features.
          They require authenticated dashboard sessions and are intentionally excluded from the public `/v1` API reference
          and the TypeScript SDK.
        </p>
      </div>

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

      <div className="border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-6">Why Soledgic?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold text-foreground mb-2">Resource-First Treasury API</h3>
            <p className="text-sm text-muted-foreground">
              Participants, wallets, holds, checkouts, payouts, refunds, reconciliations,
              fraud evaluation, compliance monitoring, and tax resources are the canonical
              public surface for new integrations.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Ledger Guarantees</h3>
            <p className="text-sm text-muted-foreground">
              Money movement maps to balanced entries and atomic database writes. The ledger either
              commits the full state change or nothing.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Built for Platform Economies</h3>
            <p className="text-sm text-muted-foreground">
              Model delayed release policies, creator balances, internal transfers, and payout
              schedules without bolting treasury logic onto a checkout API.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-12 p-6 bg-muted/50 rounded-lg">
        <h2 className="font-semibold text-foreground mb-2">Need help?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Start with the quickstart, then move into the API reference once your participant and
          checkout model is clear.
        </p>
        <div className="flex gap-4">
          <Link
            href="/docs/quickstart"
            className="text-sm text-primary hover:underline"
          >
            Quickstart →
          </Link>
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
