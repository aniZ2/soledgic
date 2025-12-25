'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Copy, RefreshCw, Check } from 'lucide-react'

export default function LedgerSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  
  const [ledger, setLedger] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [platformName, setPlatformName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [status, setStatus] = useState('active')
  const [platformFee, setPlatformFee] = useState('20')
  const [minPayout, setMinPayout] = useState('10')
  const [payoutSchedule, setPayoutSchedule] = useState('manual')

  useEffect(() => {
    async function loadLedger() {
      const res = await fetch(`/api/ledgers/${id}`)
      const data = await res.json()
      
      if (data.ledger) {
        setLedger(data.ledger)
        setPlatformName(data.ledger.platform_name)
        setOwnerEmail(data.ledger.owner_email)
        setStatus(data.ledger.status)
        setPlatformFee(String(data.ledger.settings?.default_platform_fee_percent || 20))
        setMinPayout(String(data.ledger.settings?.min_payout_amount || 10))
        setPayoutSchedule(data.ledger.settings?.payout_schedule || 'manual')
      }
      setLoading(false)
    }
    loadLedger()
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/ledgers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform_name: platformName,
          owner_email: ownerEmail,
          status,
          settings: {
            default_platform_fee_percent: parseInt(platformFee),
            min_payout_amount: parseInt(minPayout),
            payout_schedule: payoutSchedule,
          },
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      setMessage({ type: 'success', text: 'Settings saved' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    }
    setSaving(false)
  }

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(ledger?.api_key || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleArchive = async () => {
    if (!confirm('Archive this ledger? It will be hidden but data preserved.')) return

    try {
      await fetch(`/api/ledgers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      router.push('/ledgers')
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to archive' })
    }
  }

  const handleDelete = async () => {
    if (!confirm('DELETE this ledger? This cannot be undone.')) return
    if (!confirm('Are you absolutely sure? All data will be permanently lost.')) return

    try {
      await fetch(`/api/ledgers/${id}`, { method: 'DELETE' })
      router.push('/ledgers')
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete' })
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  if (!ledger) {
    return <div className="text-muted-foreground">Ledger not found</div>
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/ledgers/${id}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Ledger Settings</h1>
      <p className="mt-1 text-muted-foreground">
        Configure {ledger.platform_name}
      </p>

      {message && (
        <div className={`mt-4 p-3 rounded-md text-sm ${
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-500 border border-green-500/20'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        }`}>
          {message.text}
        </div>
      )}

      {/* General Settings */}
      <div className="mt-8 bg-card border border-border rounded-lg">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">General</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Business name
            </label>
            <input
              type="text"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Owner email
            </label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Platform Settings */}
      <div className="mt-6 bg-card border border-border rounded-lg">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Platform Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            For marketplace/creator platforms
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Default platform fee (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={platformFee}
              onChange={(e) => setPlatformFee(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Percentage kept from each sale. Set to 100 for non-marketplace businesses.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Minimum payout amount ($)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={minPayout}
              onChange={(e) => setMinPayout(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Payout schedule
            </label>
            <select
              value={payoutSchedule}
              onChange={(e) => setPayoutSchedule(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="manual">Manual</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* API Access */}
      <div className="mt-6 bg-card border border-border rounded-lg">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">API Access</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              API Key
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-3 bg-muted rounded-md text-sm font-mono text-foreground overflow-x-auto">
                {ledger.api_key}
              </code>
              <button 
                onClick={handleCopyApiKey}
                className="p-3 border border-border rounded-md hover:bg-accent"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This key has full access to this ledger. Keep it secure.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Ledger ID
            </label>
            <code className="block px-4 py-3 bg-muted rounded-md text-sm font-mono text-muted-foreground">
              {ledger.id}
            </code>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent">
            <RefreshCw className="h-4 w-4" />
            Regenerate API key
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-6 bg-card border border-destructive/50 rounded-lg">
        <div className="p-6 border-b border-destructive/50">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Archive this ledger</p>
              <p className="text-sm text-muted-foreground">
                Archiving will hide this ledger from your dashboard but preserve all data.
              </p>
            </div>
            <button 
              onClick={handleArchive}
              className="px-4 py-2 border border-border rounded-md hover:bg-accent text-sm"
            >
              Archive
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 pt-4 border-t border-border">
            <div>
              <p className="font-medium text-foreground">Delete this ledger</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this ledger and all its transactions. This cannot be undone.
              </p>
            </div>
            <button 
              onClick={handleDelete}
              className="px-4 py-2 border border-destructive text-destructive rounded-md hover:bg-destructive/10 text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
