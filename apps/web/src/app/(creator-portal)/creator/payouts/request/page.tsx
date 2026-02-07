'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react'

interface ConnectedAccount {
  id: string
  ledger_id: string
  entity_id: string
  display_name: string
  payouts_enabled: boolean
  default_bank_last4: string
  default_bank_name: string
  balance: number
  ledger_name: string
}

export default function RequestPayoutPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/creator/login')
      return
    }

    // Get connected accounts
    const { data: connectedAccounts } = await supabase
      .from('connected_accounts')
      .select(`
        id,
        ledger_id,
        entity_id,
        display_name,
        payouts_enabled,
        default_bank_last4,
        default_bank_name,
        ledger:ledgers(business_name)
      `)
      .eq('email', user.email)
      .eq('is_active', true)

    if (connectedAccounts) {
      const accountsWithBalance: ConnectedAccount[] = []

      for (const account of connectedAccounts) {
        // Get balance
        const { data: creatorAccount } = await supabase
          .from('accounts')
          .select('balance')
          .eq('ledger_id', account.ledger_id)
          .eq('account_type', 'creator_balance')
          .eq('entity_id', account.entity_id)
          .single()

        accountsWithBalance.push({
          ...account,
          balance: Number(creatorAccount?.balance || 0),
          ledger_name: (account.ledger as any)?.business_name || 'Unknown'
        })
      }

      setAccounts(accountsWithBalance)
      if (accountsWithBalance.length === 1) {
        setSelectedAccount(accountsWithBalance[0].id)
      }
    }

    setLoading(false)
  }

  const selectedAccountData = accounts.find(a => a.id === selectedAccount)
  const maxAmount = selectedAccountData?.balance || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const amountCents = Math.floor(parseFloat(amount) * 100)

    if (!selectedAccount) {
      setError('Please select an account')
      setSubmitting(false)
      return
    }

    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Please enter a valid amount')
      setSubmitting(false)
      return
    }

    if (amountCents > maxAmount) {
      setError('Amount exceeds available balance')
      setSubmitting(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error: insertError } = await supabase
      .from('payout_requests')
      .insert({
        ledger_id: selectedAccountData?.ledger_id,
        connected_account_id: selectedAccount,
        recipient_entity_type: 'creator',
        recipient_entity_id: selectedAccountData?.entity_id,
        requested_amount: amountCents,
        status: 'pending',
        requested_by: user?.id
      })

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/creator/payouts')
    }, 2000)
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Payout Requested</h2>
          <p className="text-muted-foreground mb-4">
            Your payout request for {formatCurrency(Math.floor(parseFloat(amount) * 100))} has been submitted.
            You&apos;ll receive an email when it&apos;s processed.
          </p>
          <Link
            href="/creator/payouts"
            className="text-primary hover:underline"
          >
            View payout status
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/creator/payouts"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Payouts
        </Link>
        <h1 className="text-3xl font-bold text-foreground">Request Payout</h1>
        <p className="text-muted-foreground mt-1">
          Withdraw your earnings to your bank account
        </p>
      </div>

      <div className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Selection */}
          {accounts.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select Account
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.ledger_name} - {formatCurrency(account.balance)} available
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Balance Display */}
          {selectedAccountData && (
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Available Balance</span>
                <span className="text-lg font-bold text-foreground">
                  {formatCurrency(maxAmount)}
                </span>
              </div>
              {selectedAccountData.default_bank_last4 && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">Destination</span>
                  <span className="text-sm text-foreground">
                    {selectedAccountData.default_bank_name} ****{selectedAccountData.default_bank_last4}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={maxAmount / 100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">
                Minimum payout: $1.00
              </span>
              <button
                type="button"
                onClick={() => setAmount((maxAmount / 100).toFixed(2))}
                className="text-sm text-primary hover:underline"
              >
                Withdraw all
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* No Bank Warning */}
          {selectedAccountData && !selectedAccountData.default_bank_last4 && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">No bank account connected</p>
                <p>Please connect a bank account in your settings to receive payouts.</p>
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !selectedAccount || !amount || maxAmount === 0}
            className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Submitting...' : 'Request Payout'}
          </button>

          <p className="text-sm text-muted-foreground text-center">
            Payouts typically arrive within 2-3 business days.
          </p>
        </form>
      </div>
    </div>
  )
}
