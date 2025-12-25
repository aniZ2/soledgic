import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight, Shield, Key, AlertTriangle, Check } from 'lucide-react'
import { 
  TechArticleSchema, 
  BreadcrumbSchema, 
  Breadcrumbs,
} from '@/components/seo'

export const metadata: Metadata = {
  title: 'Authentication - API Key Security',
  description: 'Learn how to authenticate with the Soledgic API using API keys. Includes security best practices, key rotation, and environment management.',
  keywords: ['API authentication', 'API keys', 'security', 'authorization', 'Soledgic API'],
  alternates: { canonical: '/docs/authentication' },
}

const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Authentication', href: '/docs/authentication' },
]

export default function AuthenticationPage() {
  return (
    <>
      <TechArticleSchema
        headline="Soledgic API Authentication"
        description="Learn how to authenticate with the Soledgic API using API keys and implement security best practices."
        slug="authentication"
        proficiencyLevel="Beginner"
        datePublished="2025-01-01T00:00:00Z"
        timeRequired={8}
        keywords={['authentication', 'API keys', 'security', 'authorization']}
        articleSection="Getting Started"
      />
      <BreadcrumbSchema items={breadcrumbItems} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Authentication</h1>
          <p className="text-lg text-muted-foreground">
            Secure your API requests with <strong>API key authentication</strong>.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Key className="w-4 h-4" />
              8 min read
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
              Beginner
            </span>
          </div>
        </header>

        {/* API Key Overview */}
        <section className="mb-12" aria-labelledby="overview">
          <h2 id="overview" className="text-2xl font-semibold text-foreground mb-4">API Key Overview</h2>
          <p className="text-muted-foreground mb-4">
            Soledgic uses <strong>API keys</strong> to authenticate requests. Each ledger has its own unique API key
            that grants full access to that ledger's data.
          </p>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-2">API keys follow this format:</p>
            <code className="block bg-muted px-3 py-2 rounded font-mono text-sm">
              sk_live_a1b2c3d4e5f6g7h8i9j0...
            </code>
          </div>
        </section>

        {/* Using Your API Key */}
        <section className="mb-12" aria-labelledby="usage">
          <h2 id="usage" className="text-2xl font-semibold text-foreground mb-4">Using Your API Key</h2>
          <p className="text-muted-foreground mb-4">
            Include your API key in the <code className="px-1.5 py-0.5 bg-muted rounded text-sm">x-api-key</code> header 
            with every request.
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mb-4">
            <pre className="text-sm text-gray-300">
              <code>{`curl https://api.soledgic.com/v1/trial-balance \\
  -H "x-api-key: sk_live_your_api_key_here"`}</code>
            </pre>
          </div>
          <p className="text-muted-foreground">
            Or in JavaScript/TypeScript:
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mt-4">
            <pre className="text-sm text-gray-300">
              <code>{`const response = await fetch('https://api.soledgic.com/v1/trial-balance', {
  headers: {
    'x-api-key': process.env.SOLEDGIC_API_KEY,
    'Content-Type': 'application/json',
  },
});`}</code>
            </pre>
          </div>
        </section>

        {/* Security Best Practices */}
        <section className="mb-12" aria-labelledby="security">
          <h2 id="security" className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Security Best Practices
          </h2>
          
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">✓ Store keys in environment variables</h3>
              <p className="text-sm text-muted-foreground">
                Never hardcode API keys in your source code. Use environment variables or a secrets manager.
              </p>
              <div className="bg-[#1e1e1e] rounded-lg p-3 mt-3 overflow-x-auto">
                <pre className="text-sm text-gray-300">
                  <code>{`# .env.local (never commit this file)
SOLEDGIC_API_KEY=sk_live_your_api_key_here`}</code>
                </pre>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">✓ Use server-side requests only</h3>
              <p className="text-sm text-muted-foreground">
                Never expose your API key in client-side code. All Soledgic API calls should be made from your backend.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">✓ Rotate keys periodically</h3>
              <p className="text-sm text-muted-foreground">
                Generate new API keys every 90 days. You can have multiple active keys during rotation.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2">✓ Use separate keys for environments</h3>
              <p className="text-sm text-muted-foreground">
                Create separate ledgers (and keys) for development, staging, and production.
              </p>
            </div>
          </div>
        </section>

        {/* Warning Box */}
        <section className="mb-12 p-4 bg-red-50 border border-red-200 rounded-lg" aria-labelledby="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 id="warning" className="font-semibold text-red-900">If your API key is compromised</h3>
              <ol className="text-sm text-red-800 mt-2 space-y-1 list-decimal list-inside">
                <li>Immediately rotate to a new key in your dashboard</li>
                <li>Update all applications using the compromised key</li>
                <li>Review your audit log for unauthorized activity</li>
                <li>Contact support if you notice suspicious transactions</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Error Responses */}
        <section className="mb-12" aria-labelledby="errors">
          <h2 id="errors" className="text-2xl font-semibold text-foreground mb-4">Authentication Errors</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Error</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Solution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">401</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Missing API key</td>
                  <td className="py-3 px-4 text-muted-foreground">Add x-api-key header</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">401</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Invalid API key</td>
                  <td className="py-3 px-4 text-muted-foreground">Check key is correct and active</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">403</code></td>
                  <td className="py-3 px-4 text-muted-foreground">API key revoked</td>
                  <td className="py-3 px-4 text-muted-foreground">Generate a new key in dashboard</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="text-red-600">429</code></td>
                  <td className="py-3 px-4 text-muted-foreground">Rate limit exceeded</td>
                  <td className="py-3 px-4 text-muted-foreground">Wait and retry with backoff</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Rate Limits */}
        <section className="mb-12" aria-labelledby="rate-limits">
          <h2 id="rate-limits" className="text-2xl font-semibold text-foreground mb-4">Rate Limits</h2>
          <p className="text-muted-foreground mb-4">
            API requests are rate-limited per API key to ensure fair usage:
          </p>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <strong>Pro:</strong> 100 requests/minute
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <strong>Business:</strong> 500 requests/minute
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <strong>Scale:</strong> 2,000 requests/minute
            </li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4">
            Rate limit headers are included in every response:
          </p>
          <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto mt-2">
            <pre className="text-sm text-gray-300">
              <code>{`X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1703980800`}</code>
            </pre>
          </div>
        </section>

        {/* Navigation */}
        <nav className="mt-12 flex justify-between" aria-label="Documentation navigation">
          <Link href="/docs/quickstart" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Quickstart
          </Link>
          <Link href="/docs/concepts" className="flex items-center gap-2 text-primary hover:underline">
            Core Concepts
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </main>
    </>
  )
}
