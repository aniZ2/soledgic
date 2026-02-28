'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { Webhook, Plus, Trash2, Send, CheckCircle, XCircle, Clock, Eye, EyeOff, Copy } from 'lucide-react'

interface WebhookEndpoint {
  id: string
  url: string
  description: string | null
  events: string[]
  is_active: boolean
  secret?: string
  created_at: string
}

interface WebhookDelivery {
  id: string
  event_type: string
  status: string
  attempts: number
  response_status: number | null
  response_time_ms: number | null
  created_at: string
  delivered_at: string | null
  webhook_endpoints: { url: string } | null
}

const EVENT_TYPES = [
  { value: '*', label: 'All Events' },
  { value: 'sale.created', label: 'Sale Created' },
  { value: 'sale.refunded', label: 'Sale Refunded' },
  { value: 'payout.processed', label: 'Payout Processed' },
  { value: 'payout.executed', label: 'Payout Executed' },
  { value: 'creator.created', label: 'Creator Created' },
  { value: 'period.closed', label: 'Period Closed' },
  { value: 'statement.generated', label: 'Statement Generated' },
]

export default function WebhooksPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newEndpoint, setNewEndpoint] = useState({ url: '', description: '', events: ['*'] })
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    
    // Get user's organization and ledger
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, ledger_group_id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)

    const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
    if (!ledger) return

    setLedgerId(ledger.id)

    // Fetch endpoints
    const endpointsRes = await callLedgerFunction('webhooks', {
      ledgerId: ledger.id,
      method: 'POST',
      body: { action: 'list' },
    })
    const endpointsData = await endpointsRes.json()
    if (endpointsData.success) {
      setEndpoints(endpointsData.data)
    }

    // Fetch recent deliveries
    const deliveriesRes = await callLedgerFunction('webhooks', {
      ledgerId: ledger.id,
      method: 'POST',
      body: { action: 'deliveries' },
    })
    const deliveriesData = await deliveriesRes.json()
    if (deliveriesData.success) {
      setDeliveries(deliveriesData.data)
    }

    setLoading(false)
  }, [activeLedgerGroupId, livemode])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData()
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadData])

  const createEndpoint = async () => {
    if (!ledgerId || !newEndpoint.url) return

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
    
    if (data.success) {
      setCreatedSecret(data.data.secret)
      setNewEndpoint({ url: '', description: '', events: ['*'] })
      void loadData()
    }
  }

  const deleteEndpoint = async (id: string) => {
    if (!ledgerId || !confirm('Delete this webhook endpoint?')) return

    await callLedgerFunction('webhooks', {
      ledgerId,
      method: 'POST',
      body: { action: 'delete', endpoint_id: id },
    })
    void loadData()
  }

  const testEndpoint = async (id: string) => {
    if (!ledgerId) return
    setTestingId(id)

    const res = await callLedgerFunction('webhooks', {
      ledgerId,
      method: 'POST',
      body: { action: 'test', endpoint_id: id },
    })
    await res.json()
    setTestingId(null)
  }

  const toggleEndpoint = async (id: string, isActive: boolean) => {
    if (!ledgerId) return

    await callLedgerFunction('webhooks', {
      ledgerId,
      method: 'POST',
      body: { action: 'update', endpoint_id: id, is_active: !isActive },
    })
    void loadData()
  }

  const getStatusIcon = (status: string) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Receive real-time notifications when events occur
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Endpoint
        </button>
      </div>

      {/* Secret Display Modal */}
      {createdSecret && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">Webhook Secret</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Save this secret - it will not be shown again. Use it to verify webhook signatures.
            </p>
            <div className="flex items-center gap-2 mb-6">
              <code className="flex-1 bg-muted px-4 py-2 rounded text-sm font-mono text-foreground break-all">
                {createdSecret}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(createdSecret)}
                className="p-2 hover:bg-accent rounded"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setCreatedSecret(null)}
              className="w-full bg-primary text-primary-foreground py-2 rounded-md"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create Endpoint Form */}
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
                onChange={(e) => setNewEndpoint({ ...newEndpoint, url: e.target.value })}
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
                onChange={(e) => setNewEndpoint({ ...newEndpoint, description: e.target.value })}
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
                      onChange={(e) => {
                        if (event.value === '*') {
                          setNewEndpoint({ ...newEndpoint, events: e.target.checked ? ['*'] : [] })
                        } else {
                          const events = newEndpoint.events.filter(e => e !== '*')
                          if (e.target.checked) {
                            setNewEndpoint({ ...newEndpoint, events: [...events, event.value] })
                          } else {
                            setNewEndpoint({ ...newEndpoint, events: events.filter(ev => ev !== event.value) })
                          }
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
              >
                Cancel
              </button>
              <button
                onClick={createEndpoint}
                disabled={!newEndpoint.url}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Create Endpoint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Endpoints List */}
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
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-foreground">{endpoint.url}</code>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        endpoint.is_active 
                          ? 'bg-green-500/10 text-green-600' 
                          : 'bg-gray-500/10 text-gray-600'
                      }`}>
                        {endpoint.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    {endpoint.description && (
                      <p className="text-sm text-muted-foreground mt-1">{endpoint.description}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {endpoint.events.map((event) => (
                        <span key={event} className="text-xs bg-muted px-2 py-1 rounded">
                          {event === '*' ? 'All Events' : event}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testEndpoint(endpoint.id)}
                      disabled={testingId === endpoint.id}
                      className="p-2 hover:bg-accent rounded transition-colors"
                      title="Send test webhook"
                    >
                      {testingId === endpoint.id ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => toggleEndpoint(endpoint.id, endpoint.is_active)}
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
                      onClick={() => deleteEndpoint(endpoint.id)}
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

      {/* Recent Deliveries */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Recent Deliveries</h2>
        </div>
        
        {deliveries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No webhook deliveries yet
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Event</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Endpoint</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Response</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs bg-muted px-2 py-1 rounded">{delivery.event_type}</code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground truncate max-w-[200px]">
                    {delivery.webhook_endpoints?.url || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(delivery.status)}
                      <span className="text-sm capitalize">{delivery.status}</span>
                      {delivery.attempts > 1 && (
                        <span className="text-xs text-muted-foreground">({delivery.attempts} attempts)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {delivery.response_status && (
                      <span className={delivery.response_status < 300 ? 'text-green-600' : 'text-red-600'}>
                        {delivery.response_status}
                      </span>
                    )}
                    {delivery.response_time_ms && (
                      <span className="text-muted-foreground ml-2">{delivery.response_time_ms}ms</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(delivery.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Signature Verification Info */}
      <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-2">Verifying Webhooks</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Each webhook includes a signature header <code className="bg-muted px-1 rounded">X-Soledgic-Signature</code>. 
          Verify it using HMAC-SHA256:
        </p>
        <pre className="text-sm bg-background border border-border px-4 py-3 rounded overflow-x-auto">
{`const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return signature === expected;
}`}
        </pre>
      </div>
    </div>
  )
}
