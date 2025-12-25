'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewContractorPage() {
  const [ledgers, setLedgers] = useState<any[]>([])
  const [ledgerId, setLedgerId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [taxIdLastFour, setTaxIdLastFour] = useState('')
  const [w9Received, setW9Received] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
  })
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  useEffect(() => {
    async function loadLedgers() {
      const res = await fetch('/api/ledgers')
      const data = await res.json()
      setLedgers(data.ledgers || [])
      if (data.ledgers?.length === 1) {
        setLedgerId(data.ledgers[0].id)
      }
    }
    loadLedgers()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledger_id: ledgerId,
          name,
          email,
          business_name: businessName || undefined,
          tax_id_last_four: taxIdLastFour || undefined,
          w9_received: w9Received,
          payment_method: paymentMethod,
          address: address.street ? address : undefined,
          notes: notes || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add contractor')
      }

      router.push('/contractors')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/contractors"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to contractors
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Add Contractor</h1>
      <p className="mt-2 text-muted-foreground">
        Track payments for 1099 reporting. We don't store full tax IDs.
      </p>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ledger Selection */}
          {ledgers.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Ledger
              </label>
              <select
                value={ledgerId}
                onChange={(e) => setLedgerId(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a ledger</option>
                {ledgers.map((ledger) => (
                  <option key={ledger.id} value={ledger.id}>
                    {ledger.platform_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Full name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Business name (if applicable)
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Smith Consulting LLC"
            />
          </div>

          {/* Tax Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                SSN/EIN last 4 digits
              </label>
              <input
                type="text"
                value={taxIdLastFour}
                onChange={(e) => setTaxIdLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="1234"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                For your reference only. Full tax ID stored on W-9.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Payment method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="bank_transfer">Bank Transfer (ACH)</option>
                <option value="check">Check</option>
                <option value="paypal">PayPal</option>
                <option value="venmo">Venmo</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* W-9 Status */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="w9"
              checked={w9Received}
              onChange={(e) => setW9Received(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="w9" className="text-sm text-foreground">
              W-9 received and on file
            </label>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Mailing address (for 1099)
            </label>
            <div className="space-y-3">
              <input
                type="text"
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Street address"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="City"
                />
                <input
                  type="text"
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2}
                  className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="State"
                />
                <input
                  type="text"
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ZIP"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Internal notes about this contractor"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !name || !email || (!ledgerId && ledgers.length > 1)}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add contractor'}
            </button>
            <Link
              href="/contractors"
              className="px-6 py-3 border border-border rounded-md text-foreground hover:bg-accent text-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
