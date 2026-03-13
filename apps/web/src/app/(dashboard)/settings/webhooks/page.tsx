'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle,
  Clock,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Webhook,
  X,
  XCircle,
} from 'lucide-react'

import { ConfirmDialog } from '@/components/settings/confirm-dialog'
import { SensitiveActionModal } from '@/components/settings/sensitive-action-modal'
import { useToast } from '@/components/notifications/toast-provider'
import { useActiveLedgerGroupId, useLivemode } from '@/components/livemode-provider'
import { useSensitiveActionGate } from '@/hooks/use-sensitive-action-gate'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { pickActiveLedger } from '@/lib/active-ledger'
import { createClient } from '@/lib/supabase/client'

interface WebhookEndpoint {
  id: string
  url: string
  description: string | null
  events: string[]
  is_active: boolean
  created_at: string
  secret_rotated_at: string | null
}

interface WebhookDelivery {
  id: string
  endpoint_id: string | null
  endpoint_url: string | null
  event_type: string
  status: string
  attempts: number
  max_attempts: number | null
  response_status: number | null
  response_body: string | null
  response_time_ms: number | null
  created_at: string
  delivered_at: string | null
  next_retry_at: string | null
  payload: Record<string, unknown> | null
}

interface RevealedSecret {
  title: string
  message: string
  value: string
}

const EVENT_TYPES = [
  { value: '*', label: 'All Events' },
  { value: 'checkout.completed', label: 'Checkout Completed' },
  { value: 'refund.created', label: 'Refund Created' },
  { value: 'sale.refunded', label: 'Sale Refunded' },
  { value: 'payout.created', label: 'Payout Created' },
  { value: 'payout.executed', label: 'Payout Executed' },
  { value: 'payout.failed', label: 'Payout Failed' },
]

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function truncateText(value: string | null | undefined, max = 72): string {
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function stringifyJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'delivered':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />
    case 'pending':
    case 'retrying':
      return <Clock className="w-4 h-4 text-yellow-500" />
    default:
      return null
  }
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'delivered':
      return 'bg-green-500/10 text-green-600'
    case 'failed':
      return 'bg-red-500/10 text-red-600'
    case 'pending':
    case 'retrying':
      return 'bg-yellow-500/10 text-yellow-700'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function SecretModal({
  revealedSecret,
  onClose,
  onCopy,
}: {
  revealedSecret: RevealedSecret | null
  onClose: () => void
  onCopy: (value: string) => Promise<void>
}) {
  if (!revealedSecret) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-lg w-full mx-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">{revealedSecret.title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{revealedSecret.message}</p>
        <div className="flex items-center gap-2 mb-6">
          <code className="flex-1 bg-muted px-4 py-2 rounded text-sm font-mono text-foreground break-all">
            {revealedSecret.value}
          </code>
          <button
            onClick={() => void onCopy(revealedSecret.value)}
            className="p-2 hover:bg-accent rounded"
            title="Copy secret"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground py-2 rounded-md"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function DeliveryDetailModal({
  delivery,
  onClose,
}: {
  delivery: WebhookDelivery | null
  onClose: () => void
}) {
  if (!delivery) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-card border border-border rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Delivery Detail</h2>
              <p className="text-sm text-muted-foreground mt-1">{delivery.id}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Event</p>
                <code className="text-sm bg-muted px-2 py-1 rounded">{delivery.event_type}</code>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Status</p>
                <div className="flex items-center gap-2">
                  {getStatusIcon(delivery.status)}
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(delivery.status)}`}>
                    {delivery.status}
                  </span>
                </div>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Endpoint</p>
                <p className="text-sm text-foreground break-all">{delivery.endpoint_url || '—'}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Attempts</p>
                <p className="text-sm text-foreground">
                  {delivery.attempts}
                  {delivery.max_attempts ? ` / ${delivery.max_attempts}` : ''}
                </p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Created</p>
                <p className="text-sm text-foreground">{formatTimestamp(delivery.created_at)}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Delivered</p>
                <p className="text-sm text-foreground">{formatTimestamp(delivery.delivered_at)}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Next Retry</p>
                <p className="text-sm text-foreground">{formatTimestamp(delivery.next_retry_at)}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Response</p>
                <p className="text-sm text-foreground">
                  {delivery.response_status ?? '—'}
                  {delivery.response_time_ms ? ` in ${delivery.response_time_ms}ms` : ''}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Payload</h3>
              <pre className="text-xs bg-background border border-border px-4 py-3 rounded overflow-x-auto text-foreground">
                {stringifyJson(delivery.payload)}
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Response Body</h3>
              <pre className="text-xs bg-background border border-border px-4 py-3 rounded overflow-x-auto text-foreground whitespace-pre-wrap">
                {delivery.response_body || '—'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function WebhooksPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const toast = useToast()

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newEndpoint, setNewEndpoint] = useState({ url: '', description: '', events: ['*'] })
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('all')
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null)
  const [rotatingEndpointId, setRotatingEndpointId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { challenge, dismissChallenge, handleProtectedResponse, retryVerifiedAction } =
    useSensitiveActionGate()

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setEndpoints([])
        setDeliveries([])
        setLedgerId(null)
        return
      }

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!membership) {
        setEndpoints([])
        setDeliveries([])
        setLedgerId(null)
        return
      }

      const { data: ledgers } = await supabase
        .from('ledgers')
        .select('id, ledger_group_id')
        .eq('organization_id', membership.organization_id)
        .eq('status', 'active')
        .eq('livemode', livemode)

      const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
      if (!ledger) {
        setEndpoints([])
        setDeliveries([])
        setLedgerId(null)
        return
      }

      setLedgerId(ledger.id)

      const endpointsRes = await callLedgerFunction('webhooks', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'list' },
      })
      const endpointsData = await endpointsRes.json()
      if (!endpointsRes.ok || !endpointsData.success) {
        throw new Error(endpointsData.error || 'Failed to load webhook endpoints')
      }
      setEndpoints(endpointsData.data || [])

      const endpointFilter = selectedEndpointId === 'all' ? undefined : selectedEndpointId
      const deliveriesRes = await callLedgerFunction('webhooks', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'deliveries', endpoint_id: endpointFilter, limit: 100 },
      })
      const deliveriesData = await deliveriesRes.json()
      if (!deliveriesRes.ok || !deliveriesData.success) {
        throw new Error(deliveriesData.error || 'Failed to load webhook deliveries')
      }
      setDeliveries(deliveriesData.data || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeLedgerGroupId, livemode, selectedEndpointId, toast])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData()
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadData])

  const copyToClipboard = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Copied to clipboard')
  }, [toast])

  const createEndpoint = async () => {
    if (!ledgerId || !newEndpoint.url) return
    if (newEndpoint.events.length === 0) {
      toast.error('Select at least one event')
      return
    }

    setCreating(true)
    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId,
        method: 'POST',
        body: {
          action: 'create',
          url: newEndpoint.url,
          description: newEndpoint.description || null,
          events: newEndpoint.events,
        },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create webhook endpoint')
      }

      setRevealedSecret({
        title: 'Webhook Secret',
        message: data.message || 'Save this secret. It is only shown once.',
        value: data.data?.secret || '',
      })
      setNewEndpoint({ url: '', description: '', events: ['*'] })
      setShowCreate(false)
      toast.success('Webhook endpoint created')
      await loadData({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create webhook endpoint')
    } finally {
      setCreating(false)
    }
  }

  const confirmDeleteEndpoint = async () => {
    if (!ledgerId || !deleteTarget) return

    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId,
        method: 'POST',
        body: { action: 'delete', endpoint_id: deleteTarget },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete webhook endpoint')
      }
      toast.success('Webhook endpoint deleted')
      await loadData({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete webhook endpoint')
    } finally {
      setDeleteTarget(null)
    }
  }

  const testEndpoint = async (id: string) => {
    if (!ledgerId) return
    setTestingId(id)

    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId,
        method: 'POST',
        body: { action: 'test', endpoint_id: id },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test webhook')
      }

      if (data.success) {
        toast.success(
          data.data?.delivered
            ? `Test delivered in ${data.data?.response_time_ms ?? 0}ms`
            : `Test sent but endpoint returned ${data.data?.status ?? 'an error'}`,
        )
      } else {
        toast.error(data.error || 'Test delivery failed')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test webhook')
    } finally {
      setTestingId(null)
    }
  }

  const toggleEndpoint = async (id: string, isActive: boolean) => {
    if (!ledgerId) return

    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId,
        method: 'POST',
        body: { action: 'update', endpoint_id: id, is_active: !isActive },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update webhook endpoint')
      }
      toast.success(isActive ? 'Webhook endpoint disabled' : 'Webhook endpoint enabled')
      await loadData({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update webhook endpoint')
    }
  }

  const rotateSecret = async (endpointId: string) => {
    if (!ledgerId) return
    setRotatingEndpointId(endpointId)

    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId,
        method: 'POST',
        body: { action: 'rotate_secret', endpoint_id: endpointId },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (handleProtectedResponse(res, data, () => rotateSecret(endpointId))) {
          return
        }
        throw new Error(data.error || 'Failed to rotate webhook secret')
      }

      setRevealedSecret({
        title: 'Rotated Webhook Secret',
        message: data.message || 'Store the new secret and update your verifier.',
        value: data.data?.secret || '',
      })
      toast.success('Webhook secret rotated')
      await loadData({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rotate webhook secret')
    } finally {
      setRotatingEndpointId(null)
    }
  }

  const retryDelivery = async (deliveryId: string) => {
    if (!ledgerId) return
    setRetryingDeliveryId(deliveryId)

    try {
      const res = await callLedgerFunction('webhooks', {
        ledgerId,
        method: 'POST',
        body: { action: 'retry', delivery_id: deliveryId },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to queue delivery replay')
      }
      toast.success(data.message || 'Delivery queued for replay')
      await loadData({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to queue delivery replay')
    } finally {
      setRetryingDeliveryId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Manage endpoint secrets, inspect delivery history, and replay failed events.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadData({ silent: true })}
            className="flex items-center gap-2 border border-border px-4 py-2 rounded-md hover:bg-accent transition-colors"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Endpoint
          </button>
        </div>
      </div>

      <SecretModal
        revealedSecret={revealedSecret}
        onClose={() => setRevealedSecret(null)}
        onCopy={copyToClipboard}
      />

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">New Webhook Endpoint</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Endpoint URL
              </label>
              <input
                type="url"
                value={newEndpoint.url}
                onChange={(event) => setNewEndpoint({ ...newEndpoint, url: event.target.value })}
                placeholder="https://your-server.com/webhooks/soledgic"
                className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Description (optional)
              </label>
              <input
                type="text"
                value={newEndpoint.description}
                onChange={(event) => setNewEndpoint({ ...newEndpoint, description: event.target.value })}
                placeholder="Production server"
                className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Events
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_TYPES.map((event) => (
                  <label key={event.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newEndpoint.events.includes(event.value)}
                      onChange={(inputEvent) => {
                        if (event.value === '*') {
                          setNewEndpoint({
                            ...newEndpoint,
                            events: inputEvent.target.checked ? ['*'] : [],
                          })
                          return
                        }

                        const events = newEndpoint.events.filter((value) => value !== '*')
                        if (inputEvent.target.checked) {
                          setNewEndpoint({ ...newEndpoint, events: [...events, event.value] })
                        } else {
                          setNewEndpoint({
                            ...newEndpoint,
                            events: events.filter((value) => value !== event.value),
                          })
                        }
                      }}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">{event.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 border border-border py-2 rounded-md hover:bg-accent"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={() => void createEndpoint()}
                disabled={!newEndpoint.url || creating}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Endpoint
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Endpoints</h2>
        </div>

        {endpoints.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No webhook endpoints configured</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {endpoints.map((endpoint) => (
              <div key={endpoint.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-mono text-foreground break-all">{endpoint.url}</code>
                      <a
                        href={endpoint.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:bg-accent rounded"
                        title="Open endpoint"
                      >
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </a>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        endpoint.is_active
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {endpoint.is_active ? 'Active' : 'Disabled'}
                      </span>
                      {endpoint.secret_rotated_at && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-600">
                          Secret rotated {formatTimestamp(endpoint.secret_rotated_at)}
                        </span>
                      )}
                    </div>
                    {endpoint.description && (
                      <p className="text-sm text-muted-foreground mt-1">{endpoint.description}</p>
                    )}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {endpoint.events.map((event) => (
                        <span key={event} className="text-xs bg-muted px-2 py-1 rounded">
                          {event === '*' ? 'All Events' : event}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Added {formatTimestamp(endpoint.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void testEndpoint(endpoint.id)}
                      disabled={testingId === endpoint.id}
                      className="p-2 hover:bg-accent rounded transition-colors"
                      title="Send test webhook"
                    >
                      {testingId === endpoint.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => void rotateSecret(endpoint.id)}
                      disabled={rotatingEndpointId === endpoint.id}
                      className="p-2 hover:bg-accent rounded transition-colors"
                      title="Rotate signing secret"
                    >
                      {rotatingEndpointId === endpoint.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => void toggleEndpoint(endpoint.id, endpoint.is_active)}
                      className="p-2 hover:bg-accent rounded transition-colors"
                      title={endpoint.is_active ? 'Disable' : 'Enable'}
                    >
                      {endpoint.is_active ? (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(endpoint.id)}
                      className="p-2 hover:bg-accent rounded transition-colors text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Delivery History</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Inspect payloads, response bodies, and replay exhausted deliveries from here.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedEndpointId}
              onChange={(event) => setSelectedEndpointId(event.target.value)}
              className="border border-border rounded-md bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All endpoints</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.description || endpoint.url}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadData({ silent: true })}
              className="flex items-center gap-2 border border-border px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
          </div>
        </div>

        {deliveries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No webhook deliveries yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Endpoint</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Response</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Next Retry</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-6 py-4 align-top">
                      <code className="text-xs bg-muted px-2 py-1 rounded">{delivery.event_type}</code>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-muted-foreground max-w-[240px]">
                      <span className="block truncate" title={delivery.endpoint_url || undefined}>
                        {delivery.endpoint_url || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(delivery.status)}
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(delivery.status)}`}>
                          {delivery.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {delivery.attempts}
                        {delivery.max_attempts ? ` / ${delivery.max_attempts}` : ''} attempts
                      </p>
                    </td>
                    <td className="px-6 py-4 align-top text-sm">
                      <div>
                        <span className={
                          delivery.response_status !== null && delivery.response_status < 300
                            ? 'text-green-600'
                            : 'text-red-600'
                        }>
                          {delivery.response_status ?? '—'}
                        </span>
                        {delivery.response_time_ms ? (
                          <span className="text-muted-foreground ml-2">{delivery.response_time_ms}ms</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2" title={delivery.response_body || undefined}>
                        {truncateText(delivery.response_body)}
                      </p>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-muted-foreground">
                      {formatTimestamp(delivery.next_retry_at)}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-muted-foreground">
                      {formatTimestamp(delivery.created_at)}
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedDelivery(delivery)}
                          className="p-2 hover:bg-accent rounded transition-colors"
                          title="View detail"
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => void retryDelivery(delivery.id)}
                          disabled={retryingDeliveryId === delivery.id || delivery.status === 'pending'}
                          className="p-2 hover:bg-accent rounded transition-colors disabled:opacity-50"
                          title="Replay delivery"
                        >
                          {retryingDeliveryId === delivery.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : (
                            <RotateCcw className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-2">Verifying Webhooks</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Each delivery includes a timestamped <code className="bg-muted px-1 rounded">X-Soledgic-Signature</code>
          header, a stable delivery identifier, and the current attempt count.
        </p>
        <pre className="text-sm bg-background border border-border px-4 py-3 rounded overflow-x-auto">
{`const soledgic = new Soledgic({
  apiKey: process.env.SOLEDGIC_API_KEY!,
  baseUrl: 'https://api.soledgic.com/v1',
  apiVersion: '2026-03-01',
});

const rawBody = await request.text();
const signature = request.headers.get('x-soledgic-signature') || '';

const isValid = await soledgic.webhooks.verifySignature(
  rawBody,
  signature,
  webhookSecret,
);`}
        </pre>
      </div>

      <DeliveryDetailModal
        delivery={selectedDelivery}
        onClose={() => setSelectedDelivery(null)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteEndpoint}
        title="Delete Endpoint"
        message="Delete this webhook endpoint? It will stop receiving events immediately."
        confirmLabel="Delete"
        variant="danger"
      />

      <SensitiveActionModal
        challenge={challenge}
        onClose={dismissChallenge}
        onVerified={retryVerifiedAction}
      />
    </div>
  )
}
