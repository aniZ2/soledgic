'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Key, Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'

interface Ledger {
  id: string
  business_name: string
  api_key: string
  created_at: string
  livemode: boolean
}

export default function ApiKeysPage() {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    loadLedgers()
  }, [])

  const loadLedgers = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    // Fetch ALL ledgers — both test and live — no livemode filter
    const { data } = await supabase
      .from('ledgers')
      .select('id, business_name, api_key, created_at, livemode')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    setLedgers(data || [])
    setLoading(false)
  }

  const toggleKeyVisibility = (ledgerId: string) => {
    const newVisible = new Set(visibleKeys)
    if (newVisible.has(ledgerId)) {
      newVisible.delete(ledgerId)
    } else {
      newVisible.add(ledgerId)
    }
    setVisibleKeys(newVisible)
  }

  const copyKey = async (key: string, ledgerId: string) => {
    await navigator.clipboard.writeText(key)
    setCopiedKey(ledgerId)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const maskKey = (key: string) => {
    if (!key) return '—'
    return key.substring(0, 10) + '•'.repeat(20) + key.substring(key.length - 4)
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
                {visibleKeys.has(ledger.id) ? ledger.api_key : maskKey(ledger.api_key)}
              </code>

              <button
                onClick={() => toggleKeyVisibility(ledger.id)}
                className="p-2 hover:bg-accent rounded transition-colors"
                title={visibleKeys.has(ledger.id) ? 'Hide key' : 'Show key'}
              >
                {visibleKeys.has(ledger.id) ? (
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Eye className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              <button
                onClick={() => copyKey(ledger.api_key, ledger.id)}
                className="p-2 hover:bg-accent rounded transition-colors"
                title="Copy to clipboard"
              >
                {copiedKey === ledger.id ? (
                  <span className="text-xs text-green-600">Copied!</span>
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
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

      {/* Security Notice */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-8">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Keep your API keys secure.</strong> Do not share them publicly or commit them to version control.
          Use environment variables in your applications.
        </p>
      </div>

      {/* Test API Keys */}
      <div className="bg-card border border-amber-500/30 rounded-lg overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-amber-500/30 bg-amber-500/5">
          <h2 className="text-lg font-semibold text-amber-600">Test API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Test keys create sandbox data. No billing impact.
          </p>
        </div>
        {renderKeyList(testLedgers)}
      </div>

      {/* Live API Keys */}
      <div className="bg-card border border-green-500/30 rounded-lg overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-green-500/30 bg-green-500/5">
          <h2 className="text-lg font-semibold text-green-600">Live API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live keys affect real data and count toward billing.
          </p>
        </div>
        {renderKeyList(liveLedgers)}
      </div>

      {/* Usage Example */}
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

      {/* SDK Links */}
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
