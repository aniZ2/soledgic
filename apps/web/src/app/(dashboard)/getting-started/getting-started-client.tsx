'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Monitor, Code2, CheckCircle, Circle, ArrowRight,
  Users, DollarSign, Wallet, Key, Copy, Check,
  ExternalLink, Loader2, Play
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface GettingStartedClientProps {
  ledger: {
    id: string
    business_name: string
    api_key: string
  }
  progress: {
    hasCreator: boolean
    hasTransaction: boolean
    hasPayout: boolean
  }
  initialMode?: 'dashboard' | 'developer'
  supabaseUrl: string
}

export function GettingStartedClient({
  ledger,
  progress,
  initialMode,
  supabaseUrl
}: GettingStartedClientProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'dashboard' | 'developer' | null>(initialMode || null)
  const [copied, setCopied] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Save mode preference
  const selectMode = async (selectedMode: 'dashboard' | 'developer') => {
    setMode(selectedMode)
    const supabase = createClient()
    await supabase.auth.updateUser({
      data: { onboarding_mode: selectedMode }
    })
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const testApiConnection = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/health-check`, {
        method: 'GET',
        headers: {
          'x-api-key': ledger.api_key,
        },
      })

      if (response.ok) {
        setTestResult({ success: true, message: 'API connection successful!' })
      } else {
        const data = await response.json()
        setTestResult({ success: false, message: data.error || 'Connection failed' })
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Network error - check your connection' })
    } finally {
      setTesting(false)
    }
  }

  // Mode selection screen
  if (!mode) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-foreground mb-3">Welcome to Soledgic</h1>
          <p className="text-lg text-muted-foreground">
            How would you like to use Soledgic for {ledger.business_name}?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dashboard User Option */}
          <button
            onClick={() => selectMode('dashboard')}
            className="bg-card border-2 border-border hover:border-primary rounded-xl p-8 text-left transition-all group"
          >
            <div className="w-14 h-14 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
              <Monitor className="w-7 h-7 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              I'll use the Dashboard
            </h2>
            <p className="text-muted-foreground mb-4">
              Manage creators, record transactions, and process payouts directly through the web interface. No coding required.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Add creators manually
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Record sales & income via forms
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Process payouts with one click
              </li>
            </ul>
            <div className="mt-6 flex items-center gap-2 text-primary font-medium">
              Get Started <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Developer Option */}
          <button
            onClick={() => selectMode('developer')}
            className="bg-card border-2 border-border hover:border-primary rounded-xl p-8 text-left transition-all group"
          >
            <div className="w-14 h-14 bg-purple-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-purple-500/20 transition-colors">
              <Code2 className="w-7 h-7 text-purple-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              I'll integrate via API
            </h2>
            <p className="text-muted-foreground mb-4">
              Connect Soledgic to your application via REST API. Automate transaction recording from your codebase.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Webhook integrations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Payment rail automations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Full API access
              </li>
            </ul>
            <div className="mt-6 flex items-center gap-2 text-primary font-medium">
              View API Guide <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          You can always switch between modes or use both. This just customizes your getting started experience.
        </p>
      </div>
    )
  }

  // Dashboard User Flow
  if (mode === 'dashboard') {
    const steps = [
      {
        id: 'creator',
        title: 'Add your first creator',
        description: "Register the people or businesses you'll be paying out to.",
        completed: progress.hasCreator,
        href: '/dashboard/creators/new',
        icon: Users,
      },
      {
        id: 'transaction',
        title: 'Record a transaction',
        description: 'Log income, sales, or other revenue coming into your business.',
        completed: progress.hasTransaction,
        href: '/dashboard/transactions',
        icon: DollarSign,
      },
      {
        id: 'payout',
        title: 'Process a payout',
        description: 'Pay out earnings to your creators.',
        completed: progress.hasPayout,
        href: '/dashboard/payouts',
        icon: Wallet,
      },
    ]

    const completedCount = steps.filter(s => s.completed).length
    const allComplete = completedCount === steps.length

    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Getting Started</h1>
            <p className="text-muted-foreground mt-1">
              Complete these steps to start using Soledgic
            </p>
          </div>
          <button
            onClick={() => setMode(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Switch to Developer Mode
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">{completedCount} of {steps.length} complete</span>
            {allComplete && <span className="text-green-600 font-medium">All done!</span>}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`bg-card border rounded-lg p-6 transition-all ${
                step.completed
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.completed
                    ? 'bg-green-500/20'
                    : 'bg-muted'
                }`}>
                  {step.completed ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <step.icon className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-semibold ${
                      step.completed ? 'text-green-600' : 'text-foreground'
                    }`}>
                      {step.completed ? (
                        <span className="flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          {step.title}
                        </span>
                      ) : (
                        step.title
                      )}
                    </h3>
                    {!step.completed && (
                      <Link
                        href={step.href}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Start <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {allComplete && (
          <div className="mt-8 p-6 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-2">You're all set!</h3>
            <p className="text-muted-foreground mb-4">
              You've completed the basic setup. Explore the dashboard to manage your business.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    )
  }

  // Developer Flow
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">API Integration Guide</h1>
          <p className="text-muted-foreground mt-1">
            Connect Soledgic to your application
          </p>
        </div>
        <button
          onClick={() => setMode(null)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Switch to Dashboard Mode
        </button>
      </div>

      {/* API Key Section */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Your API Key</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Use this key in the <code className="text-xs bg-muted px-1.5 py-0.5 rounded">x-api-key</code> header for all API requests.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-4 py-3 rounded-md text-sm font-mono overflow-x-auto">
            {ledger.api_key}
          </code>
          <button
            onClick={() => copyToClipboard(ledger.api_key, 'api-key')}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            {copied === 'api-key' ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <Copy className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Test Connection */}
        <div className="mt-4 pt-4 border-t border-border">
          <button
            onClick={testApiConnection}
            disabled={testing}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Test API Connection
          </button>
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Base URL */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Base URL</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-4 py-3 rounded-md text-sm font-mono">
            {supabaseUrl}/functions/v1
          </code>
          <button
            onClick={() => copyToClipboard(`${supabaseUrl}/functions/v1`, 'base-url')}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            {copied === 'base-url' ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <Copy className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Quick Examples */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Quick Examples</h2>
        </div>

        <div className="divide-y divide-border">
          {/* Record Sale */}
          <div className="p-6">
            <h3 className="font-medium text-foreground mb-2">1. Create a Creator</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Register a new creator who will receive payouts.
            </p>
            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
{`curl -X POST '${supabaseUrl}/functions/v1/create-creator' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${ledger.api_key}' \\
  -d '{
    "creator_id": "creator_123",
    "display_name": "John Smith",
    "email": "john@example.com"
  }'`}
              </pre>
              <button
                onClick={() => copyToClipboard(
                  `curl -X POST '${supabaseUrl}/functions/v1/create-creator' \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-api-key: ${ledger.api_key}' \\\n  -d '{"creator_id": "creator_123", "display_name": "John Smith", "email": "john@example.com"}'`,
                  'create-creator'
                )}
                className="absolute top-2 right-2 p-2 hover:bg-background/50 rounded"
              >
                {copied === 'create-creator' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          {/* Record Sale */}
          <div className="p-6">
            <h3 className="font-medium text-foreground mb-2">2. Record a Sale</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Record when a creator makes a sale. Amount is in cents.
            </p>
            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
{`curl -X POST '${supabaseUrl}/functions/v1/record-sale' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${ledger.api_key}' \\
  -d '{
    "reference_id": "sale_abc123",
    "creator_id": "creator_123",
    "amount": 5000,
    "description": "Product sale"
  }'`}
              </pre>
              <button
                onClick={() => copyToClipboard(
                  `curl -X POST '${supabaseUrl}/functions/v1/record-sale' \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-api-key: ${ledger.api_key}' \\\n  -d '{"reference_id": "sale_abc123", "creator_id": "creator_123", "amount": 5000, "description": "Product sale"}'`,
                  'record-sale'
                )}
                className="absolute top-2 right-2 p-2 hover:bg-background/50 rounded"
              >
                {copied === 'record-sale' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          {/* Process Payout */}
          <div className="p-6">
            <h3 className="font-medium text-foreground mb-2">3. Process a Payout</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Pay out a creator's balance.
            </p>
            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
{`curl -X POST '${supabaseUrl}/functions/v1/process-payout' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${ledger.api_key}' \\
  -d '{
    "creator_id": "creator_123",
    "amount": 4000,
    "description": "Weekly payout"
  }'`}
              </pre>
              <button
                onClick={() => copyToClipboard(
                  `curl -X POST '${supabaseUrl}/functions/v1/process-payout' \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-api-key: ${ledger.api_key}' \\\n  -d '{"creator_id": "creator_123", "amount": 4000, "description": "Weekly payout"}'`,
                  'process-payout'
                )}
                className="absolute top-2 right-2 p-2 hover:bg-background/50 rounded"
              >
                {copied === 'process-payout' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center justify-between text-sm">
        <Link
          href="/settings/api-keys"
          className="text-primary hover:underline flex items-center gap-1"
        >
          Manage API Keys <ExternalLink className="w-3 h-3" />
        </Link>
        <a
          href="/docs/api"
          className="text-primary hover:underline flex items-center gap-1"
        >
          Full API Documentation <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
