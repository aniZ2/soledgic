'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Key, Copy, Check, ExternalLink, Loader2,
  CheckCircle, XCircle, ArrowRight, ArrowLeft,
  Globe, Webhook, Zap, SkipForward, Trash2, Pencil, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { callLedgerFunction } from '@/lib/ledger-functions-client'

const EVENT_TYPES = [
  { value: '*', label: 'All Events' },
  { value: 'checkout.completed', label: 'Checkout Completed' },
  { value: 'refund.created', label: 'Refund Created' },
  { value: 'sale.refunded', label: 'Sale Refunded' },
  { value: 'payout.created', label: 'Payout Created' },
  { value: 'payout.executed', label: 'Payout Executed' },
  { value: 'payout.failed', label: 'Payout Failed' },
]

interface ConnectWizardProps {
  ledger: { id: string; business_name: string }
  apiKeyPreview: string | null
  hasApiKey: boolean
  supabaseUrl: string
  wizardCompleted: boolean
  existingWebhookCount: number
}

export function ConnectWizardClient({
  ledger,
  apiKeyPreview,
  hasApiKey,
  supabaseUrl,
  wizardCompleted,
  existingWebhookCount,
}: ConnectWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [copied, setCopied] = useState<string | null>(null)

  // Step 2 state
  const [existingWebhooks, setExistingWebhooks] = useState<
    { id: string; url: string; events: string[]; is_active: boolean; created_at: string }[]
  >([])
  const [loadingWebhooks, setLoadingWebhooks] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [editEvents, setEditEvents] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['*'])
  const [creatingWebhook, setCreatingWebhook] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null)
  const [createdEndpointId, setCreatedEndpointId] = useState<string | null>(null)
  const [webhookSkipped, setWebhookSkipped] = useState(false)

  // Step 3 state
  const [runningTests, setRunningTests] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<'pass' | 'fail' | null>(null)
  const [webhookTestResult, setWebhookTestResult] = useState<'pass' | 'fail' | null>(null)
  const [completing, setCompleting] = useState(false)

  const baseUrl = `${supabaseUrl}/functions/v1`

  const fetchWebhooks = useCallback(async () => {
    setLoadingWebhooks(true)
    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'list' },
      })
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setExistingWebhooks(json.data)
      }
    } catch { /* ignore */ }
    setLoadingWebhooks(false)
  }, [ledger.id])

  useEffect(() => {
    if (step === 2) fetchWebhooks()
  }, [step, fetchWebhooks])

  const deleteWebhook = async (endpointId: string) => {
    setDeletingId(endpointId)
    try {
      await callLedgerFunction('webhooks', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'delete', endpoint_id: endpointId },
      })
      setExistingWebhooks((prev) => prev.filter((w) => w.id !== endpointId))
    } catch { /* ignore */ }
    setDeletingId(null)
  }

  const startEditing = (wh: typeof existingWebhooks[number]) => {
    setEditingWebhook(wh.id)
    setEditUrl(wh.url)
    setEditEvents(wh.events || ['*'])
    setWebhookError(null)
  }

  const cancelEditing = () => {
    setEditingWebhook(null)
    setEditUrl('')
    setEditEvents([])
    setWebhookError(null)
  }

  const toggleEditEvent = (value: string) => {
    if (value === '*') {
      setEditEvents(editEvents.includes('*') ? [] : ['*'])
      return
    }
    const withoutAll = editEvents.filter(e => e !== '*')
    if (withoutAll.includes(value)) {
      setEditEvents(withoutAll.filter(e => e !== value))
    } else {
      setEditEvents([...withoutAll, value])
    }
  }

  const saveEdit = async () => {
    if (!editingWebhook || !editUrl.trim() || editEvents.length === 0) return
    setSavingEdit(true)
    setWebhookError(null)
    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId: ledger.id,
        method: 'POST',
        body: {
          action: 'update',
          endpoint_id: editingWebhook,
          url: editUrl.trim(),
          events: editEvents,
        },
      })
      const data = await res.json()
      if (!res.ok || data?.success === false) {
        setWebhookError(data.error || 'Failed to update webhook')
        setSavingEdit(false)
        return
      }
      setEditingWebhook(null)
      fetchWebhooks()
    } catch {
      setWebhookError('Network error — check your connection')
    }
    setSavingEdit(false)
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleEvent = (value: string) => {
    if (value === '*') {
      setSelectedEvents(selectedEvents.includes('*') ? [] : ['*'])
      return
    }
    // Deselect "All Events" when toggling individual events
    const withoutAll = selectedEvents.filter(e => e !== '*')
    if (withoutAll.includes(value)) {
      setSelectedEvents(withoutAll.filter(e => e !== value))
    } else {
      setSelectedEvents([...withoutAll, value])
    }
  }

  const createWebhook = async () => {
    if (!webhookUrl.trim()) return
    setCreatingWebhook(true)
    setWebhookError(null)

    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId: ledger.id,
        method: 'POST',
        body: {
          action: 'create',
          url: webhookUrl.trim(),
          events: selectedEvents,
        },
      })

      const data = await res.json()

      if (!res.ok) {
        setWebhookError(data.error || 'Failed to create webhook endpoint')
        return
      }

      setWebhookSecret(data.secret || null)
      setCreatedEndpointId(data.id || data.endpoint_id || null)
      fetchWebhooks()
    } catch {
      setWebhookError('Network error — check your connection')
    } finally {
      setCreatingWebhook(false)
    }
  }

  const runTests = async () => {
    setRunningTests(true)
    setApiTestResult(null)
    setWebhookTestResult(null)

    // Test 1: API connectivity
    try {
      const res = await callLedgerFunction('health-check', {
        ledgerId: ledger.id,
        method: 'GET',
      })
      setApiTestResult(res.ok ? 'pass' : 'fail')
    } catch {
      setApiTestResult('fail')
    }

    // Test 2: Webhook delivery (only if webhook was created)
    if (createdEndpointId && !webhookSkipped) {
      try {
        const res = await callLedgerFunction('webhooks', {
          ledgerId: ledger.id,
          method: 'POST',
          body: {
            action: 'test',
            endpoint_id: createdEndpointId,
          },
        })
        setWebhookTestResult(res.ok ? 'pass' : 'fail')
      } catch {
        setWebhookTestResult('fail')
      }
    }

    setRunningTests(false)
  }

  const completeSetup = async () => {
    setCompleting(true)
    try {
      const supabase = createClient()
      await supabase.auth.updateUser({
        data: { connect_wizard_completed: true },
      })
      router.replace('/dashboard')
    } catch {
      setCompleting(false)
    }
  }

  const hasWebhook = createdEndpointId && !webhookSkipped
  const testsRan = apiTestResult !== null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Connect Your Platform</h1>
        <p className="text-muted-foreground mt-1">
          Set up your API integration for {ledger.business_name}
        </p>
        {wizardCompleted && (
          <p className="text-sm text-green-600 mt-2">
            Setup completed previously — you can re-run tests or add webhooks.
          </p>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <button
              onClick={() => setStep(s)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step >= s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step > s ? <Check className="w-4 h-4" /> : s}
            </button>
            {s < 3 && (
              <div
                className={`w-16 h-0.5 ${
                  step > s ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-8 mb-8 text-sm text-muted-foreground">
        <span className={step === 1 ? 'text-foreground font-medium' : ''}>API Keys</span>
        <span className={step === 2 ? 'text-foreground font-medium' : ''}>Webhooks</span>
        <span className={step === 3 ? 'text-foreground font-medium' : ''}>Test</span>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* Step 1: API Keys                                  */}
      {/* ══════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Test mode banner */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            You&apos;re in test mode. API keys here are for testing only and won&apos;t process real payments.
          </div>

          {/* API Key Preview */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Your API Key</h2>
            </div>

            {hasApiKey ? (
              <>
                <div className="bg-muted rounded-md px-4 py-3 font-mono text-sm mb-3">
                  {apiKeyPreview}
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  For security, API keys are masked. Visit Settings to rotate or generate a new key.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                No API key configured yet. Generate one in Settings to authenticate your requests.
              </p>
            )}

            <Link
              href="/settings/api-keys"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              Manage API Keys <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {/* Base URL */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Base URL</h2>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-4 py-3 rounded-md text-sm font-mono break-all">
                {baseUrl}
              </code>
              <button
                onClick={() => copyToClipboard(baseUrl, 'base-url')}
                className="p-2 hover:bg-muted rounded-md transition-colors flex-shrink-0"
              >
                {copied === 'base-url' ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              All API requests are sent to this base URL with your API key in the <code className="text-xs bg-muted px-1.5 py-0.5 rounded">x-api-key</code> header.
            </p>
          </div>

          {/* Test vs Live explanation */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">Test vs Live Mode</h3>
            <p className="text-sm text-muted-foreground">
              Test mode uses <code className="text-xs bg-muted px-1.5 py-0.5 rounded">sk_test_</code> keys and a separate dataset. Switch to live mode from the sidebar toggle when you&apos;re ready for production.
            </p>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* Step 2: Webhooks                                  */}
      {/* ══════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Webhook className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Set Up Webhooks</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Webhooks notify your application in real time when events happen — like completed checkouts, payouts, or refunds.
              {existingWebhooks.length > 0 && (
                <span className="block mt-1 text-green-600">
                  You have {existingWebhooks.length} active webhook endpoint{existingWebhooks.length !== 1 ? 's' : ''}.
                </span>
              )}
            </p>

            {/* Existing webhooks list */}
            {loadingWebhooks ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading webhooks...
              </div>
            ) : existingWebhooks.length > 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-sm font-medium text-foreground mb-2">Active Endpoints</h3>
                {existingWebhooks.map((wh) =>
                  editingWebhook === wh.id ? (
                    <div key={wh.id} className="px-4 py-4 bg-muted/50 rounded-lg space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">URL</label>
                        <input
                          type="url"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="w-full border border-border rounded-md py-1.5 px-2.5 bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">Events</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {EVENT_TYPES.map((event) => (
                            <label
                              key={event.value}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border cursor-pointer transition-colors text-xs ${
                                editEvents.includes(event.value)
                                  ? 'border-primary bg-primary/5 text-foreground'
                                  : 'border-border hover:border-primary/50 text-muted-foreground'
                              } ${event.value === '*' ? 'col-span-2' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={editEvents.includes(event.value)}
                                onChange={() => toggleEditEvent(event.value)}
                                className="sr-only"
                              />
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                                editEvents.includes(event.value)
                                  ? 'bg-primary border-primary'
                                  : 'border-border'
                              }`}>
                                {editEvents.includes(event.value) && (
                                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                                )}
                              </div>
                              {event.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      {webhookError && (
                        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md p-2">
                          {webhookError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={savingEdit || !editUrl.trim() || editEvents.length === 0}
                          className="flex-1 bg-primary text-primary-foreground rounded-md py-1.5 px-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={wh.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/50 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono truncate">{wh.url}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {Array.isArray(wh.events) && wh.events.includes('*')
                            ? 'All events'
                            : (wh.events || []).join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEditing(wh)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit endpoint"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteWebhook(wh.id)}
                          disabled={deletingId === wh.id}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete endpoint"
                        >
                          {deletingId === wh.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Show creation form or success */}
            {webhookSecret ? (
              /* Webhook created successfully */
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-medium text-green-700 dark:text-green-400">Webhook endpoint created</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{webhookUrl}</p>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                    Save this secret — it&apos;s shown only once
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                      {webhookSecret}
                    </code>
                    <button
                      onClick={() => copyToClipboard(webhookSecret, 'webhook-secret')}
                      className="p-2 hover:bg-muted rounded-md transition-colors flex-shrink-0"
                    >
                      {copied === 'webhook-secret' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Use this secret to verify webhook signatures in your application.
                  </p>
                </div>
              </div>
            ) : (
              /* Webhook creation form */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-app.com/webhooks/soledgic"
                    className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Events
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {EVENT_TYPES.map((event) => (
                      <label
                        key={event.value}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors text-sm ${
                          selectedEvents.includes(event.value)
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border hover:border-primary/50 text-muted-foreground'
                        } ${event.value === '*' ? 'col-span-2' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(event.value)}
                          onChange={() => toggleEvent(event.value)}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          selectedEvents.includes(event.value)
                            ? 'bg-primary border-primary'
                            : 'border-border'
                        }`}>
                          {selectedEvents.includes(event.value) && (
                            <Check className="w-3 h-3 text-primary-foreground" />
                          )}
                        </div>
                        {event.label}
                      </label>
                    ))}
                  </div>
                </div>

                {webhookError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md p-3">
                    {webhookError}
                  </div>
                )}

                <button
                  onClick={createWebhook}
                  disabled={creatingWebhook || !webhookUrl.trim() || selectedEvents.length === 0}
                  className="w-full bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creatingWebhook ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Webhook'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 border border-border rounded-md py-2.5 px-4 font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => {
                if (!webhookSecret && !createdEndpointId) {
                  setWebhookSkipped(true)
                }
                setStep(3)
              }}
              className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {!webhookSecret && !createdEndpointId && (
            <button
              onClick={() => {
                setWebhookSkipped(true)
                setStep(3)
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
            >
              <SkipForward className="w-3 h-3" /> Skip for now
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* Step 3: Test Connection                           */}
      {/* ══════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Test Your Connection</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Run a quick check to make sure everything is wired up correctly.
            </p>

            {/* Test Results */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium text-foreground">API Connectivity</span>
                {apiTestResult === 'pass' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : apiTestResult === 'fail' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : runningTests ? (
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                )}
              </div>

              {hasWebhook && (
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium text-foreground">Webhook Delivery</span>
                  {webhookTestResult === 'pass' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : webhookTestResult === 'fail' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : runningTests ? (
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>
              )}

              {webhookSkipped && (
                <p className="text-xs text-muted-foreground px-1">
                  Webhook test skipped — you can set up webhooks later in Settings.
                </p>
              )}
            </div>

            <button
              onClick={runTests}
              disabled={runningTests}
              className="w-full bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {runningTests ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Tests...
                </>
              ) : testsRan ? (
                'Re-run Tests'
              ) : (
                'Run Tests'
              )}
            </button>

            {/* Result summary */}
            {testsRan && !runningTests && (
              <div className={`mt-4 p-4 rounded-lg text-sm ${
                apiTestResult === 'pass' && (!hasWebhook || webhookTestResult === 'pass')
                  ? 'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400'
                  : 'bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400'
              }`}>
                {apiTestResult === 'pass' && (!hasWebhook || webhookTestResult === 'pass') ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    All tests passed — your platform is connected.
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Some tests failed. Check your configuration and try again.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 border border-border rounded-md py-2.5 px-4 font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={completeSetup}
              disabled={completing}
              className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 px-4 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {completing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Completing...
                </>
              ) : (
                'Complete Setup'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
