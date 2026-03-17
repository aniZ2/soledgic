import Link from 'next/link'
import { API_BASE_URL } from '../constants'

export default function QuickstartPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Quickstart</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Get a platform treasury flow running in a few requests.
      </p>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">1</span>
          <h2 className="text-2xl font-semibold text-foreground">Create an Account</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Sign up for Soledgic and start in test mode. Test and live ledgers are isolated from each other.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Create Account
        </Link>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">2</span>
          <h2 className="text-2xl font-semibold text-foreground">Get Your API Key</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Grab your key from{' '}
          <Link href="/settings/api-keys" className="text-primary hover:underline">
            Settings → API Keys
          </Link>
          . Use <code className="bg-muted px-1.5 py-0.5 rounded text-sm">slk_test_*</code> while you are integrating.
        </p>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">3</span>
          <h2 className="text-2xl font-semibold text-foreground">Create a Participant</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Participants are the treasury identities that receive balances, holds, transfers, and payouts.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/participants \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "participant_id": "creator_456",
    "display_name": "Jane Creator",
    "email": "jane@example.com",
    "default_split_percent": 80
  }'`}
          </pre>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "participant": {
    "id": "creator_456",
    "account_id": "0e8e3fd8-7b7c-4f41-8b62-4a95a9fd6a30",
    "display_name": "Jane Creator",
    "email": "jane@example.com",
    "default_split_percent": 80
  }
}`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">4</span>
          <h2 className="text-2xl font-semibold text-foreground">Create a Checkout Session</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Checkouts book the commercial flow while the ledger records the downstream treasury state.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/checkout-sessions \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "participant_id": "creator_456",
    "amount": 2999,
    "currency": "USD",
    "product_name": "Premium asset pack",
    "success_url": "https://example.com/success",
    "cancel_url": "https://example.com/cancel"
  }'`}
          </pre>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "checkout_session": {
    "id": "chk_abc123",
    "mode": "session",
    "checkout_url": "https://checkout.example/session/chk_abc123",
    "status": "pending",
    "amount": 2999,
    "currency": "USD"
  }
}`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">5</span>
          <h2 className="text-2xl font-semibold text-foreground">Inspect Wallet and Holds</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Once payment settles, inspect the wallet objects for that owner and any active hold state separately.
        </p>
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-slate-300">
{`curl -X GET "${API_BASE_URL}/v1/wallets?owner_id=creator_456&wallet_type=creator_earnings" \\
  -H "x-api-key: slk_test_YOUR_API_KEY"`}
            </pre>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-slate-300">
{`curl -X GET "${API_BASE_URL}/v1/holds?participant_id=creator_456" \\
  -H "x-api-key: slk_test_YOUR_API_KEY"`}
            </pre>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">6</span>
          <h2 className="text-2xl font-semibold text-foreground">Check Eligibility and Create a Payout</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Payout creation is separate from hold release and balance inspection, which keeps the treasury flow explicit.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X GET "${API_BASE_URL}/v1/participants/creator_456/payout-eligibility" \\
  -H "x-api-key: slk_test_YOUR_API_KEY"`}
          </pre>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/payouts \\
  -H "x-api-key: slk_test_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "participant_id": "creator_456",
    "reference_id": "payout_2026_03_12_001",
    "amount": 1500,
    "payout_method": "card"
  }'`}
          </pre>
        </div>
        <p className="text-muted-foreground">
          Use a unique <code className="bg-muted px-1.5 py-0.5 rounded text-sm">reference_id</code> for payouts and transfers.
          Today that is the replay-safe key for those treasury writes.
        </p>
      </section>

      <section className="border-t border-border pt-8">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Next Steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/docs/authentication"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Authentication →</h3>
            <p className="text-sm text-muted-foreground mt-1">Secure your API key usage and environment setup</p>
          </Link>
          <Link
            href="/docs/concepts"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Core Concepts →</h3>
            <p className="text-sm text-muted-foreground mt-1">Understand holds, wallets, and ledger guarantees</p>
          </Link>
          <Link
            href="/docs/api"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">API Reference →</h3>
            <p className="text-sm text-muted-foreground mt-1">See the generated request and response shapes</p>
          </Link>
          <Link
            href="/docs/webhooks"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Webhooks →</h3>
            <p className="text-sm text-muted-foreground mt-1">Consume payout, refund, and checkout events</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
