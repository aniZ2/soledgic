import Link from 'next/link'

export default function AuthenticationPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Authentication</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Learn how to authenticate your API requests securely.
      </p>

      {/* API Keys */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">API Keys</h2>
        <p className="text-muted-foreground mb-4">
          Every request to the Soledgic API must include your API key in the <code className="bg-muted px-1.5 py-0.5 rounded text-sm">x-api-key</code> header.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-6">
          <pre className="text-sm text-slate-300">
{`curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_test_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{"creator_id": "123", "amount": 1999}'`}
          </pre>
        </div>
      </section>

      {/* Test vs Live */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Test vs Live Keys</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic provides two separate environments with their own API keys:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <h3 className="font-semibold text-amber-600 mb-2">Test Mode</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Keys start with <code className="bg-amber-500/20 px-1 rounded">sk_test_</code>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Sandbox data, no real transactions</li>
              <li>• Safe for development and testing</li>
              <li>• No billing impact</li>
            </ul>
          </div>
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <h3 className="font-semibold text-green-600 mb-2">Live Mode</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Keys start with <code className="bg-green-500/20 px-1 rounded">sk_live_</code>
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Real transactions and data</li>
              <li>• Counts toward your plan limits</li>
              <li>• Use in production only</li>
            </ul>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-sm text-amber-600">
            <strong>Important:</strong> Test and live data are completely isolated. Creators, transactions, and balances in test mode do not affect your live ledger.
          </p>
        </div>
      </section>

      {/* Security */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Keeping Keys Secure</h2>
        <p className="text-muted-foreground mb-4">
          API keys provide full access to your ledger. Follow these best practices:
        </p>

        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Use environment variables</p>
              <p className="text-sm text-muted-foreground">Never hardcode keys in your source code</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Keep keys server-side</p>
              <p className="text-sm text-muted-foreground">Never expose keys in frontend JavaScript or mobile apps</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Rotate keys if compromised</p>
              <p className="text-sm text-muted-foreground">Generate new keys immediately if you suspect exposure</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-red-500">✗</span>
            <div>
              <p className="font-medium text-foreground">Don&apos;t commit to version control</p>
              <p className="text-sm text-muted-foreground">Add your .env files to .gitignore</p>
            </div>
          </div>
        </div>
      </section>

      {/* Environment Variables */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Using Environment Variables</h2>
        <p className="text-muted-foreground mb-4">
          Store your API key in an environment variable:
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

fetch('https://api.soledgic.com/v1/record-sale', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ ... }),
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

response = requests.post(
    'https://api.soledgic.com/v1/record-sale',
    headers={'x-api-key': api_key},
    json={'creator_id': '123', 'amount': 1999}
)`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Error responses */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Authentication Errors</h2>
        <p className="text-muted-foreground mb-4">
          If authentication fails, you&apos;ll receive one of these errors:
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
                <td className="py-3 px-4 text-muted-foreground">No x-api-key header provided</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4"><code className="bg-muted px-1.5 py-0.5 rounded">401</code></td>
                <td className="py-3 px-4 text-muted-foreground">Invalid API key</td>
                <td className="py-3 px-4 text-muted-foreground">Key doesn&apos;t exist or was revoked</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4"><code className="bg-muted px-1.5 py-0.5 rounded">403</code></td>
                <td className="py-3 px-4 text-muted-foreground">Ledger suspended</td>
                <td className="py-3 px-4 text-muted-foreground">Account is suspended or canceled</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Rate limits */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Rate Limits</h2>
        <p className="text-muted-foreground mb-4">
          API requests are rate-limited to ensure fair usage:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-foreground">Endpoint</th>
                <th className="text-left py-3 px-4 font-medium text-foreground">Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-3 px-4 text-muted-foreground">All endpoints</td>
                <td className="py-3 px-4 text-muted-foreground">1,000 requests/minute</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 text-muted-foreground">record-sale</td>
                <td className="py-3 px-4 text-muted-foreground">100 requests/second</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          When rate limited, you&apos;ll receive a <code className="bg-muted px-1.5 py-0.5 rounded">429 Too Many Requests</code> response.
          The <code className="bg-muted px-1.5 py-0.5 rounded">Retry-After</code> header indicates when you can retry.
        </p>
      </section>

      {/* Next steps */}
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
