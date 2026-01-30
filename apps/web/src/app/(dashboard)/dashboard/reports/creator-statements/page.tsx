'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import Link from 'next/link'
import { ArrowLeft, FileText, Download, Mail, User, Send } from 'lucide-react'

interface Creator {
  id: string
  entity_id: string
  name: string
  balance: number
  email?: string
}

export default function CreatorStatementsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [sendingAll, setSendingAll] = useState(false)

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
      .select('id, api_key, ledger_group_id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)

    const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
    if (!ledger) return
    setApiKey(ledger.api_key)

    // Get creators
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, entity_id, name, metadata')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('is_active', true)
      .order('name')

    // Calculate balances
    const creatorsWithBalances = await Promise.all(
      (accounts || []).map(async (account) => {
        const { data: entries } = await supabase
          .from('entries')
          .select('entry_type, amount, transactions!inner(status)')
          .eq('account_id', account.id)
          .not('transactions.status', 'in', '("voided","reversed")')

        let balance = 0
        for (const e of entries || []) {
          balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
        }

        return {
          ...account,
          balance: Math.round(balance * 100) / 100,
          email: (account.metadata as any)?.email,
        }
      })
    )

    setCreators(creatorsWithBalances)
    setLoading(false)
  }

  const downloadStatement = async (creatorId: string) => {
    if (!apiKey) return

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-pdf?` +
      `report_type=creator_statement&creator_id=${creatorId}&year=${selectedYear}&month=${selectedMonth}&api_key=${apiKey}`
    
    window.open(url, '_blank')
  }

  const sendStatement = async (creatorId: string) => {
    if (!apiKey) return

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-statements`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          action: 'send_single_statement',
          creator_id: creatorId,
          year: selectedYear,
          month: selectedMonth,
        }),
      }
    )
    const data = await res.json()
    
    if (data.success) {
      alert('Statement sent!')
    } else {
      alert(`Failed: ${data.error}`)
    }
  }

  const sendAllStatements = async () => {
    if (!apiKey) return
    setSendingAll(true)

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-statements`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          action: 'send_monthly_statements',
          year: selectedYear,
          month: selectedMonth,
        }),
      }
    )
    const data = await res.json()
    
    if (data.success) {
      alert(`Queued ${data.data?.queued || 0} statements for delivery!`)
    } else {
      alert(`Failed: ${data.error}`)
    }

    setSendingAll(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ]

  const years = [2025, 2024, 2023, 2022]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <Link 
          href="/dashboard/reports" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Creator Statements</h1>
            <p className="text-muted-foreground mt-1">
              Generate and send monthly earnings statements
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="border border-border rounded-md px-3 py-2 bg-background text-foreground"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border border-border rounded-md px-3 py-2 bg-background text-foreground"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={sendAllStatements}
              disabled={sendingAll || creators.length === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${sendingAll ? 'animate-pulse' : ''}`} />
              Send All
            </button>
          </div>
        </div>
      </div>

      {/* Statement Period Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-8">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Generating statements for <strong>{months.find(m => m.value === selectedMonth)?.label} {selectedYear}</strong>. 
          Statements include all sales, payouts, and adjustments for the selected period.
        </p>
      </div>

      {/* Creators List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {creators.length === 0 ? (
          <div className="p-12 text-center">
            <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No Creators</h2>
            <p className="text-muted-foreground">
              Creators will appear here once they have transactions.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Creator</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Current Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {creators.map((creator) => (
                <tr key={creator.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {creator.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{creator.name}</p>
                        <code className="text-xs text-muted-foreground">{creator.entity_id}</code>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {creator.email || <span className="italic">Not set</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono ${creator.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(creator.balance)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => downloadStatement(creator.entity_id)}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </button>
                      {creator.email && (
                        <button
                          onClick={() => sendStatement(creator.entity_id)}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:underline ml-3"
                        >
                          <Mail className="w-3 h-3" />
                          Email
                        </button>
                      )}
                      <Link
                        href={`/dashboard/creators/${creator.entity_id}`}
                        className="text-sm text-muted-foreground hover:text-foreground ml-3"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Email Configuration Notice */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-2">Email Configuration</h3>
        <p className="text-sm text-muted-foreground mb-4">
          To send statements via email, configure your email provider in the settings.
        </p>
        <Link
          href="/settings"
          className="text-sm text-primary hover:underline"
        >
          Go to Settings →
        </Link>
      </div>
    </div>
  )
}
