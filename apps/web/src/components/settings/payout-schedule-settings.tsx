'use client'

import { useState } from 'react'
import { Loader2, Clock } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface PayoutScheduleSettingsProps {
  ledgerId: string
  initialSettings?: {
    schedule: 'manual' | 'weekly' | 'biweekly' | 'monthly'
    day_of_week?: number
    day_of_month?: number
    minimum_amount?: number
  }
}

type PayoutSchedule = 'manual' | 'weekly' | 'biweekly' | 'monthly'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export function PayoutScheduleSettings({
  ledgerId,
  initialSettings
}: PayoutScheduleSettingsProps) {
  const [schedule, setSchedule] = useState<PayoutSchedule>(initialSettings?.schedule || 'manual')
  const [dayOfWeek, setDayOfWeek] = useState(initialSettings?.day_of_week ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(initialSettings?.day_of_month ?? 1)
  const [minimumAmount, setMinimumAmount] = useState(
    (initialSettings?.minimum_amount || 1000) / 100 // Convert cents to dollars
  )
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSuccess(false)

    try {
      const response = await fetchWithCsrf(`/api/ledgers/${ledgerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          metadata: {
            payout_settings: {
              schedule,
              day_of_week: dayOfWeek,
              day_of_month: dayOfMonth,
              minimum_amount: Math.floor(minimumAmount * 100)
            }
          }
        })
      })

      if (response.ok) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save')
      }
    } catch (error: unknown) {
      alert(error instanceof Error && error.message ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Clock className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Payout Schedule</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Schedule Type */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Payout Frequency
          </label>
          <select
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as PayoutSchedule)}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="manual">Manual (request payouts individually)</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly (every 2 weeks)</option>
            <option value="monthly">Monthly</option>
          </select>
          <p className="text-sm text-muted-foreground mt-1">
            Automatic payouts run at 6:00 AM UTC on the scheduled day.
          </p>
        </div>

        {/* Day Selection */}
        {(schedule === 'weekly' || schedule === 'biweekly') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Day of Week
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {DAYS_OF_WEEK.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {schedule === 'monthly' && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Day of Month
            </label>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground mt-1">
              Limited to day 1-28 to ensure consistent payouts each month.
            </p>
          </div>
        )}

        {/* Minimum Amount */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Minimum Payout Amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={minimumAmount}
              onChange={(e) => setMinimumAmount(parseFloat(e.target.value) || 0)}
              className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Creators with balances below this amount will not receive automatic payouts.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Settings
          </button>
          {success && (
            <span className="text-green-600 text-sm">Settings saved!</span>
          )}
        </div>
      </div>
    </div>
  )
}
