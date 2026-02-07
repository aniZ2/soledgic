'use client'

import { useState } from 'react'
import { Play, Copy, Check, Loader2 } from 'lucide-react'

interface ApiTesterProps {
  apiKey: string
  step: 'creator' | 'transaction' | 'webhook'
  onSuccess?: () => void
}

const COMMANDS = {
  creator: {
    title: 'Create a Creator',
    description: 'Register a creator who will receive payouts from your platform.',
    endpoint: '/functions/v1/create-creator',
    method: 'POST',
    body: {
      creator_id: 'creator_demo_1',
      display_name: 'Demo Creator',
      email: 'demo@example.com',
      default_split_percent: 80,
    },
  },
  transaction: {
    title: 'Record a Transaction',
    description: 'Record a sale that splits revenue to the creator.',
    endpoint: '/functions/v1/record-sale',
    method: 'POST',
    body: {
      reference_id: 'sale_demo_1',
      creator_id: 'creator_demo_1',
      amount: 1000,
      description: 'Demo sale',
    },
  },
  webhook: {
    title: 'Configure a Webhook',
    description: 'Set up a webhook to receive real-time event notifications.',
    endpoint: '/functions/v1/webhooks',
    method: 'POST',
    body: {
      action: 'create',
      url: 'https://example.com/webhook',
      events: ['payout.created', 'sale.created'],
    },
  },
}

export function ApiTester({ apiKey, step, onSuccess }: ApiTesterProps) {
  const [response, setResponse] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const command = COMMANDS[step]
  const baseUrl = 'https://soledgic.supabase.co'

  const curlCommand = `curl -X ${command.method} ${baseUrl}${command.endpoint} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey || 'YOUR_API_KEY'}" \\
  -d '${JSON.stringify(command.body, null, 2)}'`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(curlCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRun = async () => {
    if (!apiKey) {
      setError('No API key available. Create a ledger first.')
      return
    }

    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch(`${baseUrl}${command.endpoint}`, {
        method: command.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(command.body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Request failed with status ${res.status}`)
      } else {
        setResponse(data)
        onSuccess?.()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">{command.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{command.description}</p>
      </div>

      <div className="p-6">
        {/* Command Preview */}
        <div className="relative">
          <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm text-foreground font-mono">
            {curlCommand}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 p-2 bg-background/80 hover:bg-background rounded transition-colors"
            title="Copy command"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Run Button */}
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleRun}
            disabled={loading || !apiKey}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {loading ? 'Running...' : 'Run in Test Mode'}
          </button>
          {!apiKey && (
            <span className="text-sm text-muted-foreground">
              Create a ledger to get an API key
            </span>
          )}
        </div>

        {/* Response */}
        {(response || error) && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-foreground mb-2">Response</h4>
            <pre className={`rounded-lg p-4 overflow-x-auto text-sm font-mono ${
              error
                ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                : 'bg-green-500/10 text-green-600 border border-green-500/20'
            }`}>
              {error || JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
