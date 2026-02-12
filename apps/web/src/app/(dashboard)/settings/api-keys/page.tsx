'use client'

import { useState, useEffect } from 'react'
import { Key, Copy, RefreshCw } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface Ledger {
  id: string
  business_name: string
  key_preview: string
  created_at: string
  livemode: boolean
  has_key: boolean
}

export default function ApiKeysPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [rotatingLedgerId, setRotatingLedgerId] = useState<string | null>(null)

  useEffect(() => {
    loadLedgers()
  }, [])

  const loadLedgers = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/api-keys')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load API keys')
      }

      setLedgers(data.ledgers || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  const rotateKey = async (ledgerId: string) => {
    setRotatingLedgerId(ledgerId)
    setError(null)

    try {
      const response = await fetchWithCsrf('/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify({ action: 'rotate', ledger_id: ledgerId }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rotate key')
      }

      setRevealedKeys((prev) => ({ ...prev, [ledgerId]: data.key }))
      await loadLedgers()
    } catch (err: any) {
      setError(err.message || 'Failed to rotate key')
    } finally {
      setRotatingLedgerId(null)
    }
  }

  const copyKey = async (ledgerId: string) => {
    try {
      const key = revealedKeys[ledgerId]
      if (!key) {
        throw new Error('Rotate this key first. For security, existing keys cannot be revealed.')
      }
      await navigator.clipboard.writeText(key)
      setCopiedKey(ledgerId)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to copy key')
    }
  }

  const displayedKey = (ledger: Ledger) => {
    const revealed = revealedKeys[ledger.id]
    if (revealed) return revealed
    return ledger.key_preview
  }

  const testLedgers = ledgers.filter(l => !l.livemode)
  const liveLedgers = ledgers.filter(l => l.livemode)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error && ledgers.length === 0) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4">
        {error}
      </div>
    )
  }

  const renderKeyList = (items: Ledger[]) => {
    if (items.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No ledgers found</p>
          <p className="text-sm mt-2">Create a ledger to get an API key</p>
        </div>
      )
    }

    return (
      <div className="divide-y divide-border">
        {items.map((ledger) => (
          <div key={ledger.id} className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-medium text-foreground">{ledger.business_name}</h3>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(ledger.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-4 py-2 rounded text-sm font-mono text-foreground">
                {displayedKey(ledger)}
              </code>

              <button
                onClick={() => copyKey(ledger.id)}
                disabled={!revealedKeys[ledger.id]}
                className="p-2 hover:bg-accent rounded transition-colors disabled:opacity-50"
                title={revealedKeys[ledger.id] ? 'Copy to clipboard' : 'Rotate to generate a new visible key'}
              >
                {copiedKey === ledger.id ? (
                  <span className="text-xs text-green-600">Copied!</span>
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              <button
                onClick={() => rotateKey(ledger.id)}
                disabled={rotatingLedgerId === ledger.id}
                className="p-2 hover:bg-accent rounded transition-colors disabled:opacity-50"
                title="Rotate API key"
              >
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${rotatingLedgerId === ledger.id ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">API Keys</h1>
        <p className="text-muted-foreground mt-1">
          Use these keys to authenticate API requests
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-8">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Keep your API keys secure.</strong> Existing keys are never revealed again. Rotate to generate a new key and copy it immediately.
        </p>
      </div>

      <div className="bg-card border border-amber-500/30 rounded-lg overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-amber-500/30 bg-amber-500/5">
          <h2 className="text-lg font-semibold text-amber-600">Test API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Test keys create sandbox data. No billing impact.
          </p>
        </div>
        {renderKeyList(testLedgers)}
      </div>

      <div className="bg-card border border-green-500/30 rounded-lg overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-green-500/30 bg-green-500/5">
          <h2 className="text-lg font-semibold text-green-600">Live API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live keys affect real data and count toward billing.
          </p>
        </div>
        {renderKeyList(liveLedgers)}
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Usage Example</h3>
        <div className="bg-muted rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-foreground">
{`curl -X POST https://soledgic.supabase.co/functions/v1/record-sale \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "reference_id": "sale_123",
    "creator_id": "creator_1",
    "amount": 2999
  }'`}
          </pre>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-2">TypeScript SDK</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Install our SDK for type-safe API access
          </p>
          <code className="text-sm bg-muted px-3 py-2 rounded block">
            npm install @soledgic/sdk
          </code>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-2">API Documentation</h3>
          <p className="text-sm text-muted-foreground mb-4">
            View full API reference and examples
          </p>
          <a
            href="/docs/api"
            className="text-sm text-primary hover:underline"
          >
            View documentation →
          </a>
        </div>
      </div>
    </div>
  )
}
