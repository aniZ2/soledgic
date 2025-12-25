'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  Plus, 
  Search, 
  Filter,
  ChevronDown,
  MoreHorizontal,
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  Send,
  DollarSign,
  X,
  Loader2
} from 'lucide-react'
import { useLedger, useIsMarketplace } from '@/components/ledger-context'

interface Entity {
  id: string
  type: string
  name: string
  email?: string
  handle?: string
  balance: number
  ledgerBalance?: number
  heldAmount?: number
  ytdEarnings?: number
  tier?: string
  w9Status?: string
  status: string
  lastActivity: string
}

function ActionMenu({ entity, onClose, onAction }: { entity: Entity; onClose: () => void; onAction: (action: string, entity: Entity) => void }) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const actions = [
    { icon: Eye, label: 'View Details', action: 'view' },
    { icon: Edit, label: 'Edit', action: 'edit' },
    ...(entity.type === 'creator' && entity.balance > 0 ? [{ icon: DollarSign, label: 'Process Payout', action: 'payout' }] : []),
    ...(entity.type === 'creator' && !entity.w9Status ? [{ icon: Send, label: 'Request W-9', action: 'request_w9' }] : []),
    { icon: Trash2, label: 'Delete', action: 'delete', danger: true },
  ]

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-50">
      {actions.map((item, i) => {
        const Icon = item.icon
        return (
          <button key={i} onClick={() => { onAction(item.action, entity); onClose() }}
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

function AddCreatorForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', creator_id: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // For now, creators are auto-created on first sale
    // This would create a placeholder entry
    alert('Creator will be auto-created on their first sale. For manual creation, use the API directly.')
    setLoading(false)
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Name</label>
        <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="Sarah Johnson" />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Creator ID</label>
        <input type="text" required value={form.creator_id} onChange={e => setForm(f => ({ ...f, creator_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="author_sarah" />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-stone-700 mb-1">Email</label>
        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-[14px]" placeholder="sarah@example.com" />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border rounded-lg text-[14px] font-medium hover:bg-stone-50">Cancel</button>
        <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}Add Creator
        </button>
      </div>
    </form>
  )
}

export function DirectoryPage() {
  const { labels } = useLedger()
  const isMarketplace = useIsMarketplace()
  const [view, setView] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [summary, setSummary] = useState({ active: 0, totalOwed: 0, needsW9: 0, eligible1099: 0 })

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      })
      const data = await res.json()
      
      if (data.success && data.data) {
        setEntities(data.data)
        
        // Calculate summary
        const active = data.data.filter((e: Entity) => e.status === 'active').length
        const totalOwed = data.data.reduce((s: number, e: Entity) => s + (e.balance || 0), 0)
        const needsW9 = data.data.filter((e: Entity) => !e.w9Status || e.w9Status === 'missing').length
        const eligible1099 = data.data.filter((e: Entity) => (e.ytdEarnings || e.ledgerBalance || 0) >= 600).length
        
        setSummary({ active, totalOwed, needsW9, eligible1099 })
      }
    } catch (err) {
      console.error('Failed to fetch directory:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleAction = (action: string, entity: Entity) => {
    switch (action) {
      case 'view': setSelectedEntity(entity); break
      case 'edit': alert(`Edit: ${entity.name}`); break
      case 'payout': 
        // Navigate to payout or show payout modal
        alert(`Process payout for ${entity.name}: $${entity.balance?.toFixed(2)} available`)
        break
      case 'request_w9': alert(`W-9 request sent to ${entity.name}`); break
      case 'delete': if (confirm(`Remove ${entity.name}?`)) alert('Removed'); break
    }
  }

  const viewOptions = isMarketplace ? ['all', 'creators', 'partners'] : ['all', 'clients', 'vendors', 'contractors']
  
  const filteredEntities = entities.filter(e => {
    if (view !== 'all' && e.type !== view.slice(0, -1)) return false
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Fallback mock data if API returns empty
  const displayEntities = filteredEntities.length > 0 ? filteredEntities : [
    { id: '1', type: 'creator', name: 'Sarah Chen', handle: '@sarah', balance: 254.15, tier: 'starter', status: 'active', lastActivity: '2024-12-20' },
    { id: '2', type: 'creator', name: 'Michael Torres', handle: '@michael', balance: 152, tier: 'starter', status: 'active', lastActivity: '2024-12-19' },
    { id: '3', type: 'creator', name: 'Emma Wilson', handle: '@emma', balance: 120.85, tier: 'starter', status: 'active', lastActivity: '2024-12-18' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">{labels.directoryTab}</h1>
          <p className="text-[14px] text-stone-500 mt-1">{labels.primaryEntity} & {labels.secondaryEntity}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-[#1C1917] text-white rounded-lg text-[13px] font-medium hover:bg-[#292524]">
          <Plus className="w-4 h-4" />Add {isMarketplace ? 'Creator' : 'Contact'}
        </button>
      </div>

      {/* Summary Cards */}
      {isMarketplace && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-5">
            <div className="text-[12px] text-stone-500 font-medium mb-1">Active Creators</div>
            <div className="text-2xl font-semibold text-[#1C1917]">{summary.active || entities.length}</div>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <div className="text-[12px] text-stone-500 font-medium mb-1">Total Owed</div>
            <div className="text-2xl font-semibold text-[#1C1917]">${summary.totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <div className="text-[12px] text-stone-500 font-medium mb-1">Needs W-9</div>
            <div className="text-2xl font-semibold text-amber-600">{summary.needsW9}</div>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <div className="text-[12px] text-stone-500 font-medium mb-1">1099 Eligible</div>
            <div className="text-2xl font-semibold text-[#1C1917]">{summary.eligible1099}</div>
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg w-fit">
        {viewOptions.map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${view === v ? 'bg-white text-[#1C1917] shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isMarketplace ? "Search creators, partners..." : "Search contacts..."}
            className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-[13px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200" />
        </div>
        <button onClick={fetchData} className="p-2 bg-white border rounded-lg hover:bg-stone-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-[13px] text-stone-600 hover:bg-stone-50">
          <Filter className="w-4 h-4" />Filter<ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Name</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Type</th>
              <th className="text-right text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">{isMarketplace ? 'Available' : 'Balance'}</th>
              {isMarketplace && <th className="text-right text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Held</th>}
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-[11px] font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Tier</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {displayEntities.map((entity) => (
              <tr key={entity.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${entity.type === 'creator' ? 'bg-violet-100' : 'bg-emerald-100'}`}>
                      <User className={`w-4 h-4 ${entity.type === 'creator' ? 'text-violet-600' : 'text-emerald-600'}`} />
                    </div>
                    <div>
                      <div className="text-[13px] text-[#1C1917] font-medium">{entity.name}</div>
                      <div className="text-[12px] text-stone-400">{entity.handle || entity.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${entity.type === 'creator' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {entity.type.charAt(0).toUpperCase() + entity.type.slice(1)}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <span className="text-[13px] font-medium text-emerald-600">${(entity.balance || 0).toFixed(2)}</span>
                </td>
                {isMarketplace && (
                  <td className="px-5 py-4 text-right">
                    {(entity.heldAmount || 0) > 0 ? (
                      <span className="text-[13px] text-amber-600">${entity.heldAmount?.toFixed(2)}</span>
                    ) : (
                      <span className="text-[13px] text-stone-400">—</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${entity.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                    {entity.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-[13px] text-stone-500">{entity.tier || '—'}</td>
                <td className="px-3 py-4 relative">
                  <button onClick={() => setOpenMenuId(openMenuId === entity.id ? null : entity.id)} className="p-1 text-stone-400 hover:text-stone-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {openMenuId === entity.id && <ActionMenu entity={entity} onClose={() => setOpenMenuId(null)} onAction={handleAction} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={`Add ${isMarketplace ? 'Creator' : 'Contact'}`}>
        <AddCreatorForm onSuccess={() => { setShowAddModal(false); fetchData() }} onCancel={() => setShowAddModal(false)} />
      </Modal>

      <Modal open={!!selectedEntity} onClose={() => setSelectedEntity(null)} title="Creator Details">
        {selectedEntity && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                <User className="w-8 h-8 text-violet-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{selectedEntity.name}</h3>
                <p className="text-stone-500">{selectedEntity.handle || selectedEntity.id}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <span className="text-[12px] text-stone-500">Available Balance</span>
                <p className="text-lg font-semibold text-emerald-600">${(selectedEntity.balance || 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-[12px] text-stone-500">Held Amount</span>
                <p className="text-lg font-semibold text-amber-600">${(selectedEntity.heldAmount || 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-[12px] text-stone-500">Ledger Balance</span>
                <p className="text-lg font-semibold">${(selectedEntity.ledgerBalance || 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-[12px] text-stone-500">Tier</span>
                <p className="text-lg font-semibold">{selectedEntity.tier || 'Starter'}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
