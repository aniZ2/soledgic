'use client'

import React, { useState, useRef, useEffect } from 'react'
import { 
  ArrowDownLeft, 
  Plus, 
  Search, 
  Filter,
  ChevronDown,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Copy,
  FileText,
  RefreshCw,
  Send,
  X,
  Loader2
} from 'lucide-react'
import { useLedger, useIsMarketplace } from '@/components/ledger-context'

interface Transaction {
  id: string
  type: string
  description: string
  customer?: string
  creator?: string
  creator_id?: string
  amount: number
  platformCut?: number
  status: string
  date: string
}

function ActionMenu({ tx, onClose, onAction }: { tx: Transaction; onClose: () => void; onAction: (action: string, tx: Transaction) => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const isMarketplace = useIsMarketplace()

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
    ...(!isMarketplace && tx.status === 'pending' ? [{ icon: Send, label: 'Send Reminder', action: 'remind' }] : []),
    ...(tx.status !== 'refunded' ? [{ icon: RefreshCw, label: 'Process Refund', action: 'refund' }] : []),
    { icon: FileText, label: 'Download Receipt', action: 'receipt' },
    { icon: Trash2, label: 'Delete', action: 'delete', danger: true },
  ]

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-50">
      {actions.map((item, i) => {
        const Icon = item.icon
        return (
          <button key={i} onClick={() => { onAction(item.action, tx); onClose() }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] text-left hover:bg-stone-50 ${(item as any).danger ? 'text-red-600 hover:bg-red-50' : 'text-stone-700'}`}>
            <Icon className="w-4 h-4" />{item.label}
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

function RecordSaleForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', creator_id: '', product_name: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_sale',
          reference_id: `sale_${Date.now()}`,
          creator_id: form.creator_id || `creator_${Date.now()}`,
          amount: Math.round(parseFloat(form.amount) * 100),
          product_name: form.product_name || form.description,
        })
      })
      const data = await res.json()
      if (data.success) onSuccess()
      else alert(data.error || 'Failed to record sale')
    } catch (err) { alert('Failed to record sale') }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Product Name</label>
        <input type="text" required value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="eBook: Getting Started" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Amount ($)</label>
          <input type="number" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="29.99" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Creator ID</label>
          <input type="text" required value={form.creator_id} onChange={e => setForm(f => ({ ...f, creator_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="author_123" />
        </div>
      </div>
      <div className="bg-stone-50 rounded-lg p-3 text-[13px] text-stone-600">
        Platform will receive 20% (${(parseFloat(form.amount || '0') * 0.2).toFixed(2)})<br/>
        Creator will receive 80% (${(parseFloat(form.amount || '0') * 0.8).toFixed(2)})
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border rounded-lg text-[14px] font-medium hover:bg-stone-50">Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}Record Sale
        </button>
      </div>
    </form>
  )
}

function RecordIncomeForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', category: 'services', customer: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_income',
          reference_id: `inc_${Date.now()}`,
          amount: Math.round(parseFloat(form.amount) * 100),
          description: form.description,
          category: form.category,
          customer_name: form.customer,
        })
      })
      const data = await res.json()
      if (data.success) onSuccess()
      else alert(data.error || 'Failed to record income')
    } catch (err) { alert('Failed to record income') }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Description</label>
        <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="Invoice #1042 - Consulting" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Amount ($)</label>
          <input type="number" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="2500.00" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1">Category</label>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]">
            <option value="sales">Sales</option>
            <option value="services">Services</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Customer</label>
        <input type="text" value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="Acme Corp" />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border rounded-lg text-[14px] font-medium hover:bg-stone-50">Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}Record Income
        </button>
      </div>
    </form>
  )
}

export function InflowPage() {
  const { labels } = useLedger()
  const isMarketplace = useIsMarketplace()
  const [filter, setFilter] = useState<'all' | 'pending' | 'received' | 'overdue'>('all')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

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
        const inflow = data.report.transactions
          .filter((t: any) => ['sale', 'income', 'payment'].includes(t.type?.toLowerCase()))
          .map((t: any) => ({
            id: t.id,
            type: t.type,
            description: t.description || t.product_name || t.reference_id,
            customer: t.customer_name,
            creator: t.creator_name || t.creator_id,
            amount: Math.abs(t.amount || 0),
            platformCut: t.platform_amount,
            status: t.status || 'completed',
            date: t.created_at || t.date
          }))
        setTransactions(inflow)
      }
    } catch (err) { console.error('Failed to fetch:', err) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleAction = (action: string, tx: Transaction) => {
    switch (action) {
      case 'view': setSelectedTx(tx); break
      case 'edit': alert(`Edit: ${tx.description}`); break
      case 'duplicate': setShowModal(true); break
      case 'remind': alert(`Reminder sent for: ${tx.description}`); break
      case 'refund': alert(`Refund initiated for: ${tx.description}`); break
      case 'receipt': alert(`Downloading receipt for: ${tx.description}`); break
      case 'delete': if (confirm(`Delete "${tx.description}"?`)) alert('Deleted'); break
    }
  }

  const displayTransactions = transactions.length > 0 ? transactions : [
    { id: '1', type: 'income', description: 'Invoice #1042', customer: 'Acme Corp', amount: 2500.00, status: 'received', date: '2024-12-19' },
    { id: '2', type: 'income', description: 'Invoice #1041', customer: 'Beta Inc', amount: 1800.00, status: 'received', date: '2024-12-17' },
    { id: '3', type: 'income', description: 'Invoice #1040', customer: 'Gamma LLC', amount: 3200.00, status: 'pending', date: '2024-12-14' },
    { id: '4', type: 'income', description: 'Invoice #1039', customer: 'Delta Co', amount: 950.00, status: 'overdue', date: '2024-11-30' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">{labels.inflowTab}</h1>
          <p className="text-[14px] text-stone-500 mt-1">{labels.primaryInflow}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-[#1C1917] text-white rounded-lg text-[13px] font-medium hover:bg-[#292524]">
          <Plus className="w-4 h-4" />{labels.recordInflowAction}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input type="text" placeholder={isMarketplace ? "Search sales, creators..." : "Search invoices, clients..."} className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-[13px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200" />
        </div>
        <button onClick={fetchData} className="p-2 bg-white border rounded-lg hover:bg-stone-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-[13px] text-stone-600 hover:bg-stone-50">
          <Filter className="w-4 h-4" />Filter<ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg w-fit">
        {['all', 'pending', 'received', 'overdue'].map((status) => (
          <button key={status} onClick={() => setFilter(status as typeof filter)}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${filter === status ? 'bg-white text-[#1C1917] shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Description</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">{isMarketplace ? 'Creator' : 'Customer'}</th>
              <th className="text-right text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Amount</th>
              {isMarketplace && <th className="text-right text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Platform Cut</th>}
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Date</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {displayTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="text-[13px] text-[#1C1917] font-medium">{tx.description}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-[13px] text-stone-600">{isMarketplace ? tx.creator : tx.customer}</td>
                <td className="px-5 py-4 text-right"><span className="text-[13px] font-medium text-[#1C1917]">${tx.amount.toLocaleString()}</span></td>
                {isMarketplace && <td className="px-5 py-4 text-right"><span className="text-[13px] text-emerald-600 font-medium">+${(tx.platformCut || tx.amount * 0.2).toLocaleString()}</span></td>}
                <td className="px-5 py-4"><StatusBadge status={tx.status} /></td>
                <td className="px-5 py-4 text-[13px] text-stone-500">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                <td className="px-3 py-4 relative">
                  <button onClick={() => setOpenMenuId(openMenuId === tx.id ? null : tx.id)} className="p-1 text-stone-400 hover:text-stone-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {openMenuId === tx.id && <ActionMenu tx={tx} onClose={() => setOpenMenuId(null)} onAction={handleAction} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={isMarketplace ? 'Record Sale' : 'Record Income'}>
        {isMarketplace 
          ? <RecordSaleForm onSuccess={() => { setShowModal(false); fetchData() }} onCancel={() => setShowModal(false)} />
          : <RecordIncomeForm onSuccess={() => { setShowModal(false); fetchData() }} onCancel={() => setShowModal(false)} />
        }
      </Modal>

      <Modal open={!!selectedTx} onClose={() => setSelectedTx(null)} title="Transaction Details">
        {selectedTx && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-[14px]">
              <div><span className="text-stone-500">Description</span><p className="font-medium">{selectedTx.description}</p></div>
              <div><span className="text-stone-500">Amount</span><p className="font-medium">${selectedTx.amount.toLocaleString()}</p></div>
              <div><span className="text-stone-500">{selectedTx.creator ? 'Creator' : 'Customer'}</span><p className="font-medium">{selectedTx.creator || selectedTx.customer}</p></div>
              <div><span className="text-stone-500">Status</span><p><StatusBadge status={selectedTx.status} /></p></div>
              {isMarketplace && selectedTx.platformCut && <div><span className="text-stone-500">Platform Cut</span><p className="font-medium text-emerald-600">${selectedTx.platformCut.toLocaleString()}</p></div>}
              <div><span className="text-stone-500">Date</span><p className="font-medium">{new Date(selectedTx.date).toLocaleDateString()}</p></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    received: 'bg-emerald-50 text-emerald-700',
    completed: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    overdue: 'bg-red-50 text-red-700',
    refunded: 'bg-stone-100 text-stone-600',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status] || 'bg-stone-100 text-stone-600'}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}
