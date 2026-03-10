'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, Check, Loader2 } from 'lucide-react'

type NotificationType =
  | 'payout_processed'
  | 'payout_failed'
  | 'sale_recorded'
  | 'payment_failed'
  | 'period_closed'
  | 'reconciliation_mismatch'
  | 'webhook_failed'
  | 'limit_warning'
  | 'limit_reached'
  | 'trial_ending'
  | 'security_alert'
  | 'team_invite'
  | 'system'

type NotificationPreferences = Record<NotificationType, boolean>

interface NotificationCategory {
  label: string
  description: string
  types: { key: NotificationType; label: string; description: string }[]
}

const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    label: 'Payments',
    description: 'Notifications related to payouts, sales, and payment activity.',
    types: [
      { key: 'payout_processed', label: 'Payout Processed', description: 'When a payout is successfully sent' },
      { key: 'payout_failed', label: 'Payout Failed', description: 'When a payout fails to process' },
      { key: 'sale_recorded', label: 'Sale Recorded', description: 'When a new sale is recorded' },
      { key: 'payment_failed', label: 'Payment Failed', description: 'When an incoming payment fails' },
    ],
  },
  {
    label: 'Bookkeeping',
    description: 'Notifications related to ledger periods and reconciliation.',
    types: [
      { key: 'period_closed', label: 'Period Closed', description: 'When a ledger period is closed' },
      { key: 'reconciliation_mismatch', label: 'Reconciliation Mismatch', description: 'When a reconciliation discrepancy is found' },
    ],
  },
  {
    label: 'System',
    description: 'Operational alerts, limits, and account notifications.',
    types: [
      { key: 'webhook_failed', label: 'Webhook Failed', description: 'When an outbound webhook delivery fails' },
      { key: 'limit_warning', label: 'Limit Warning', description: 'When approaching a usage limit' },
      { key: 'limit_reached', label: 'Limit Reached', description: 'When a usage limit has been reached' },
      { key: 'trial_ending', label: 'Trial Ending', description: 'When your trial period is about to end' },
      { key: 'security_alert', label: 'Security Alert', description: 'Security-related account alerts' },
      { key: 'team_invite', label: 'Team Invite', description: 'When you receive a team invitation' },
      { key: 'system', label: 'System', description: 'General system announcements' },
    ],
  },
]

const ALL_TYPES: NotificationType[] = NOTIFICATION_CATEGORIES.flatMap((c) => c.types.map((t) => t.key))

function getDefaultPreferences(): NotificationPreferences {
  return Object.fromEntries(ALL_TYPES.map((t) => [t, true])) as NotificationPreferences
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

export default function NotificationPreferencesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences>(getDefaultPreferences)

  const loadPreferences = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const stored = user.user_metadata?.notification_preferences as
        | Partial<NotificationPreferences>
        | undefined

      if (stored) {
        // Merge stored prefs with defaults (new types default to enabled)
        const merged = getDefaultPreferences()
        for (const key of ALL_TYPES) {
          if (key in stored) {
            merged[key] = !!stored[key]
          }
        }
        setPreferences(merged)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  const handleToggle = (key: NotificationType, value: boolean) => {
    setSaved(false)
    setPreferences((prev) => ({ ...prev, [key]: value }))
  }

  const handleToggleCategory = (category: NotificationCategory, value: boolean) => {
    setSaved(false)
    setPreferences((prev) => {
      const next = { ...prev }
      for (const t of category.types) {
        next[t.key] = value
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        data: { notification_preferences: preferences },
      })

      if (updateError) {
        throw updateError
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error && !preferences) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Failed to load preferences</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null)
            setLoading(true)
            loadPreferences()
          }}
          className="text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Choose which notifications you want to receive
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : null}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-md p-3 mb-6">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Notification Categories */}
      <div className="space-y-8">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const allEnabled = category.types.every((t) => preferences[t.key])
          const someEnabled = category.types.some((t) => preferences[t.key])

          return (
            <div key={category.label} className="rounded-lg border border-border">
              {/* Category header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50 rounded-t-lg">
                <div>
                  <h2 className="font-semibold text-foreground">{category.label}</h2>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {allEnabled ? 'All on' : someEnabled ? 'Some on' : 'All off'}
                  </span>
                  <Toggle
                    checked={allEnabled}
                    onChange={(val) => handleToggleCategory(category, val)}
                  />
                </div>
              </div>

              {/* Individual types */}
              <div className="divide-y divide-border">
                {category.types.map((type) => (
                  <div
                    key={type.key}
                    className="flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{type.label}</p>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                    <Toggle
                      checked={preferences[type.key]}
                      onChange={(val) => handleToggle(type.key, val)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
