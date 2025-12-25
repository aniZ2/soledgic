'use client'

import React, { useState, useEffect } from 'react'
import { 
  Check, 
  X, 
  Link2, 
  Unlink, 
  Search, 
  Filter,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Building2,
  ArrowRight,
  Loader2,
  Download,
  Upload,
  Sparkles,
  Lock
} from 'lucide-react'

interface LedgerTransaction {
  id: string
  referenceId: string
  description: string
  amount: number
  date: string
  status: string
  isReconciled: boolean
  bankMatchId?: string
}

interface BankTransaction {
  id: string
  description: string
  amount: number
  date: string
  matched: boolean
  matchedToId?: string
}

interface MatchPair {
  ledgerTx: LedgerTransaction
  bankTx: BankTransaction
}

export function BankReconciliationPage() {
  const [ledgerTransactions, setLedgerTransactions] = useState<LedgerTransaction[]>([])
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState<string | null>(null)
  const [selectedLedger, setSelectedLedger] = useState<string | null>(null)
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [searchLedger, setSearchLedger] = useState('')
  const [searchBank, setSearchBank] = useState('')
  const [showMatched, setShowMatched] = useState(false)
  const [autoMatchRunning, setAutoMatchRunning] = useState(false)
  const [summary, setSummary] = useState({ matched: 0, unmatched: 0, matchedAmount: 0, unmatchedAmount: 0 })

  // Fetch unmatched transactions
  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch from API
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_unmatched' })
      })
      const data = await res.json()
      
      if (data.success) {
        const txs = (data.transactions || []).map((t: any) => ({
          id: t.id,
          referenceId: t.reference_id,
          description: t.description,
          amount: t.amount,
          date: t.created_at,
          status: t.status,
          isReconciled: t.metadata?.reconciled || false,
          bankMatchId: t.metadata?.bank_match_id
        }))
        setLedgerTransactions(txs)
        
        // Calculate summary
        const matched = txs.filter((t: LedgerTransaction) => t.isReconciled)
        const unmatched = txs.filter((t: LedgerTransaction) => !t.isReconciled)
        setSummary({
          matched: matched.length,
          unmatched: unmatched.length,
          matchedAmount: matched.reduce((s: number, t: LedgerTransaction) => s + t.amount, 0),
          unmatchedAmount: unmatched.reduce((s: number, t: LedgerTransaction) => s + t.amount, 0)
        })
      }
    } catch (err) {
      console.error('Failed to fetch:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Demo bank transactions (in production, these would come from Plaid/bank feed)
  useEffect(() => {
    setBankTransactions([
      { id: 'bank_1', description: 'STRIPE TRANSFER', amount: 1250.00, date: '2024-12-18', matched: false },
      { id: 'bank_2', description: 'PAYPAL PAYMENT', amount: 89.99, date: '2024-12-17', matched: false },
      { id: 'bank_3', description: 'STRIPE TRANSFER', amount: 450.00, date: '2024-12-16', matched: false },
      { id: 'bank_4', description: 'CHECK DEP #1234', amount: 2000.00, date: '2024-12-15', matched: false },
      { id: 'bank_5', description: 'STRIPE PAYOUT', amount: 875.50, date: '2024-12-14', matched: false },
    ])
  }, [])

  // Match transactions
  const handleMatch = async () => {
    if (!selectedLedger || !selectedBank) return
    
    setMatching(selectedLedger)
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'match',
          transaction_id: selectedLedger,
          bank_transaction_id: selectedBank
        })
      })
      const data = await res.json()
      
      if (data.success) {
        // Update local state
        setLedgerTransactions(prev => prev.map(t => 
          t.id === selectedLedger ? { ...t, isReconciled: true, bankMatchId: data.match_id } : t
        ))
        setBankTransactions(prev => prev.map(t =>
          t.id === selectedBank ? { ...t, matched: true, matchedToId: selectedLedger } : t
        ))
        setSelectedLedger(null)
        setSelectedBank(null)
        
        setSummary(prev => ({
          ...prev,
          matched: prev.matched + 1,
          unmatched: prev.unmatched - 1
        }))
      } else {
        alert(data.error || 'Failed to match')
      }
    } catch (err) {
      alert('Failed to match transactions')
    }
    setMatching(null)
  }

  // Unmatch
  const handleUnmatch = async (txId: string) => {
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unmatch', transaction_id: txId })
      })
      const data = await res.json()
      
      if (data.success) {
        setLedgerTransactions(prev => prev.map(t =>
          t.id === txId ? { ...t, isReconciled: false, bankMatchId: undefined } : t
        ))
        fetchData()
      }
    } catch (err) {
      alert('Failed to unmatch')
    }
  }

  // Auto-match by amount
  const handleAutoMatch = async () => {
    setAutoMatchRunning(true)
    
    // Simple auto-match by exact amount
    const unmatched = ledgerTransactions.filter(t => !t.isReconciled)
    const unmatchedBank = bankTransactions.filter(t => !t.matched)
    
    let matchCount = 0
    for (const ledgerTx of unmatched) {
      const bankMatch = unmatchedBank.find(b => 
        Math.abs(b.amount - ledgerTx.amount) < 0.01 && !b.matched
      )
      if (bankMatch) {
        try {
          const res = await fetch('/api/reconcile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'match',
              transaction_id: ledgerTx.id,
              bank_transaction_id: bankMatch.id
            })
          })
          if ((await res.json()).success) {
            matchCount++
            bankMatch.matched = true
          }
        } catch {}
      }
    }
    
    setAutoMatchRunning(false)
    fetchData()
    alert(`Auto-matched ${matchCount} transactions`)
  }

  // Filter transactions
  const filteredLedger = ledgerTransactions
    .filter(t => showMatched || !t.isReconciled)
    .filter(t => t.description?.toLowerCase().includes(searchLedger.toLowerCase()) || 
                 t.referenceId?.toLowerCase().includes(searchLedger.toLowerCase()))

  const filteredBank = bankTransactions
    .filter(t => showMatched || !t.matched)
    .filter(t => t.description.toLowerCase().includes(searchBank.toLowerCase()))

  const formatAmount = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">Bank Reconciliation</h1>
          <p className="text-[14px] text-stone-500 mt-1">Match ledger entries with bank transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoMatch}
            disabled={autoMatchRunning}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-[13px] font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {autoMatchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Auto-Match
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-lg text-[13px] font-medium hover:bg-stone-50">
            <Upload className="w-4 h-4" />
            Import Bank Statement
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-[12px] text-stone-500 font-medium">Reconciled</div>
              <div className="text-xl font-semibold text-[#1C1917]">{summary.matched}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-[12px] text-stone-500 font-medium">Unreconciled</div>
              <div className="text-xl font-semibold text-[#1C1917]">{summary.unmatched}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-[12px] text-stone-500 font-medium">Bank Balance</div>
              <div className="text-xl font-semibold text-[#1C1917]">$24,532.00</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="text-[12px] text-stone-500 font-medium">Difference</div>
              <div className="text-xl font-semibold text-red-600">-$127.50</div>
            </div>
          </div>
        </div>
      </div>

      {/* Match Button (when both selected) */}
      {selectedLedger && selectedBank && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link2 className="w-5 h-5 text-emerald-600" />
            <span className="text-[14px] text-emerald-800">
              Ready to match selected transactions
            </span>
          </div>
          <button
            onClick={handleMatch}
            disabled={!!matching}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirm Match
          </button>
        </div>
      )}

      {/* Two-column matching view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ledger Transactions */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-semibold text-[#1C1917]">Ledger Transactions</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[12px] text-stone-500">
                <input 
                  type="checkbox" 
                  checked={showMatched} 
                  onChange={(e) => setShowMatched(e.target.checked)}
                  className="rounded"
                />
                Show matched
              </label>
              <button onClick={fetchData} className="p-1.5 hover:bg-stone-100 rounded">
                <RefreshCw className={`w-4 h-4 text-stone-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchLedger}
                onChange={(e) => setSearchLedger(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-[13px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {filteredLedger.length === 0 ? (
              <div className="p-8 text-center text-stone-500 text-[14px]">
                {loading ? 'Loading...' : 'No transactions to reconcile'}
              </div>
            ) : (
              filteredLedger.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => !tx.isReconciled && setSelectedLedger(selectedLedger === tx.id ? null : tx.id)}
                  className={`px-5 py-3 border-b border-stone-50 cursor-pointer transition-colors ${
                    tx.isReconciled 
                      ? 'bg-emerald-50/50 opacity-60' 
                      : selectedLedger === tx.id 
                        ? 'bg-blue-50 border-l-2 border-l-blue-500' 
                        : 'hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {tx.isReconciled ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      ) : (
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          selectedLedger === tx.id ? 'border-blue-500 bg-blue-500' : 'border-stone-300'
                        }`}>
                          {selectedLedger === tx.id && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                      )}
                      <div>
                        <p className="text-[13px] font-medium text-[#1C1917]">{tx.description || tx.referenceId}</p>
                        <p className="text-[12px] text-stone-500">{formatDate(tx.date)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-medium text-[#1C1917]">{formatAmount(tx.amount)}</p>
                      {tx.isReconciled && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleUnmatch(tx.id) }}
                          className="text-[11px] text-red-600 hover:underline"
                        >
                          Unmatch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bank Transactions */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-semibold text-[#1C1917]">Bank Statement</h2>
            <span className="text-[12px] text-stone-500">Chase •••• 4521</span>
          </div>
          
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search bank transactions..."
                value={searchBank}
                onChange={(e) => setSearchBank(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-[13px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {filteredBank.map((tx) => (
              <div
                key={tx.id}
                onClick={() => !tx.matched && setSelectedBank(selectedBank === tx.id ? null : tx.id)}
                className={`px-5 py-3 border-b border-stone-50 cursor-pointer transition-colors ${
                  tx.matched 
                    ? 'bg-emerald-50/50 opacity-60' 
                    : selectedBank === tx.id 
                      ? 'bg-blue-50 border-l-2 border-l-blue-500' 
                      : 'hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {tx.matched ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                    ) : (
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedBank === tx.id ? 'border-blue-500 bg-blue-500' : 'border-stone-300'
                      }`}>
                        {selectedBank === tx.id && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    )}
                    <div>
                      <p className="text-[13px] font-medium text-[#1C1917]">{tx.description}</p>
                      <p className="text-[12px] text-stone-500">{formatDate(tx.date)}</p>
                    </div>
                  </div>
                  <p className="text-[14px] font-medium text-[#1C1917]">{formatAmount(tx.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="bg-stone-50 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-stone-400 flex-shrink-0 mt-0.5" />
        <div className="text-[13px] text-stone-600">
          <p className="font-medium text-stone-700 mb-1">How to reconcile</p>
          <p>Select one transaction from each column, then click "Confirm Match" to link them. 
          Matched transactions will be marked as reconciled and cannot be modified in locked periods.
          Use "Auto-Match" to automatically match transactions with identical amounts.</p>
        </div>
      </div>
    </div>
  )
}
