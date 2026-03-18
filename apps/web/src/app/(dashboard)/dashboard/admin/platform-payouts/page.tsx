'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'
import { Landmark, ArrowLeft, Send, Clock, DollarSign, CheckCircle } from 'lucide-react'
import Link from 'next/link'

interface PlatformPayout {
  id: string
  amount: number
  status: string
  reference_id: string
  description: string
  metadata: Record<string, unknown> | null
  created_at: string
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

export default function AdminPlatformPayoutsPage() {
  const [balance, setBalance] = useState(0)
  const [payouts, setPayouts] = useState<PlatformPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [showRequestForm, setShowRequestForm] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetchWithCsrf('/api/admin/platform-payouts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBalance(data.balance || 0)
      setPayouts(data.payouts || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRequest = async () => {
    setRequesting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { action: 'request' }
      if (requestAmount) {
        const cents = Math.round(parseFloat(requestAmount) * 100)
        if (!Number.isFinite(cents) || cents <= 0) throw new Error('Invalid amount')
        body.amount = cents
      }
      if (requestDescription) body.description = requestDescription
      body.reference_id = `platform_payout_${Date.now()}`

      const res = await fetchWithCsrf('/api/admin/platform-payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setShowRequestForm(false)
      setRequestAmount('')
      setRequestDescription('')
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payout request failed')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Platform Payouts</h1>
        <p className="text-muted-foreground mt-1">
          Soledgic platform revenue payouts via Mercury ACH
        </p>
      </div>

      {/* Balance Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-muted-foreground">Available Balance</span>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {loading ? '...' : formatCurrency(balance)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 flex items-center justify-center">
          {!showRequestForm ? (
            <button
              onClick={() => setShowRequestForm(true)}
              disabled={loading || balance === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Request Payout
            </button>
          ) : (
            <div className="w-full space-y-3">
              <input
                type="number"
                step="0.01"
                placeholder={`Amount (leave empty for full balance: ${formatCurrency(balance)})`}
                value={requestAmount}
                onChange={(e) => setRequestAmount(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={requestDescription}
                onChange={(e) => setRequestDescription(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {requesting ? 'Processing...' : 'Confirm Payout'}
                </button>
                <button
                  onClick={() => { setShowRequestForm(false); setRequestAmount(''); setRequestDescription('') }}
                  className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* History */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Payout History</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : payouts.length === 0 ? (
          <div className="py-16 text-center">
            <Landmark className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No payouts yet</h3>
            <p className="text-muted-foreground text-sm">Platform revenue payouts will appear here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payouts.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(p.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-foreground">
                    {formatCurrency(Math.round(p.amount * 100))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-muted text-muted-foreground'}`}>
                      {p.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {p.reference_id || '—'}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                    {p.description || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
