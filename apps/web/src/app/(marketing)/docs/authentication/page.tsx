import Link from 'next/link'
import { API_BASE_URL } from '../constants'

export default function AuthenticationPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Authentication</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Authenticate Soledgic resource requests with API keys.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">API Keys</h2>
        <p className="text-muted-foreground mb-4">
          Every request to the treasury API must include your key in the{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm">x-api-key</code> header.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-6">
          <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/participants \\
  -H "x-api-key: sk_test_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"participant_id": "creator_456"}'`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Test vs Live Keys</h2>
        <p className="text-muted-foreground mb-4">
          Test and live mode are isolated. Participants, wallets, holds, and payouts created with a
          test key never touch your live environment.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <h3 className="font-semibold text-amber-600 mb-2">Test Mode</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Keys start with <code className="bg-amber-500/20 px-1 rounded">sk_test_</code>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Sandbox ledger state</li>
              <li>• Safe for integration and retry testing</li>
              <li>• No live payout or billing impact</li>
            </ul>
          </div>
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <h3 className="font-semibold text-green-600 mb-2">Live Mode</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Keys start with <code className="bg-green-500/20 px-1 rounded">sk_live_</code>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Production treasury state</li>
              <li>• Real participant balances and payouts</li>
              <li>• Use only from secure server-side environments</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Keeping Keys Secure</h2>
        <p className="text-muted-foreground mb-4">
          API keys authorize money movement and treasury state changes. Treat them like production secrets.
        </p>

        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Keep keys server-side</p>
              <p className="text-sm text-muted-foreground">Never expose live keys in browser code or mobile bundles</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Store keys in environment variables</p>
              <p className="text-sm text-muted-foreground">Use your host secret manager or deployment environment settings</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Rotate keys on suspicion of exposure</p>
              <p className="text-sm text-muted-foreground">Treat compromised keys as an incident, not a cleanup task</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-red-500">✗</span>
            <div>
              <p className="font-medium text-foreground">Do not commit keys to git</p>
              <p className="text-sm text-muted-foreground">Add env files to .gitignore and protect CI logs</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Using Environment Variables</h2>
        <p className="text-muted-foreground mb-4">
          Keep the API key outside your source tree and inject it at runtime.
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">.env</p>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-slate-300">SOLEDGIC_API_KEY=sk_test_abc123...</pre>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Node.js</p>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-slate-300">
{`const apiKey = process.env.SOLEDGIC_API_KEY;

fetch('${API_BASE_URL}/v1/checkout-sessions', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    participant_id: 'creator_456',
    amount: 2999,
    currency: 'USD',
    success_url: 'https://example.com/success',
  }),
});`}
              </pre>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Python</p>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-slate-300">
{`import os
import requests

api_key = os.environ.get('SOLEDGIC_API_KEY')

response = requests.get(
    '${API_BASE_URL}/v1/wallets/creator_456',
    headers={'x-api-key': api_key},
)`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Authentication Errors</h2>
        <p className="text-muted-foreground mb-4">
          Authentication failures return a consistent envelope.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-foreground">Error</th>
                <th className="text-left py-3 px-4 font-medium text-foreground">Cause</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-3 px-4"><code className="bg-muted px-1.5 py-0.5 rounded">401</code></td>
                <td className="py-3 px-4 text-muted-foreground">Missing API key</td>
                <td className="py-3 px-4 text-muted-foreground">No x-api-key header was provided</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4"><code className="bg-muted px-1.5 py-0.5 rounded">401</code></td>
                <td className="py-3 px-4 text-muted-foreground">Invalid API key</td>
                <td className="py-3 px-4 text-muted-foreground">Key is unknown, revoked, or for a different environment</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4"><code className="bg-muted px-1.5 py-0.5 rounded">403</code></td>
                <td className="py-3 px-4 text-muted-foreground">Ledger suspended</td>
                <td className="py-3 px-4 text-muted-foreground">The owning account is suspended or inactive</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Rate Limits</h2>
        <p className="text-muted-foreground mb-4">
          Different classes of endpoints have different pressure profiles.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-foreground">Endpoint class</th>
                <th className="text-left py-3 px-4 font-medium text-foreground">Typical limit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-3 px-4 text-muted-foreground">Read endpoints</td>
                <td className="py-3 px-4 text-muted-foreground">1,000 requests/minute</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 text-muted-foreground">Treasury writes: checkout, payout, refund, hold release</td>
                <td className="py-3 px-4 text-muted-foreground">Lower burst ceilings with stricter replay protection</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-muted-foreground">Internal or webhook-driven operations</td>
                <td className="py-3 px-4 text-muted-foreground">Policy-specific</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          When rate limited, the API returns <code className="bg-muted px-1.5 py-0.5 rounded">429 Too Many Requests</code>
          and includes retry headers.
        </p>
      </section>

      <section className="border-t border-border pt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Next Steps</h2>
        <div className="flex gap-4">
          <Link
            href="/docs/api"
            className="text-primary hover:underline"
          >
            API Reference →
          </Link>
          <Link
            href="/docs/sdks"
            className="text-primary hover:underline"
          >
            SDKs & Libraries →
          </Link>
        </div>
      </section>
    </div>
  )
}
