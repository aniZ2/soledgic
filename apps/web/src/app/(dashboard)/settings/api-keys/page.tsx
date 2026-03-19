'use client'

import { useState, useEffect, useCallback } from 'react'
import { Key, Copy, RefreshCw, Plus, Trash2, Shield } from 'lucide-react'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { useLivemode } from '@/components/livemode-provider'

interface Ledger {
  id: string
  business_name: string
  key_preview: string
  created_at: string
  livemode: boolean
  has_key: boolean
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function ApiKeysPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [rotatingLedgerId, setRotatingLedgerId] = useState<string | null>(null)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load API keys'))
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
        if (handleProtectedResponse(response, data, () => rotateKey(ledgerId))) {
          return
        }
        throw new Error(data.error || 'Failed to rotate key')
      }

      setRevealedKeys((prev) => ({ ...prev, [ledgerId]: data.key }))
      await loadLedgers()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to rotate key'))
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to copy key'))
    }
  }

  const displayedKey = (ledger: Ledger) => {
    const revealed = revealedKeys[ledger.id]
    if (revealed) return revealed
    return ledger.key_preview
  }

  const livemode = useLivemode()
  const testLedgers = ledgers.filter(l => !l.livemode)
  const liveLedgers = ledgers.filter(l => l.livemode)
  const activeLedgers = livemode ? liveLedgers : testLedgers

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

      <div className={`bg-card border ${livemode ? 'border-green-500/30' : 'border-amber-500/30'} rounded-lg overflow-hidden mb-8`}>
        <div className={`px-6 py-4 border-b ${livemode ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <h2 className={`text-lg font-semibold ${livemode ? 'text-green-600' : 'text-amber-600'}`}>
            {livemode ? 'Live API Keys' : 'Test API Keys'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {livemode ? 'Live keys affect real data and count toward billing.' : 'Test keys create sandbox data. No billing impact.'}
          </p>
        </div>
        {renderKeyList(activeLedgers)}
      </div>

      {/* Scoped Keys — filtered to current mode */}
      <ScopedKeysSection ledgers={activeLedgers} />

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Usage Example</h3>
        <div className="bg-muted rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-foreground">
{`curl -X POST https://soledgic.supabase.co/functions/v1/checkout-sessions \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "participant_id": "creator_1",
    "amount": 2999,
    "product_name": "Premium product",
    "success_url": "https://example.com/success"
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

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}

// ── Scoped Keys Section ─────────────────────────────────────────────

const SCOPE_OPTIONS = [
  { value: 'payments', label: 'Payments', desc: 'Checkout, sales, refunds' },
  { value: 'payouts', label: 'Payouts', desc: 'Execute and manage payouts' },
  { value: 'read', label: 'Read Only', desc: 'Reports, balances, transactions' },
  { value: 'webhooks', label: 'Webhooks', desc: 'Manage webhook endpoints' },
  { value: 'creators', label: 'Creators', desc: 'Participants, tax info, delete' },
  { value: 'credits', label: 'Credits', desc: 'Issue, convert, redeem credits' },
]

interface ScopedKey {
  id: string
  name: string
  preview: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
}

function ScopedKeysSection({ ledgers }: { ledgers: Ledger[] }) {
  const [scopedKeys, setScopedKeys] = useState<ScopedKey[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState(ledgers[0]?.id || '')
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadScopedKeys = useCallback(async () => {
    if (!selectedLedger) return
    setLoading(true)
    try {
      const res = await fetchWithCsrf('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_scoped', ledger_id: selectedLedger }),
      })
      const data = await res.json()
      if (res.ok) setScopedKeys(data.keys || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [selectedLedger])

  useEffect(() => { loadScopedKeys() }, [loadScopedKeys])

  const handleCreate = async () => {
    if (!newKeyName || newKeyScopes.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetchWithCsrf('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_scoped',
          ledger_id: selectedLedger,
          name: newKeyName,
          scopes: newKeyScopes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCreatedKey(data.key)
      setNewKeyName('')
      setNewKeyScopes([])
      setShowCreate(false)
      await loadScopedKeys()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    }
    setCreating(false)
  }

  const handleRevoke = async (keyId: string) => {
    try {
      await fetchWithCsrf('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_scoped', ledger_id: selectedLedger, key_id: keyId }),
      })
      await loadScopedKeys()
    } catch { /* ignore */ }
  }

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    )
  }

  return (
    <div className="bg-card border border-purple-500/30 rounded-lg overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-purple-500/30 bg-purple-500/5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-purple-600 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Scoped API Keys
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Restricted keys for specific operations — limit blast radius if compromised
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
        >
          <Plus className="w-4 h-4" />
          Create Scoped Key
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-600">
          {error}
        </div>
      )}

      {createdKey && (
        <div className="mx-6 mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">New key created — copy it now (it won{"'"}t be shown again):</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background px-3 py-2 rounded text-sm font-mono border border-border break-all">{createdKey}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(createdKey); setCreatedKey(null) }}
              className="p-2 hover:bg-accent rounded"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="mx-6 mt-4 p-4 border border-border rounded-lg space-y-4">
          {ledgers.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Ledger</label>
              <select
                value={selectedLedger}
                onChange={e => setSelectedLedger(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
              >
                {ledgers.map(l => (
                  <option key={l.id} value={l.id}>{l.business_name} ({l.livemode ? 'live' : 'test'})</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Key Name</label>
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="e.g. Frontend checkout, Analytics dashboard"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Scopes</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {SCOPE_OPTIONS.map(scope => (
                <button
                  key={scope.value}
                  onClick={() => toggleScope(scope.value)}
                  className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                    newKeyScopes.includes(scope.value)
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-purple-500/50'
                  }`}
                >
                  <p className="font-medium">{scope.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">{scope.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newKeyName || newKeyScopes.length === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Key'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="p-6">
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
        ) : scopedKeys.length === 0 ? (
          <div className="text-center py-8">
            <Key className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No scoped keys yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create restricted keys for specific use cases</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scopedKeys.map(key => (
              <div key={key.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium text-foreground text-sm">{key.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{key.preview}</code>
                    <div className="flex gap-1">
                      {key.scopes.map(s => (
                        <span key={s} className="text-xs bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  className="p-2 hover:bg-red-500/10 rounded transition-colors"
                  title="Revoke key"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
