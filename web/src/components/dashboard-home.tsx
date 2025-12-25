'use client'

import React, { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Users, TrendingUp, DollarSign, Activity, RefreshCw } from 'lucide-react'
import { useLedger } from '@/components/ledger-context'

interface CreatorBalance {
  creator_id: string
  name: string
  tier: string
  ledger_balance: number
  held_amount: number
  available_balance: number
}

interface Summary {
  total_assets: number
  total_liabilities: number
  total_revenue: number
  total_expenses: number
  net_income: number
  net_worth: number
}

// Mini sparkline component
function Sparkline({ data, color = 'emerald' }: { data: number[]; color?: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(' ')
  
  return (
    <svg viewBox="0 0 100 100" className="w-16 h-8" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color === 'emerald' ? '#10b981' : '#8b5cf6'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

export function DashboardHome() {
  const { mode } = useLedger()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [creators, setCreators] = useState<CreatorBalance[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [summaryRes, creatorsRes] = await Promise.all([
        fetch('/api/balances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'summary' }) }),
        fetch('/api/balances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'creator_balances' }) })
      ])
      
      const summaryData = await summaryRes.json()
      const creatorsData = await creatorsRes.json()
      
      if (summaryData.success) setSummary(summaryData.data)
      if (creatorsData.success) setCreators(creatorsData.data || [])
    } catch (err) {
      console.error('Failed to fetch data:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const formatMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Sample trend data for sparkline
  const revenueTrend = [120, 145, 132, 168, 155, 178, 195]

  const stats = summary ? (mode === 'marketplace' ? [
    { label: 'Total Assets', value: formatMoney(summary.total_assets), icon: DollarSign, trend: null },
    { label: 'Platform Revenue', value: formatMoney(summary.total_revenue), icon: TrendingUp, trend: revenueTrend },
    { label: 'Creator Balances', value: formatMoney(summary.total_liabilities), icon: Activity, trend: null },
    { label: 'Active Creators', value: String(creators.length), icon: Users, trend: null },
  ] : [
    { label: 'Total Revenue', value: formatMoney(summary.total_revenue), icon: DollarSign, trend: revenueTrend },
    { label: 'Total Expenses', value: formatMoney(summary.total_expenses), icon: TrendingUp, trend: null },
    { label: 'Net Income', value: formatMoney(summary.net_income), icon: Activity, trend: null },
    { label: 'Net Worth', value: formatMoney(summary.net_worth), icon: Users, trend: null },
  ]) : []

  const topCreators = [...creators].sort((a, b) => b.ledger_balance - a.ledger_balance).slice(0, 5)

  // Mock recent transactions for display
  const recentTransactions = [
    { id: '1', type: 'sale', description: 'Book Sale - The Silted Path', amount: 29.99, creator: 'Sarah Chen', time: '2 hours ago' },
    { id: '2', type: 'sale', description: 'Course Purchase', amount: 149.00, creator: 'Michael Torres', time: '5 hours ago' },
    { id: '3', type: 'payout', description: 'Payout to creator', amount: -450.00, creator: 'Emma Wilson', time: 'Yesterday' },
    { id: '4', type: 'sale', description: 'Audiobook - Midnight Echoes', amount: 19.99, creator: 'Sarah Chen', time: 'Yesterday' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">Dashboard</h1>
          <p className="text-[14px] text-stone-500 mt-1">{mode === 'marketplace' ? 'Platform overview' : 'Business overview'}</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-[13px] hover:bg-stone-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards with subtle background */}
      <div className="bg-stone-50/50 rounded-2xl p-4">
        {loading && !summary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-xl border p-5 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-stone-200 mb-3"></div>
                <div className="h-3 bg-stone-200 rounded w-24 mb-2"></div>
                <div className="h-6 bg-stone-200 rounded w-20"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, i) => {
              const Icon = stat.icon
              return (
                <div key={i} className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600">
                      <Icon className="w-5 h-5" />
                    </div>
                    {stat.trend && <Sparkline data={stat.trend} />}
                  </div>
                  <div className="text-[12px] text-stone-500">{stat.label}</div>
                  <div className="text-xl font-semibold text-[#1C1917] mt-1">{stat.value}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions with subtle background wrapper */}
        <div className="lg:col-span-2 bg-stone-50/50 rounded-2xl p-4">
          <div className="bg-white rounded-xl border">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">{mode === 'marketplace' ? 'Recent Transactions' : 'Recent Activity'}</h2>
              <button className="text-[13px] text-violet-600 font-medium hover:text-violet-700">View all</button>
            </div>
            <div className="divide-y">
              {creators.length > 0 ? creators.slice(0, 4).map((creator) => (
                <div key={creator.creator_id} className="px-5 py-4 flex items-center justify-between hover:bg-stone-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-[13px] font-medium">{creator.name}</div>
                      <div className="text-[12px] text-stone-400">{creator.tier} • {creator.creator_id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-semibold text-emerald-600">{formatMoney(creator.available_balance)}</div>
                    {creator.held_amount > 0 && (
                      <div className="text-[11px] text-stone-400">{formatMoney(creator.held_amount)} held</div>
                    )}
                  </div>
                </div>
              )) : recentTransactions.map((tx) => (
                <div key={tx.id} className="px-5 py-4 flex items-center justify-between hover:bg-stone-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tx.type === 'sale' ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'}`}>
                      {tx.type === 'sale' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium">{tx.description}</div>
                      <div className="text-[12px] text-stone-400">{tx.creator} • {tx.time}</div>
                    </div>
                  </div>
                  <div className={`text-[14px] font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-stone-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar panels */}
        <div className="space-y-4">
          {/* Needs Attention - with amber accent */}
          <div className="bg-amber-50/50 rounded-2xl p-4">
            <div className="bg-white rounded-xl border border-amber-100 p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Needs Attention
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone-600">Pending payouts</span>
                  <span className="font-medium text-amber-700">12</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone-600">Unmatched receipts</span>
                  <span className="font-medium">5</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone-600">Held funds releasing</span>
                  <span className="font-medium">{formatMoney(creators.reduce((s, c) => s + c.held_amount, 0) || 1240)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-stone-50/50 rounded-2xl p-4">
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone-600">Total Creators</span>
                  <span className="font-medium">{creators.length || 7}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone-600">With Balances</span>
                  <span className="font-medium">{creators.filter(c => c.ledger_balance > 0).length || 7}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-stone-600">Total Held</span>
                  <span className="font-medium">{formatMoney(creators.reduce((s, c) => s + c.held_amount, 0) || 14.31)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Creators */}
          {mode === 'marketplace' && (
            <div className="bg-violet-50/30 rounded-2xl p-4">
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold mb-4">Top Creators</h3>
                <div className="space-y-3">
                  {(topCreators.length > 0 ? topCreators.slice(0, 3) : [
                    { creator_id: '1', name: 'Sarah Chen', tier: 'Gold', ledger_balance: 254.15 },
                    { creator_id: '2', name: 'Michael Torres', tier: 'Silver', ledger_balance: 152 },
                    { creator_id: '3', name: 'Emma Wilson', tier: 'Bronze', ledger_balance: 120.85 },
                  ]).map((c) => (
                    <div key={c.creator_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center text-[12px] font-medium text-stone-600">
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium">{c.name}</div>
                          <div className="text-[11px] text-stone-400">{c.tier}</div>
                        </div>
                      </div>
                      <div className="text-[13px] font-semibold text-emerald-600">{formatMoney(c.ledger_balance)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
