'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowDownLeft, ArrowUpRight, Users, FileText, Receipt, Settings, Plus, Shield, Landmark } from 'lucide-react'
import { useLedger } from '@/components/ledger-context'

interface Command {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  action: () => void
  keywords: string[]
  category: 'navigation' | 'action' | 'report'
}

export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter()
  const { mode, labels } = useLedger()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const allCommands: Command[] = useMemo(() => [
    { id: 'record-income', label: mode === 'marketplace' ? 'Record Sale' : 'Record Income', description: 'Log revenue', icon: <ArrowDownLeft className="w-4 h-4" />, action: () => router.push('/dashboard/inflow/new'), keywords: ['income', 'revenue', 'sale'], category: 'action' },
    { id: 'record-expense', label: 'Record Expense', description: 'Log expense', icon: <ArrowUpRight className="w-4 h-4" />, action: () => router.push('/dashboard/outflow/new'), keywords: ['expense', 'cost'], category: 'action' },
    { id: 'process-payout', label: mode === 'marketplace' ? 'Process Payout' : 'Pay Contractor', description: 'Pay out', icon: <Users className="w-4 h-4" />, action: () => router.push('/dashboard/outflow/payout'), keywords: ['payout', 'pay'], category: 'action' },
    { id: 'add-contact', label: mode === 'marketplace' ? 'Add Creator' : 'Add Contact', description: 'New entity', icon: <Plus className="w-4 h-4" />, action: () => router.push('/dashboard/directory/new'), keywords: ['add', 'new', 'creator'], category: 'action' },
    { id: 'nav-dashboard', label: 'Dashboard', description: 'Overview', icon: <Landmark className="w-4 h-4" />, action: () => router.push('/dashboard'), keywords: ['home', 'dashboard'], category: 'navigation' },
    { id: 'nav-inflow', label: labels.inflowTab, description: labels.primaryInflow, icon: <ArrowDownLeft className="w-4 h-4" />, action: () => router.push('/dashboard/inflow'), keywords: ['inflow', 'revenue', 'sales'], category: 'navigation' },
    { id: 'nav-outflow', label: labels.outflowTab, description: labels.primaryOutflow, icon: <ArrowUpRight className="w-4 h-4" />, action: () => router.push('/dashboard/outflow'), keywords: ['outflow', 'expenses', 'payouts'], category: 'navigation' },
    { id: 'nav-directory', label: labels.directoryTab, description: `${labels.primaryEntity}`, icon: <Users className="w-4 h-4" />, action: () => router.push('/dashboard/directory'), keywords: ['directory', 'contacts', 'creators'], category: 'navigation' },
    { id: 'nav-reports', label: 'Reports', description: 'P&L, Exports', icon: <FileText className="w-4 h-4" />, action: () => router.push('/dashboard/reports'), keywords: ['reports'], category: 'navigation' },
    { id: 'nav-audit', label: 'Audit', description: 'System health', icon: <Shield className="w-4 h-4" />, action: () => router.push('/dashboard/audit'), keywords: ['audit', 'log'], category: 'navigation' },
    { id: 'nav-settings', label: 'Settings', description: 'Config', icon: <Settings className="w-4 h-4" />, action: () => router.push('/dashboard/settings'), keywords: ['settings'], category: 'navigation' },
  ], [mode, labels, router])

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands.slice(0, 8)
    const q = query.toLowerCase()
    return allCommands.filter(cmd => [cmd.label, cmd.description, ...cmd.keywords].join(' ').toLowerCase().includes(q)).slice(0, 10)
  }, [query, allCommands])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); filteredCommands[selectedIndex]?.action(); onClose() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }, [isOpen, filteredCommands, selectedIndex, onClose])

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown) }, [handleKeyDown])
  useEffect(() => { if (isOpen) { setQuery(''); setSelectedIndex(0) } }, [isOpen])
  useEffect(() => { setSelectedIndex(0) }, [filteredCommands.length])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl">
        <div className="bg-white rounded-xl shadow-2xl border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Search className="w-5 h-5 text-stone-400" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a command..." className="flex-1 text-[15px] focus:outline-none" autoFocus />
            <kbd className="px-2 py-0.5 bg-stone-100 rounded text-[11px]">ESC</kbd>
          </div>
          <div className="max-h-[400px] overflow-y-auto p-2">
            {filteredCommands.map((cmd, i) => (
              <button key={cmd.id} onClick={() => { cmd.action(); onClose() }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${selectedIndex === i ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedIndex === i ? 'bg-[#1C1917] text-white' : 'bg-stone-100 text-stone-500'}`}>{cmd.icon}</div>
                <div className="flex-1"><div className="text-[13px] font-medium">{cmd.label}</div><div className="text-[12px] text-stone-400">{cmd.description}</div></div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsOpen(prev => !prev) } }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }
}
