'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import Link from 'next/link'
import {
  Building2, RefreshCw, CheckCircle, XCircle,
  Upload, RotateCcw, Eye, MoreHorizontal, CreditCard
} from 'lucide-react'

interface PlaidConnection {
  id: string
  institution_name: string
  status: string
  accounts: any[]
  last_sync_at: string | null
  created_at: string
}

interface PlaidTransaction {
  id: string
  plaid_transaction_id: string
  amount: number
  date: string
  name: string
  merchant_name: string | null
  match_status: string
  match_confidence: number | null
  matched_transaction_id: string | null
}

interface StripeTransaction {
  id: string
  stripe_id: string
  stripe_type: string
  amount: number
  fee: number
  net: number
  currency: string
  status: string
  description: string
  match_status: string
  transaction_id: string | null
  created_at: string
}

interface LedgerTransaction {
  id: string
  reference_id: string
  amount: number
  description: string
  created_at: string
}

type TabType = 'bank' | 'stripe'
const STRIPE_LEGACY_ENABLED = process.env.NEXT_PUBLIC_ENABLE_STRIPE_LEGACY === 'true'

export default function ReconciliationPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [activeTab, setActiveTab] = useState<TabType>('bank')
  const [connections, setConnections] = useState<PlaidConnection[]>([])
  const [plaidTransactions, setPlaidTransactions] = useState<PlaidTransaction[]>([])
  const [stripeTransactions, setStripeTransactions] = useState<StripeTransaction[]>([])
  const [ledgerTransactions, setLedgerTransactions] = useState<LedgerTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [plaidConfigured, setPlaidConfigured] = useState(true)
  const [selectedTxn, setSelectedTxn] = useState<string | null>(null)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [livemode])

	  const loadData = async () => {
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

    // Load Bank (Plaid) transactions
    try {
      const connRes = await callLedgerFunction('plaid', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'list_connections' },
      })
      const connData = await connRes.json()
      
      if (connData.error?.includes('not configured')) {
        setPlaidConfigured(false)
      } else {
        setConnections(connData.data || [])
      }

      const txRes = await callLedgerFunction('plaid', {
        ledgerId: ledger.id,
        method: 'POST',
        body: { action: 'list_transactions' },
      })
      const txData = await txRes.json()
      setPlaidTransactions(txData.data || [])
    } catch {
      setPlaidConfigured(false)
    }

    // Load Stripe transactions only when legacy Stripe mode is enabled.
    if (STRIPE_LEGACY_ENABLED) {
      try {
        const stripeRes = await callLedgerFunction('stripe', {
          ledgerId: ledger.id,
          method: 'POST',
          body: { action: 'list_transactions' },
        })
        const stripeData = await stripeRes.json()
        setStripeTransactions(stripeData.data || [])
      } catch {
        // Stripe not configured, that's ok
      }
    } else {
      setStripeTransactions([])
    }

    // Load ledger transactions for matching
    const { data: ledgerTxns } = await supabase
      .from('transactions')
      .select('id, reference_id, amount, description, created_at')
      .eq('ledger_id', ledger.id)
      .in('transaction_type', ['sale', 'payout', 'refund'])
      .not('status', 'in', '("voided","reversed")')
      .order('created_at', { ascending: false })
      .limit(100)

    setLedgerTransactions(ledgerTxns || [])
    setLoading(false)
  }

  const callAction = async (source: 'plaid' | 'stripe', action: string, txnId: string, ledgerTxnId?: string) => {
    if (!ledgerId) return
    
    const endpoint = source === 'plaid' ? 'plaid' : 'stripe'
    const idField = source === 'plaid' ? 'plaid_transaction_id' : 'stripe_transaction_id'
    
    await callLedgerFunction(endpoint, {
      ledgerId,
      method: 'POST',
      body: {
        action,
        [idField]: txnId,
        ledger_transaction_id: ledgerTxnId,
      },
    })
    setActiveDropdown(null)
    setSelectedTxn(null)
    await loadData()
  }

  const syncTransactions = async () => {
    if (!ledgerId) return
    setSyncing(true)
    await callLedgerFunction('plaid', {
      ledgerId,
      method: 'POST',
      body: { action: 'sync' },
    })
    await loadData()
    setSyncing(false)
  }

  const autoMatchAll = async () => {
    if (!ledgerId) return
    setSyncing(true)
    await callLedgerFunction('plaid', {
      ledgerId,
      method: 'POST',
      body: { action: 'auto_match_all' },
    })
    await loadData()
    setSyncing(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount))
  }

  // Stats for each source
  const bankStats = {
    total: plaidTransactions.length,
    unmatched: plaidTransactions.filter(t => t.match_status === 'unmatched').length,
    matched: plaidTransactions.filter(t => t.match_status === 'matched' || t.match_status === 'auto_matched').length,
    reviewed: plaidTransactions.filter(t => t.match_status === 'reviewed').length,
    excluded: plaidTransactions.filter(t => t.match_status === 'excluded').length,
  }

  const stripeStats = {
    total: stripeTransactions.length,
    unmatched: stripeTransactions.filter(t => t.match_status === 'unmatched').length,
    matched: stripeTransactions.filter(t => t.match_status === 'matched' || t.match_status === 'auto_matched').length,
    reviewed: stripeTransactions.filter(t => t.match_status === 'reviewed').length,
    excluded: stripeTransactions.filter(t => t.match_status === 'excluded').length,
  }

  const currentStats =
    !STRIPE_LEGACY_ENABLED || activeTab === 'bank' ? bankStats : stripeStats
  const currentTransactions =
    !STRIPE_LEGACY_ENABLED || activeTab === 'bank' ? plaidTransactions : stripeTransactions
  const unmatchedTxns = currentTransactions.filter(t => t.match_status === 'unmatched')
  const matchedTxns = currentTransactions.filter(t => t.match_status === 'matched' || t.match_status === 'auto_matched')
  const reviewedTxns = currentTransactions.filter(t => t.match_status === 'reviewed' || t.match_status === 'excluded')

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
          <h1 className="text-3xl font-bold text-foreground">Reconciliation</h1>
          <p className="text-muted-foreground mt-1">
            Match external transactions with your ledger
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/reconciliation/import"
            className="flex items-center gap-2 border border-border px-4 py-2 rounded-md hover:bg-accent"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Link>
          {activeTab === 'bank' && plaidConfigured && connections.length > 0 && (
            <>
              <button
                onClick={autoMatchAll}
                disabled={syncing || bankStats.unmatched === 0}
                className="flex items-center gap-2 border border-border px-4 py-2 rounded-md hover:bg-accent disabled:opacity-50"
              >
                Auto-Match
              </button>
              <button
                onClick={syncTransactions}
                disabled={syncing}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('bank')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'bank' 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Bank
          {bankStats.unmatched > 0 && (
            <span className="bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {bankStats.unmatched}
            </span>
          )}
        </button>
        {STRIPE_LEGACY_ENABLED && (
          <button
            onClick={() => setActiveTab('stripe')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'stripe' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Stripe (Legacy)
            {stripeStats.unmatched > 0 && (
              <span className="bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {stripeStats.unmatched}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Bank Tab - No Config Message */}
      {activeTab === 'bank' && !plaidConfigured && (
        <div className="bg-card border border-border rounded-lg p-8 text-center mb-8">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Connect Your Bank</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Plaid integration is not configured. Import transactions via CSV or contact support.
          </p>
          <Link
            href="/dashboard/reconciliation/import"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Link>
        </div>
      )}

      {/* Stripe Tab - No Transactions Message */}
      {STRIPE_LEGACY_ENABLED && activeTab === 'stripe' && stripeTransactions.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center mb-8">
          <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">No Stripe Transactions</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Configure Stripe webhooks to automatically sync charges, refunds, and payouts.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
          >
            Configure Stripe
          </Link>
        </div>
      )}

      {/* Summary Stats */}
      {currentStats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground mt-1">{currentStats.total}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Need Review</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{currentStats.unmatched}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Matched</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{currentStats.matched}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Reviewed</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{currentStats.reviewed}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Excluded</p>
            <p className="text-2xl font-bold text-muted-foreground mt-1">{currentStats.excluded}</p>
          </div>
        </div>
      )}

      {/* Matching Interface */}
      {unmatchedTxns.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Unmatched External Transactions */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-yellow-500/5">
              <h2 className="text-lg font-semibold text-foreground">
                {activeTab === 'bank' ? 'Bank Transactions' : 'Stripe Transactions'}
              </h2>
              <p className="text-sm text-muted-foreground">Select to match or review</p>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {unmatchedTxns.map((tx: any) => {
                const isBank = activeTab === 'bank'
                const name = isBank ? tx.name : tx.description
                const date = isBank ? tx.date : new Date(tx.created_at).toLocaleDateString()
                const amount = tx.amount
                const subtext = isBank ? (tx.merchant_name || date) : `${tx.stripe_type} • ${date}`
                
                return (
                  <div
                    key={tx.id}
                    className={`px-6 py-3 hover:bg-muted/30 transition-colors ${
                      selectedTxn === tx.id ? 'bg-primary/10 border-l-4 border-primary' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <button
                        onClick={() => setSelectedTxn(selectedTxn === tx.id ? null : tx.id)}
                        className="flex-1 text-left"
                      >
                        <p className="font-medium text-foreground">{name || 'Transaction'}</p>
                        <p className="text-sm text-muted-foreground">{subtext}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {amount > 0 ? '+' : ''}{formatCurrency(amount)}
                        </span>
                        <div className="relative">
                          <button
                            onClick={() => setActiveDropdown(activeDropdown === tx.id ? null : tx.id)}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </button>
                          {activeDropdown === tx.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-10">
                              <button
                                onClick={() => callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'mark_reviewed', tx.id)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                              >
                                <Eye className="w-4 h-4" />
                                Mark as Reviewed
                              </button>
                              <button
                                onClick={() => callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'exclude', tx.id)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 text-red-600"
                              >
                                <XCircle className="w-4 h-4" />
                                Exclude
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Ledger Transactions to Match */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-blue-500/5">
              <h2 className="text-lg font-semibold text-foreground">Ledger Transactions</h2>
              <p className="text-sm text-muted-foreground">
                {selectedTxn ? 'Click to force match' : 'Select a transaction first'}
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {ledgerTransactions.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => {
                    if (selectedTxn) {
                      callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'match', selectedTxn, tx.id)
                    }
                  }}
                  disabled={!selectedTxn}
                  className="w-full px-6 py-3 text-left hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-foreground">{tx.description || tx.reference_id}</p>
                      <code className="text-xs text-muted-foreground">{tx.reference_id}</code>
                    </div>
                    <span className="font-mono text-foreground">{formatCurrency(tx.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selected Transaction Actions */}
      {selectedTxn && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-8">
          <p className="text-sm text-foreground mb-3">
            <strong>Selected:</strong> Click a ledger transaction to match, or:
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'mark_reviewed', selectedTxn)}
              className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded hover:bg-accent"
            >
              <Eye className="w-4 h-4" />
              Mark as Reviewed
            </button>
            <button
              onClick={() => callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'exclude', selectedTxn)}
              className="flex items-center gap-2 text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50"
            >
              <XCircle className="w-4 h-4" />
              Exclude
            </button>
          </div>
        </div>
      )}

      {/* Matched Transactions */}
      {matchedTxns.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Matched</h2>
          </div>
          <div className="divide-y divide-border">
            {matchedTxns.slice(0, 10).map((tx: any) => {
              const isBank = activeTab === 'bank'
              const name = isBank ? tx.name : tx.description
              const date = isBank ? tx.date : new Date(tx.created_at).toLocaleDateString()
              
              return (
                <div key={tx.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground">{name || 'Transaction'}</p>
                      <p className="text-sm text-muted-foreground">{date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">{formatCurrency(tx.amount)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      tx.match_status === 'auto_matched' 
                        ? 'bg-blue-500/10 text-blue-600' 
                        : 'bg-green-500/10 text-green-600'
                    }`}>
                      {tx.match_status === 'auto_matched' ? 'Auto' : 'Manual'}
                    </span>
                    <button
                      onClick={() => callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'unmatch', tx.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Unmatch
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Reviewed & Excluded */}
      {reviewedTxns.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Reviewed & Excluded</h2>
          </div>
          <div className="divide-y divide-border">
            {reviewedTxns.slice(0, 10).map((tx: any) => {
              const isBank = activeTab === 'bank'
              const name = isBank ? tx.name : tx.description
              const date = isBank ? tx.date : new Date(tx.created_at).toLocaleDateString()
              
              return (
                <div key={tx.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {tx.match_status === 'reviewed' ? (
                      <Eye className="w-5 h-5 text-blue-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{name || 'Transaction'}</p>
                      <p className="text-sm text-muted-foreground">{date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-muted-foreground">{formatCurrency(tx.amount)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      tx.match_status === 'reviewed' 
                        ? 'bg-blue-500/10 text-blue-600' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tx.match_status === 'reviewed' ? 'Reviewed' : 'Excluded'}
                    </span>
                    <button
                      onClick={() => callAction(activeTab === 'bank' ? 'plaid' : 'stripe', 'restore', tx.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
