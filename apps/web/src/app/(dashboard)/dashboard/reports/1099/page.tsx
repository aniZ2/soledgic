'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import Link from 'next/link'
import { ArrowLeft, FileText, Download, RefreshCw, CheckCircle, AlertCircle, Clock, Info } from 'lucide-react'

interface TaxDocument {
  id: string
  document_type: string
  tax_year: number
  recipient_id: string
  recipient_type: string
  gross_amount: number
  transaction_count: number
  monthly_amounts: Record<string, number>
  status: string
  created_at: string
  exported_at: string | null
}

interface Stats {
  total: number
  calculated: number
  exported: number
  filed: number
  total_amount: number
}

export default function TaxDocumentsPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1)
  const [ledgerId, setLedgerId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [taxYear, livemode])

	  const loadData = async () => {
	    setLoading(true)
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

    // Load tax documents
    const { data: docs } = await supabase
      .from('tax_documents')
      .select('*')
      .eq('ledger_id', ledger.id)
      .eq('tax_year', taxYear)
      .order('gross_amount', { ascending: false })

    setDocuments(docs || [])

    // Calculate stats
    if (docs) {
      setStats({
        total: docs.length,
        calculated: docs.filter(d => d.status === 'calculated').length,
        exported: docs.filter(d => d.status === 'exported').length,
        filed: docs.filter(d => d.status === 'filed').length,
        total_amount: docs.reduce((sum, d) => sum + Number(d.gross_amount), 0),
      })
    }

    setLoading(false)
  }

  const generateAll = async () => {
    if (!ledgerId) return
    setGenerating(true)

    try {
      const res = await callLedgerFunction('tax-documents', {
        ledgerId,
        method: 'POST',
        body: { action: 'generate_all', tax_year: taxYear },
      })

      const result = await res.json()
      if (result.success) {
        alert(`Generated ${result.data.created} documents. ${result.data.skipped} creators below $600 threshold.`)
        loadData()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (err) {
      alert('Failed to generate documents')
    } finally {
      setGenerating(false)
    }
  }

  const exportCSV = async () => {
    if (!ledgerId) return
    setExporting(true)

    try {
      const res = await callLedgerFunction('tax-documents', {
        ledgerId,
        method: 'POST',
        body: { action: 'export', tax_year: taxYear, format: 'csv' },
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `1099_export_${taxYear}.csv`
        a.click()
        loadData() // Refresh to show "exported" status
      } else {
        const result = await res.json()
        alert(`Error: ${result.error}`)
      }
    } catch (err) {
      alert('Failed to export')
    } finally {
      setExporting(false)
    }
  }

  const markAllFiled = async () => {
    if (!ledgerId) return
    if (!confirm('Mark all exported documents as filed? This indicates you have submitted them to the IRS.')) return

    try {
      const res = await callLedgerFunction('tax-documents', {
        ledgerId,
        method: 'POST',
        body: { action: 'mark_filed', tax_year: taxYear },
      })

      const result = await res.json()
      if (result.success) {
        loadData()
      }
    } catch (err) {
      alert('Failed to update status')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'calculated':
        return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">Calculated</span>
      case 'exported':
        return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">Exported</span>
      case 'filed':
        return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Filed</span>
      default:
        return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-96 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/reports" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Reports
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">1099 Tax Reporting</h1>
          <p className="text-gray-500 mt-1">Payment summaries for creators earning $600+</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {[...Array(5)].map((_, i) => {
              const year = new Date().getFullYear() - 1 - i
              return <option key={year} value={year}>{year}</option>
            })}
          </select>

          <button
            onClick={generateAll}
            disabled={generating}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Calculate All'}
          </button>
        </div>
      </div>

      {/* Important Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-900">No Personal Information Stored</p>
            <p className="text-blue-700 mt-1">
              Soledgic tracks payment <strong>amounts only</strong> — no SSNs, EINs, names, or addresses. 
              Export this data and merge with your own recipient records (from your CRM, database, or W-9 files) 
              to complete 1099 forms for filing.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Recipients</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-blue-600">{stats.calculated}</div>
            <div className="text-sm text-gray-500">Calculated</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-yellow-600">{stats.exported}</div>
            <div className="text-sm text-gray-500">Exported</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-green-600">{stats.filed}</div>
            <div className="text-sm text-gray-500">Filed</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold">${stats.total_amount.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Total Gross</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={exportCSV}
          disabled={exporting || documents.length === 0}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>

        {stats && stats.exported > 0 && (
          <button
            onClick={markAllFiled}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Mark All as Filed
          </button>
        )}
      </div>

      {/* Documents Table */}
      {documents.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No tax documents for {taxYear}</p>
          <p className="text-sm text-gray-400 mt-1">Click "Calculate All" to generate summaries for qualifying creators</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Amount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Transactions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{doc.recipient_id}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {doc.document_type}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    ${Number(doc.gross_amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">
                    {doc.transaction_count || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(doc.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filing Checklist */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium text-gray-900 mb-4">Filing Checklist</h3>
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" />
            <span>Exported payment summaries from Soledgic</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" />
            <span>Collected W-9 forms from all recipients (names, TINs, addresses)</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" />
            <span>Merged payment data with recipient information</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" />
            <span>Generated 1099 forms using tax software or service</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" />
            <span>Filed with IRS by January 31</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" />
            <span>Sent Copy B to recipients by January 31</span>
          </label>
        </div>
      </div>
    </div>
  )
}
