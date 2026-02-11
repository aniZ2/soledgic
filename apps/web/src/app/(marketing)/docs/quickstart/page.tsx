import Link from 'next/link'

export default function QuickstartPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Quickstart</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Get up and running with Soledgic in under 5 minutes.
      </p>

      {/* Step 1 */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</span>
          <h2 className="text-2xl font-semibold text-foreground">Create an Account</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Sign up for a Soledgic account. You&apos;ll get a test API key immediately—no credit card required.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Create Account
        </Link>
      </section>

      {/* Step 2 */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">2</span>
          <h2 className="text-2xl font-semibold text-foreground">Get Your API Keys</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          After creating your account, find your API keys in the{' '}
          <Link href="/settings/api-keys" className="text-primary hover:underline">
            Settings → API Keys
          </Link>{' '}
          section. You&apos;ll have two keys:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
          <li><code className="bg-muted px-1.5 py-0.5 rounded text-sm">sk_test_*</code> — Test mode key (sandbox data)</li>
          <li><code className="bg-muted px-1.5 py-0.5 rounded text-sm">sk_live_*</code> — Live mode key (real transactions)</li>
        </ul>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-sm text-amber-600">
            <strong>Tip:</strong> Start with your test key. All test data is isolated and won&apos;t affect your live environment.
          </p>
        </div>
      </section>

      {/* Step 3 */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">3</span>
          <h2 className="text-2xl font-semibold text-foreground">Record Your First Sale</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Make your first API call to record a sale. This creates the necessary accounts and entries automatically.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "order_123",
    "creator_id": "creator_456",
    "amount": 2999,
    "description": "Digital product sale"
  }'`}
          </pre>
        </div>
        <p className="text-muted-foreground mb-4">
          Response:
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "transaction_id": "txn_abc123",
  "breakdown": {
    "total": 29.99,
    "creator_amount": 23.99,
    "platform_amount": 6.00
  }
}`}
          </pre>
        </div>
      </section>

      {/* Step 4 */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">4</span>
          <h2 className="text-2xl font-semibold text-foreground">Check Creator Balance</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          After recording sales, check a creator&apos;s balance to see their earnings:
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X GET "https://api.soledgic.com/v1/get-balance?creator_id=creator_456" \\
  -H "x-api-key: sk_test_YOUR_API_KEY"`}
          </pre>
        </div>
        <p className="text-muted-foreground mb-4">
          Response:
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "balance": {
    "creator_id": "creator_456",
    "available": 23.99,
    "pending": 0,
    "total_earned": 23.99,
    "total_paid_out": 0,
    "currency": "USD"
  }
}`}
          </pre>
        </div>
      </section>

      {/* Step 5 */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">5</span>
          <h2 className="text-2xl font-semibold text-foreground">Process a Payout</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          When a creator is ready to be paid, initiate a payout:
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST https://api.soledgic.com/v1/process-payout \\
  -H "x-api-key: sk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creator_id": "creator_456",
    "payment_method": "stripe"
  }'`}
          </pre>
        </div>
        <p className="text-muted-foreground">
          This creates a payout record and, if you&apos;ve connected a payment rail, initiates the actual transfer.
        </p>
      </section>

      {/* Next steps */}
      <section className="border-t border-border pt-8">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Next Steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/docs/authentication"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Authentication →</h3>
            <p className="text-sm text-muted-foreground mt-1">Learn about API key security</p>
          </Link>
          <Link
            href="/docs/concepts"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Core Concepts →</h3>
            <p className="text-sm text-muted-foreground mt-1">Understand double-entry accounting</p>
          </Link>
          <Link
            href="/docs/api"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">API Reference →</h3>
            <p className="text-sm text-muted-foreground mt-1">Explore all endpoints</p>
          </Link>
          <Link
            href="/docs/webhooks"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Webhooks →</h3>
            <p className="text-sm text-muted-foreground mt-1">Set up real-time notifications</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
