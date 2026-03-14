'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { useToast } from '@/components/notifications/toast-provider'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'
import { Bell, Plus, Trash2, Play, Loader2, Slack, Mail, Globe } from 'lucide-react'

type AlertType = 'breach_risk' | 'projection_created' | 'instrument_invalidated'
type ChannelType = 'slack' | 'email' | 'webhook'

interface AlertConfig {
  id: string
  alert_type: AlertType
  channel: ChannelType
  config: {
    webhook_url?: string
    channel?: string
    recipients?: string[]
  }
  thresholds: {
    coverage_ratio_below?: number
    shortfall_above?: number
  }
  is_active: boolean
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
}

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  breach_risk: 'Breach Risk',
  projection_created: 'Projection Created',
  instrument_invalidated: 'Instrument Invalidated',
}

const CHANNEL_LABELS: Record<ChannelType, string> = {
  slack: 'Slack',
  email: 'Email',
  webhook: 'Webhook',
}

function ChannelIcon({ channel }: { channel: ChannelType }) {
  switch (channel) {
    case 'slack':
      return <Slack className="w-4 h-4" />
    case 'email':
      return <Mail className="w-4 h-4" />
    case 'webhook':
      return <Globe className="w-4 h-4" />
  }
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (val: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg
          ring-0 transition-transform duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  )
}

export default function AlertsSettingsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [alerts, setAlerts] = useState<AlertConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingAlert, setDeletingAlert] = useState<AlertConfig | null>(null)
  const toast = useToast()

  // Create form state
  const [formAlertType, setFormAlertType] = useState<AlertType>('breach_risk')
  const [formChannel, setFormChannel] = useState<ChannelType>('email')
  const [formWebhookUrl, setFormWebhookUrl] = useState('')
  const [formSlackChannel, setFormSlackChannel] = useState('')
  const [formRecipients, setFormRecipients] = useState('')
  const [formCoverageRatio, setFormCoverageRatio] = useState('0.5')
  const [formShortfall, setFormShortfall] = useState('')
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

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

    try {
      const res = await callLedgerFunction('configure-alerts', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'list' },
      })

      const result = await res.json()
      if (result.success) {
        setAlerts(result.data || [])
      } else {
        toast.error('Failed to load alerts', result.error)
      }
    } catch {
      toast.error('Failed to load alert configurations')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleCreate = async () => {
    if (!ledgerId) return
    setCreating(true)

    const config: Record<string, unknown> = {}
    if (formChannel === 'slack') {
      config.webhook_url = formWebhookUrl
      if (formSlackChannel) config.channel = formSlackChannel
    } else if (formChannel === 'email') {
      config.recipients = formRecipients.split(',').map((e) => e.trim()).filter(Boolean)
    } else if (formChannel === 'webhook') {
      config.webhook_url = formWebhookUrl
    }

    const thresholds: Record<string, number> = {}
    if (formCoverageRatio) thresholds.coverage_ratio_below = parseFloat(formCoverageRatio)
    if (formShortfall) thresholds.shortfall_above = parseInt(formShortfall, 10)

    try {
      const res = await callLedgerFunction('configure-alerts', {
        ledgerId,
        method: 'POST',
        body: {
          action: 'create',
          alert_type: formAlertType,
          channel: formChannel,
          config,
          thresholds,
        },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Alert created', `${ALERT_TYPE_LABELS[formAlertType]} alert via ${CHANNEL_LABELS[formChannel]}`)
        setShowCreateModal(false)
        resetForm()
        loadData()
      } else {
        toast.error('Failed to create alert', result.error)
      }
    } catch {
      toast.error('Failed to create alert')
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (alert: AlertConfig) => {
    if (!ledgerId) return
    setTogglingId(alert.id)

    try {
      const res = await callLedgerFunction('configure-alerts', {
        ledgerId,
        method: 'POST',
        body: {
          action: 'update',
          config_id: alert.id,
          is_active: !alert.is_active,
        },
      })

      const result = await res.json()
      if (result.success) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, is_active: !a.is_active } : a))
        )
      } else {
        toast.error('Failed to update alert', result.error)
      }
    } catch {
      toast.error('Failed to update alert')
    } finally {
      setTogglingId(null)
    }
  }

  const handleTest = async (alert: AlertConfig) => {
    if (!ledgerId) return
    setTestingId(alert.id)

    try {
      const res = await callLedgerFunction('configure-alerts', {
        ledgerId,
        method: 'POST',
        body: { action: 'test', config_id: alert.id },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Test sent', `Test alert sent via ${alert.channel}`)
      } else {
        toast.error('Test failed', result.message || result.error)
      }
    } catch {
      toast.error('Failed to send test alert')
    } finally {
      setTestingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!ledgerId || !deletingAlert) return

    try {
      const res = await callLedgerFunction('configure-alerts', {
        ledgerId,
        method: 'POST',
        body: { action: 'delete', config_id: deletingAlert.id },
      })

      const result = await res.json()
      if (result.success) {
        toast.success('Alert deleted')
        loadData()
      } else {
        toast.error('Failed to delete alert', result.error)
      }
    } catch {
      toast.error('Failed to delete alert')
    }
    setDeletingAlert(null)
  }

  const resetForm = () => {
    setFormAlertType('breach_risk')
    setFormChannel('email')
    setFormWebhookUrl('')
    setFormSlackChannel('')
    setFormRecipients('')
    setFormCoverageRatio('0.5')
    setFormShortfall('')
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Security Alerts</h1>
          <p className="text-muted-foreground mt-1">
            Configure alerts for breach risk, projection events, and instrument changes
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Alert
        </button>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Bell className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No alert configurations yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Create an alert to get notified when important events occur
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Thresholds</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Triggers</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground">
                      {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ChannelIcon channel={alert.channel} />
                      {CHANNEL_LABELS[alert.channel] || alert.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {alert.thresholds.coverage_ratio_below !== undefined && (
                      <span>Coverage &lt; {Math.round(alert.thresholds.coverage_ratio_below * 100)}%</span>
                    )}
                    {alert.thresholds.shortfall_above !== undefined && (
                      <span className="ml-2">Shortfall &gt; ${(alert.thresholds.shortfall_above / 100).toLocaleString()}</span>
                    )}
                    {!alert.thresholds.coverage_ratio_below && !alert.thresholds.shortfall_above && (
                      <span className="text-muted-foreground/50">Default</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                    {alert.trigger_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      checked={alert.is_active}
                      onChange={() => handleToggle(alert)}
                      disabled={togglingId === alert.id}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTest(alert)}
                        disabled={testingId === alert.id}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-muted-foreground"
                      >
                        {testingId === alert.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Test
                      </button>
                      <button
                        onClick={() => setDeletingAlert(alert)}
                        className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Alert Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Create Alert</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure a new alert to monitor events on your ledger
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Alert Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Alert Type</label>
                <select
                  value={formAlertType}
                  onChange={(e) => setFormAlertType(e.target.value as AlertType)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="breach_risk">Breach Risk</option>
                  <option value="projection_created">Projection Created</option>
                  <option value="instrument_invalidated">Instrument Invalidated</option>
                </select>
              </div>

              {/* Channel */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Channel</label>
                <select
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as ChannelType)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="email">Email</option>
                  <option value="slack">Slack</option>
                  <option value="webhook">Webhook</option>
                </select>
              </div>

              {/* Channel-specific config */}
              {(formChannel === 'slack' || formChannel === 'webhook') && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {formChannel === 'slack' ? 'Slack Webhook URL' : 'Webhook URL'}
                  </label>
                  <input
                    type="url"
                    value={formWebhookUrl}
                    onChange={(e) => setFormWebhookUrl(e.target.value)}
                    placeholder={formChannel === 'slack' ? 'https://hooks.slack.com/services/...' : 'https://...'}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                </div>
              )}

              {formChannel === 'slack' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Slack Channel <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formSlackChannel}
                    onChange={(e) => setFormSlackChannel(e.target.value)}
                    placeholder="#alerts"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                </div>
              )}

              {formChannel === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Recipients</label>
                  <input
                    type="text"
                    value={formRecipients}
                    onChange={(e) => setFormRecipients(e.target.value)}
                    placeholder="alice@example.com, bob@example.com"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Comma-separated. Maximum 10 recipients.</p>
                </div>
              )}

              {/* Thresholds */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Coverage Ratio Below
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formCoverageRatio}
                    onChange={(e) => setFormCoverageRatio(e.target.value)}
                    placeholder="0.5"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">0 to 1 (e.g. 0.5 = 50%)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Shortfall Above (cents)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formShortfall}
                    onChange={(e) => setFormShortfall(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {creating ? 'Creating...' : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingAlert}
        onClose={() => setDeletingAlert(null)}
        onConfirm={confirmDelete}
        title="Delete Alert"
        message={`Delete this ${deletingAlert ? ALERT_TYPE_LABELS[deletingAlert.alert_type] : ''} alert? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
