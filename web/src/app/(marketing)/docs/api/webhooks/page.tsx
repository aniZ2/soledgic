import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Bell, Shield } from 'lucide-react'
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs, SoftwareSourceCodeSchema } from '@/components/seo'

export const metadata: Metadata = {
  title: 'Webhooks API - Real-time Event Notifications',
  description: 'API documentation for managing webhooks and receiving real-time event notifications in Soledgic.',
  keywords: ['webhooks', 'events', 'notifications', 'real-time', 'callbacks'],
  alternates: { canonical: '/docs/api/webhooks' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Webhooks', href: '/docs/api/webhooks' },
]

const events = [
  { name: 'transaction.created', description: 'New transaction recorded' },
  { name: 'transaction.reversed', description: 'Transaction was reversed' },
  { name: 'payout.processed', description: 'Payout sent to creator' },
  { name: 'creator.threshold_reached', description: 'Creator hit $600 1099 threshold' },
  { name: 'period.closed', description: 'Accounting period was closed' },
  { name: 'reconciliation.completed', description: 'Bank reconciliation finished' },
]

export default function WebhooksPage() {
  return (
    <>
      <TechArticleSchema headline="Webhooks API" description="Receive real-time event notifications via webhooks" slug="api/webhooks" proficiencyLevel="Advanced" datePublished="2025-01-01T00:00:00Z" timeRequired={12} articleSection="API Reference" />
      <BreadcrumbSchema items={breadcrumbItems} />
      <SoftwareSourceCodeSchema name="Webhooks API" description="Real-time event notifications" programmingLanguage="JavaScript" runtimePlatform="Node.js" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Webhooks</h1>
          <p className="text-lg text-muted-foreground">Receive <strong>real-time notifications</strong> when events occur in your ledger.</p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Available Events</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/50"><th className="text-left py-3 px-4">Event</th><th className="text-left py-3 px-4">Description</th></tr></thead>
              <tbody className="divide-y divide-border">
                {events.map(e => (
                  <tr key={e.name}><td className="py-3 px-4 font-mono text-primary">{e.name}</td><td className="py-3 px-4 text-muted-foreground">{e.description}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Register Webhook</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`curl -X POST https://api.soledgic.com/v1/webhooks \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://yourapp.com/webhooks/soledgic",
    "events": ["transaction.created", "payout.processed"],
    "secret": "whsec_your_webhook_secret"
  }'`}</code></pre>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Webhook Payload</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`{
  "id": "evt_abc123",
  "type": "transaction.created",
  "created_at": "2025-01-15T10:30:00Z",
  "data": {
    "transaction_id": "txn_xyz789",
    "type": "sale",
    "amount": 9900,
    "reference_id": "order_12345"
  }
}`}</code></pre>
          </div>
        </section>

        <section className="mb-12 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">Verify Signatures</h3>
              <p className="text-sm text-blue-800 mb-2">Always verify webhook signatures to ensure requests are from Soledgic:</p>
              <code className="text-xs bg-blue-100 px-2 py-1 rounded">X-Soledgic-Signature: sha256=...</code>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Verify Signature (Node.js)</h2>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300"><code>{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from('sha256=' + expected)
  );
}`}</code></pre>
          </div>
        </section>

        <nav className="mt-12 flex justify-between">
          <Link href="/docs/api/reconcile" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Reconcile</Link>
          <Link href="/docs/guides/marketplace" className="flex items-center gap-2 text-primary hover:underline">Marketplace Guide<ArrowRight className="h-4 w-4" /></Link>
        </nav>
      </main>
    </>
  )
}
