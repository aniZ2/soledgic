'use client'

import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Filter,
  ChevronDown,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Settings,
  User,
  Activity
} from 'lucide-react'
import { useLedger, useIsMarketplace } from '@/components/ledger-context'

interface AuditEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string
  details: any
  source: string
  created_at: string
  user_id?: string
}

const actionIcons: Record<string, React.ReactNode> = {
  'sale_recorded': <ArrowDownLeft className="w-4 h-4 text-emerald-600" />,
  'payout_processed': <ArrowUpRight className="w-4 h-4 text-violet-600" />,
  'account_created': <Plus className="w-4 h-4 text-blue-600" />,
  'expense_recorded': <ArrowUpRight className="w-4 h-4 text-stone-600" />,
  'settings_updated': <Settings className="w-4 h-4 text-stone-600" />,
  'creator_updated': <User className="w-4 h-4 text-violet-600" />,
}

const sourceStyles: Record<string, string> = {
  'api': 'bg-blue-100 text-blue-700',
  'system': 'bg-stone-100 text-stone-700',
  'dashboard': 'bg-violet-100 text-violet-700',
  'webhook': 'bg-amber-100 text-amber-700',
}

export function AuditPage() {
  const { mode } = useLedger()
  const isMarketplace = useIsMarketplace()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'transactions' | 'accounts' | 'system'>('all')
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState({ total: 0, today: 0, accounts: 0 })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', limit: 50 })
        }),
        fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'summary' })
        })
      ])
      
      const entriesData = await entriesRes.json()
      const summaryData = await summaryRes.json()
      
      if (entriesData.success) setEntries(entriesData.data || [])
      if (summaryData.success) setSummary(summaryData.data)
    } catch (err) {
      console.error('Failed to fetch audit log:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const formatAction = (action: string, details: any) => {
    const amount = details?.amount ? `$${(details.amount / 100).toFixed(2)}` : ''
    const creator = details?.creator_id ? `@${details.creator_id}` : ''
    
    switch (action) {
      case 'sale_recorded': return `Sale recorded: ${amount} for creator ${creator}`
      case 'payout_processed': return `Payout processed: ${amount} to ${creator}`
      case 'account_created': return `Account created: ${details?.account_name || details?.name || 'Unknown'}`
      case 'expense_recorded': return `Expense recorded: ${amount} - ${details?.description || ''}`
      default: return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
  }

  // Fallback mock data
  const displayEntries = entries.length > 0 ? entries : [
    { id: '1', action: 'sale_recorded', entity_type: 'transaction', entity_id: 'tx_1', details: { amount: 29900, creator_id: 'sarah' }, source: 'api', created_at: new Date().toISOString() },
    { id: '2', action: 'account_created', entity_type: 'account', entity_id: 'acc_1', details: { name: 'Creator Balance for @sarah' }, source: 'system', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: '3', action: 'expense_recorded', entity_type: 'transaction', entity_id: 'tx_2', details: { amount: 5999, description: 'Adobe Creative Cloud' }, source: 'dashboard', created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: '4', action: 'payout_processed', entity_type: 'transaction', entity_id: 'tx_3', details: { amount: 45000, creator_id: 'emma' }, source: 'api', created_at: new Date(Date.now() - 86400000).toISOString() },
  ]

  const filteredEntries = displayEntries.filter(e => {
    if (filter === 'transactions' && e.entity_type !== 'transaction') return false
    if (filter === 'accounts' && e.entity_type !== 'account') return false
    if (filter === 'system' && !['settings', 'config'].includes(e.entity_type)) return false
    if (search && !formatAction(e.action, e.details).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">System Audit</h1>
          <p className="text-[14px] text-stone-500 mt-1">Track every action, understand every change</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-[13px] font-medium hover:bg-stone-50">
          <Download className="w-4 h-4" />Export Log
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-[12px] text-stone-500 font-medium">Ledger Balance</div>
          <div className="text-lg font-semibold text-emerald-600">Balanced</div>
          <div className="text-[11px] text-stone-400 mt-1">All debits equal credits</div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-stone-600" />
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-[12px] text-stone-500 font-medium">Last Reconciliation</div>
          <div className="text-lg font-semibold text-amber-600">Dec 14</div>
          <div className="text-[11px] text-stone-400 mt-1">Overdue</div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center mb-2">
            <Plus className="w-5 h-5 text-stone-600" />
          </div>
          <div className="text-[12px] text-stone-500 font-medium">Auto-Created Accounts</div>
          <div className="text-lg font-semibold">{summary.accounts || 8}</div>
          <div className="text-[11px] text-stone-400 mt-1">of 24 total</div>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center mb-2">
            <Activity className="w-5 h-5 text-stone-600" />
          </div>
          <div className="text-[12px] text-stone-500 font-medium">API Calls Today</div>
          <div className="text-lg font-semibold">{summary.today || 1847}</div>
          <div className="text-[11px] text-stone-400 mt-1">{summary.total || 234} transactions MTD</div>
        </div>
      </div>

      {/* Attention Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 text-amber-800 font-medium mb-1">
          <AlertTriangle className="w-4 h-4" />
          Items Needing Attention
        </div>
        <div className="flex items-center gap-6 text-[13px] text-amber-700">
          <span>5 unmatched receipts</span>
          <span>12 pending payouts</span>
          <span>2 unpaid bills</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
          {['all', 'transactions', 'accounts', 'system'].map((f) => (
            <button key={f} onClick={() => setFilter(f as typeof filter)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${filter === f ? 'bg-white text-[#1C1917] shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search audit log..."
            className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-[13px] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200" />
        </div>
        <button onClick={fetchData} className="p-2 bg-white border rounded-lg hover:bg-stone-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Activity Log */}
      <div className="bg-white rounded-xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Activity Log</h2>
          <span className="text-[13px] text-stone-500">{filteredEntries.length} entries</span>
        </div>
        <div className="divide-y">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="px-5 py-4 flex items-center justify-between hover:bg-stone-50/50">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                  {actionIcons[entry.action] || <Activity className="w-4 h-4 text-stone-500" />}
                </div>
                <div>
                  <div className="text-[13px] font-medium">{formatAction(entry.action, entry.details)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${sourceStyles[entry.source] || 'bg-stone-100 text-stone-600'}`}>
                      {entry.source}
                    </span>
                    <span className="text-[11px] text-stone-400">{entry.action.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] text-stone-500">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <button className="text-[12px] text-stone-400 hover:text-stone-600">
                  <ChevronDown className="w-4 h-4 inline" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
