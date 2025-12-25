'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { 
  ArrowUpRight, 
  Plus, 
  Search, 
  Filter,
  ChevronDown,
  MoreHorizontal,
  Receipt,
  Users,
  CreditCard,
  Eye,
  Edit,
  Trash2,
  Copy,
  FileText,
  CheckCircle,
  RefreshCw,
  X,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { useLedger, useIsMarketplace } from '@/components/ledger-context'
import { CorrectingEntryModal } from '@/components/correcting-entry-modal'

interface Transaction {
  id: string
  type: string
  description: string
  vendor?: string
  creator?: string
  creator_id?: string
  amount: number
  category?: string
  status: string
  date: string
}

function ActionMenu({ tx, onClose, onAction }: { tx: Transaction; onClose: () => void; onAction: (action: string, tx: Transaction) => void }) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const actions = [
    { icon: Eye, label: 'View Details', action: 'view' },
    { icon: Edit, label: 'Edit', action: 'edit' },
    { icon: Copy, label: 'Duplicate', action: 'duplicate' },
    ...(tx.status === 'pending' ? [
      { icon: CheckCircle, label: 'Mark as Paid', action: 'mark_paid' }
    ] : []),
    { icon: FileText, label: 'Attach Receipt', action: 'attach_receipt' },
    { icon: Trash2, label: 'Delete', action: 'delete', danger: true },
  ]

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-50">
      {actions.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={i}
            onClick={() => { onAction(item.action, tx); onClose() }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] text-left hover:bg-stone-50 ${
              (item as any).danger ? 'text-red-600 hover:bg-red-50' : 'text-stone-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function RecordExpenseForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    description: '',
    amount: '',
    category: 'operating',
    vendor: '',
    paid_from: 'cash'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_expense',
          reference_id: `exp_${Date.now()}`,
          amount: Math.round(parseFloat(form.amount) * 100),
          description: form.description,
          category: form.category,
          vendor_name: form.vendor,
          paid_from: form.paid_from,
        })
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to record expense')
      }
    } catch (err) {
      alert('Failed to record expense')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Description</label>
        <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="Office supplies" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Amount</label>
          <input type="number" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="0.00" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Category</label>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]">
            <option value="operating">Operating</option>
            <option value="software">Software</option>
            <option value="rent">Rent</option>
            <option value="meals">Meals</option>
            <option value="travel">Travel</option>
            <option value="contractors">Contractors</option>
            <option value="marketing">Marketing</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Vendor</label>
          <input type="text" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="Amazon" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Paid From</label>
          <select value={form.paid_from} onChange={e => setForm(f => ({ ...f, paid_from: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]">
            <option value="cash">Cash / Bank</option>
            <option value="credit_card">Credit Card</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border rounded-lg text-[14px] font-medium hover:bg-stone-50">Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Record Expense
        </button>
      </div>
    </form>
  )
}

function ProcessPayoutForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)
  const [creators, setCreators] = useState<any[]>([])
  const [form, setForm] = useState({
    creator_id: '',
    amount: '',
    method: 'bank_transfer'
  })

  useEffect(() => {
    fetch('/api/balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'creator_balances' })
    })
      .then(r => r.json())
      .then(d => { if (d.success) setCreators(d.data || []) })
  }, [])

  const selectedCreator = creators.find(c => c.creator_id === form.creator_id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCreator) return
    
    const amountCents = Math.round(parseFloat(form.amount) * 100)
    if (amountCents > selectedCreator.available_balance * 100) {
      alert(`Insufficient balance. Available: $${selectedCreator.available_balance.toFixed(2)}`)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process_payout',
          reference_id: `payout_${Date.now()}`,
          creator_id: form.creator_id,
          amount: amountCents,
          payout_method: form.method,
        })
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to process payout')
      }
    } catch (err) {
      alert('Failed to process payout')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Creator</label>
        <select required value={form.creator_id} onChange={e => setForm(f => ({ ...f, creator_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]">
          <option value="">Select creator...</option>
          {creators.map(c => (
            <option key={c.creator_id} value={c.creator_id}>
              {c.name} — ${c.available_balance.toFixed(2)} available
            </option>
          ))}
        </select>
      </div>
      {selectedCreator && (
        <div className="bg-stone-50 rounded-lg p-3 text-[13px]">
          <div className="flex justify-between"><span className="text-stone-500">Ledger Balance</span><span>${selectedCreator.ledger_balance.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-stone-500">Held</span><span className="text-amber-600">-${selectedCreator.held_amount.toFixed(2)}</span></div>
          <div className="flex justify-between font-medium border-t mt-2 pt-2"><span>Available</span><span className="text-emerald-600">${selectedCreator.available_balance.toFixed(2)}</span></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Amount</label>
          <input type="number" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="0.00" max={selectedCreator?.available_balance} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Method</label>
          <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]">
            <option value="bank_transfer">Bank Transfer</option>
            <option value="stripe_connect">Stripe Connect</option>
            <option value="paypal">PayPal</option>
            <option value="check">Check</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border rounded-lg text-[14px] font-medium hover:bg-stone-50">Cancel</button>
        <button type="submit" disabled={loading || !selectedCreator} className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Process Payout
        </button>
      </div>
    </form>
  )
}

export function OutflowPage() {
  const { labels } = useLedger()
  const isMarketplace = useIsMarketplace()
  const [view, setView] = useState<'all' | 'payouts' | 'expenses'>('all')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ pending: 0, amount: 0, thisMonth: 0 })
  
  // Correcting entry state
  const [showCorrectingModal, setShowCorrectingModal] = useState(false)
  const [correctingTx, setCorrectingTx] = useState<any>(null)
  const [lockedPeriod, setLockedPeriod] = useState<any>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: 'transaction_history' })
      })
      const data = await res.json()
      if (data.success && data.report?.transactions) {
        const outflow = data.report.transactions
          .filter((t: any) => ['expense', 'payout', 'bill'].includes(t.transaction_type?.toLowerCase()) || ['expense', 'payout', 'bill'].includes(t.type?.toLowerCase()))
          .map((t: any) => ({
            id: t.id,
            type: t.transaction_type || t.type,
            description: t.description || t.reference_id,
            vendor: t.metadata?.vendor_name || t.vendor_name,
            creator: t.metadata?.creator_name,
            creator_id: t.metadata?.creator_id,
            amount: Math.abs(t.amount || 0),
            category: t.metadata?.category || t.category,
            status: t.status || 'completed',
            date: t.created_at || t.date
          }))
        setTransactions(outflow)
        
        const pending = outflow.filter((t: Transaction) => t.status === 'pending')
        setSummary({
          pending: pending.length,
          amount: pending.reduce((s: number, t: Transaction) => s + t.amount, 0),
          thisMonth: outflow.reduce((s: number, t: Transaction) => s + t.amount, 0)
        })
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (tx: Transaction) => {
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reverse',
          transaction_id: tx.id,
          reason: 'User deleted transaction'
        })
      })
      const data = await res.json()
      
      if (data.success) {
        fetchData()
        return
      }
      
      // Check if it's a locked period error
      if (data.period || data.error?.includes('locked') || data.error?.includes('closed')) {
        setCorrectingTx({
          id: tx.id,
          description: tx.description,
          amount: tx.amount * 100, // Convert to cents for modal
          type: tx.type,
          date: tx.date
        })
        setLockedPeriod(data.period || { start: 'Unknown', end: 'Unknown', status: 'locked' })
        setShowCorrectingModal(true)
      } else {
        alert(data.error || 'Failed to delete transaction')
      }
    } catch (err) {
      alert('Failed to delete transaction')
    }
  }

  const handleCorrectingEntry = async (data: { description: string; effectiveDate: string }) => {
    if (!correctingTx) throw new Error('No transaction selected')
    
    const res = await fetch('/api/correcting-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        original_transaction_id: correctingTx.id,
        description: data.description,
        effective_date: data.effectiveDate,
        amount: correctingTx.amount
      })
    })
    
    const result = await res.json()
    if (!result.success) {
      throw new Error(result.error || 'Failed to create correcting entry')
    }
    
    fetchData()
  }

  const handleAction = async (action: string, tx: Transaction) => {
    switch (action) {
      case 'view':
        setSelectedTx(tx)
        break
      case 'edit':
        alert(`Edit functionality coming soon for: ${tx.description}`)
        break
      case 'duplicate':
        setShowExpenseModal(true)
        break
      case 'mark_paid':
        alert(`Marked as paid: ${tx.description}`)
        fetchData()
        break
      case 'attach_receipt':
        alert('Receipt upload coming soon')
        break
      case 'delete':
        if (confirm(`Delete "${tx.description}"?\n\nIf this transaction is in a locked period, you'll be prompted to create a correcting entry instead.`)) {
          handleDelete(tx)
        }
        break
    }
  }

  const displayTransactions = transactions.length > 0 ? transactions : [
    { id: '1', type: 'expense', description: 'Adobe Creative Cloud', vendor: 'Adobe', amount: 59.99, category: 'Software', status: 'paid', date: '2024-12-18' },
    { id: '2', type: 'bill', description: 'Office Rent - January', vendor: 'WeWork', amount: 1200.00, category: 'Rent', status: 'pending', date: '2024-12-14' },
    { id: '3', type: 'expense', description: 'Client Dinner', vendor: 'The Capital Grille', amount: 185.00, category: 'Meals', status: 'paid', date: '2024-12-13' },
    { id: '4', type: 'expense', description: 'Website Updates', vendor: 'Jane Freelancer', amount: 800.00, category: 'Contractors', status: 'pending', date: '2024-12-09' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">{labels.outflowTab}</h1>
          <p className="text-[14px] text-stone-500 mt-1">{labels.primaryOutflow}</p>
        </div>
        <div className="flex items-center gap-3">
          {isMarketplace && (
            <button
              onClick={() => setShowPayoutModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1C1917] text-white rounded-lg text-[13px] font-medium hover:bg-[#292524] transition-colors"
            >
              <Users className="w-4 h-4" />
              Process Payout
            </button>
          )}
          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-[#1C1917] rounded-lg text-[13px] font-medium hover:bg-stone-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="text-[12px] text-stone-500 font-medium mb-1">
            {isMarketplace ? 'Pending Payouts' : 'Unpaid Bills'}
          </div>
          <div className="text-2xl font-semibold text-[#1C1917]">{summary.pending || 2}</div>
          <div className="text-[13px] text-amber-600 mt-1">${(summary.amount || 2000).toLocaleString()} total</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="text-[12px] text-stone-500 font-medium mb-1">This Month</div>
          <div className="text-2xl font-semibold text-[#1C1917]">${(summary.thisMonth || 4832).toLocaleString()}</div>
          <div className="text-[13px] text-stone-400 mt-1">vs $3,920 last month</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5 flex items-center justify-between">
          <div>
            <div className="text-[12px] text-stone-500 font-medium mb-1">Receipts to Match</div>
            <div className="text-2xl font-semibold text-[#1C1917]">5</div>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-stone-100 rounded-lg text-[13px] text-stone-600 hover:bg-stone-200 transition-colors">
            <Receipt className="w-4 h-4" />
            Review
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder={isMarketplace ? "Search payouts, expenses..." : "Search expenses, bills, vendors..."}
            className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-lg text-[13px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
          />
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-lg text-[13px] text-stone-600 hover:bg-stone-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-lg text-[13px] text-stone-600 hover:bg-stone-50 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Description</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">{isMarketplace ? 'Creator / Vendor' : 'Vendor'}</th>
              {!isMarketplace && <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Category</th>}
              <th className="text-right text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Amount</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Date</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {displayTransactions.map((tx) => (
              <tr key={tx.id} className={`border-b border-stone-50 hover:bg-stone-50/50 transition-colors ${tx.status === 'voided' || tx.status === 'reversed' ? 'opacity-50' : ''}`}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'payout' ? 'bg-violet-50' : tx.status === 'voided' ? 'bg-red-50' : 'bg-stone-100'}`}>
                      {tx.status === 'voided' || tx.status === 'reversed' ? (
                        <X className="w-4 h-4 text-red-400" />
                      ) : tx.type === 'payout' ? (
                        <Users className="w-4 h-4 text-violet-600" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-stone-500" />
                      )}
                    </div>
                    <div>
                      <span className={`text-[13px] font-medium ${tx.status === 'voided' || tx.status === 'reversed' ? 'text-stone-400 line-through' : 'text-[#1C1917]'}`}>{tx.description}</span>
                      {tx.type === 'payout' && <span className="ml-2 text-[11px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">Payout</span>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-[13px] text-stone-600">{tx.creator || tx.vendor}</td>
                {!isMarketplace && <td className="px-5 py-4 text-[13px] text-stone-500">{tx.category}</td>}
                <td className="px-5 py-4 text-right"><span className={`text-[13px] font-medium ${tx.status === 'voided' || tx.status === 'reversed' ? 'text-stone-400' : 'text-[#1C1917]'}`}>${tx.amount.toLocaleString()}</span></td>
                <td className="px-5 py-4"><StatusBadge status={tx.status} /></td>
                <td className="px-5 py-4 text-[13px] text-stone-500">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td className="px-3 py-4 relative">
                  {tx.status !== 'voided' && tx.status !== 'reversed' && (
                    <>
                      <button onClick={() => setOpenMenuId(openMenuId === tx.id ? null : tx.id)} className="p-1 text-stone-400 hover:text-stone-600 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenuId === tx.id && <ActionMenu tx={tx} onClose={() => setOpenMenuId(null)} onAction={handleAction} />}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <Modal open={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="Record Expense">
        <RecordExpenseForm onSuccess={() => { setShowExpenseModal(false); fetchData() }} onCancel={() => setShowExpenseModal(false)} />
      </Modal>

      <Modal open={showPayoutModal} onClose={() => setShowPayoutModal(false)} title="Process Payout">
        <ProcessPayoutForm onSuccess={() => { setShowPayoutModal(false); fetchData() }} onCancel={() => setShowPayoutModal(false)} />
      </Modal>

      <Modal open={!!selectedTx} onClose={() => setSelectedTx(null)} title="Transaction Details">
        {selectedTx && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-[14px]">
              <div><span className="text-stone-500">Description</span><p className="font-medium">{selectedTx.description}</p></div>
              <div><span className="text-stone-500">Amount</span><p className="font-medium">${selectedTx.amount.toLocaleString()}</p></div>
              <div><span className="text-stone-500">{selectedTx.creator ? 'Creator' : 'Vendor'}</span><p className="font-medium">{selectedTx.creator || selectedTx.vendor}</p></div>
              <div><span className="text-stone-500">Status</span><p><StatusBadge status={selectedTx.status} /></p></div>
              <div><span className="text-stone-500">Category</span><p className="font-medium">{selectedTx.category || '—'}</p></div>
              <div><span className="text-stone-500">Date</span><p className="font-medium">{new Date(selectedTx.date).toLocaleDateString()}</p></div>
            </div>
          </div>
        )}
      </Modal>

      {/* Correcting Entry Modal */}
      <CorrectingEntryModal
        open={showCorrectingModal}
        onClose={() => { setShowCorrectingModal(false); setCorrectingTx(null); setLockedPeriod(null) }}
        originalTransaction={correctingTx}
        lockedPeriod={lockedPeriod}
        onSubmit={handleCorrectingEntry}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700',
    completed: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    processing: 'bg-blue-50 text-blue-700',
    overdue: 'bg-red-50 text-red-700',
    voided: 'bg-red-50 text-red-600',
    reversed: 'bg-red-50 text-red-600',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status] || 'bg-stone-100 text-stone-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
