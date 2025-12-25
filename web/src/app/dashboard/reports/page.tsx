'use client'

import { useState } from 'react'
import { FileText, Download, Calendar, TrendingUp, Scale, Users, Lock, ChevronRight, Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { LedgerProvider, useLedger } from '@/components/ledger-context'
import { CloseMonthWizard } from '@/components/close-month-wizard'

function ReportsContent() {
  const { mode } = useLedger()
  const [activeReport, setActiveReport] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState({ start: '2025-01-01', end: '2025-12-31' })
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [reportData, setReportData] = useState<any>(null)
  const [showCloseWizard, setShowCloseWizard] = useState(false)

  const reports = [
    { id: 'profit_loss', name: 'Profit & Loss', description: 'Income statement for the period', icon: TrendingUp, color: 'emerald', pdfType: 'profit_loss' },
    { id: 'trial_balance', name: 'Trial Balance', description: 'All account balances', icon: Scale, color: 'blue', pdfType: 'trial_balance' },
    { id: 'creator_earnings', name: mode === 'marketplace' ? 'Creator Earnings' : 'Contractor Payments', description: 'Payments by payee', icon: Users, color: 'violet', pdfType: null },
    { id: '1099_summary', name: '1099 Summary', description: 'Tax year payments over $600', icon: FileText, color: 'amber', pdfType: '1099' },
  ]

  const fetchReport = async (reportType: string) => {
    setLoading(true)
    setActiveReport(reportType)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, start_date: dateRange.start, end_date: dateRange.end })
      })
      const data = await res.json()
      setReportData(data.report || data)
    } catch (err) {
      console.error('Failed to fetch report:', err)
    }
    setLoading(false)
  }

  const downloadPDF = async (reportType: string) => {
    setDownloading(reportType)
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report_type: reportType, 
          start_date: dateRange.start, 
          end_date: dateRange.end,
          tax_year: new Date(dateRange.end).getFullYear()
        })
      })
      const data = await res.json()
      
      if (data.success && data.data) {
        // Convert base64 to blob and download
        const byteCharacters = atob(data.data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'application/pdf' })
        
        // Create download link
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.filename || `report_${reportType}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert(data.error || 'Failed to generate PDF')
      }
    } catch (err) {
      console.error('Failed to download PDF:', err)
      alert('Failed to download PDF')
    }
    setDownloading(null)
  }

  const downloadCSV = () => {
    if (!reportData || !activeReport) return
    
    let csv = ''
    
    if (activeReport === 'profit_loss' && reportData.revenue) {
      csv = 'Category,Account,Amount\n'
      for (const item of reportData.revenue.items || []) {
        csv += `Revenue,${item.name},${item.amount}\n`
      }
      csv += `Revenue,Total,${reportData.revenue.total}\n`
      for (const item of reportData.expenses.items || []) {
        csv += `Expense,${item.name},${item.amount}\n`
      }
      csv += `Expense,Total,${reportData.expenses.total}\n`
      csv += `Net Income,,${reportData.net_income}\n`
    } else if (activeReport === 'trial_balance' && reportData.accounts) {
      csv = 'Account,Type,Debit,Credit\n'
      for (const acc of reportData.accounts) {
        csv += `${acc.account},${acc.account_type},${acc.debit},${acc.credit}\n`
      }
      csv += `Totals,,${reportData.totals?.debits},${reportData.totals?.credits}\n`
    } else if (activeReport === 'creator_earnings' && reportData.creators) {
      csv = 'Name,Tier,Earned,Paid,Balance\n'
      for (const c of reportData.creators) {
        csv += `${c.name},${c.tier},${c.total_earned},${c.total_paid},${c.balance}\n`
      }
    } else if (activeReport === '1099_summary' && reportData.payees) {
      csv = 'Payee,Total Paid,1099 Required,W-9 Status\n'
      for (const p of reportData.payees) {
        csv += `${p.name},${p.total_paid},${p.requires_1099 ? 'Yes' : 'No'},${p.w9_status}\n`
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeReport}_${dateRange.start}_${dateRange.end}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const currentReport = reports.find(r => r.id === activeReport)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">Reports</h1>
          <p className="text-[14px] text-stone-500 mt-1">Financial reports and exports</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-stone-400" />
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange(d => ({ ...d, start: e.target.value }))} className="text-[13px] border-none focus:outline-none" />
            <span className="text-stone-300">→</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange(d => ({ ...d, end: e.target.value }))} className="text-[13px] border-none focus:outline-none" />
          </div>
          <button 
            onClick={() => setShowCloseWizard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1C1917] text-white rounded-lg text-[13px] font-medium hover:bg-[#292524]"
          >
            <Lock className="w-4 h-4" />
            Close Month
          </button>
        </div>
      </div>

      {/* Period Status Banner */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-800 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-stone-400 text-[12px] font-medium uppercase tracking-wider mb-1">Current Period</p>
            <p className="text-xl font-semibold">December 2024</p>
            <p className="text-stone-400 text-[13px] mt-1">Open for transactions</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-stone-400 text-[12px]">Last Closed</p>
              <p className="text-[14px] font-medium">November 2024</p>
            </div>
            <div className="h-10 w-px bg-stone-700" />
            <div className="text-right">
              <p className="text-stone-400 text-[12px]">Fiscal Year</p>
              <p className="text-[14px] font-medium">2024</p>
            </div>
            <button 
              onClick={() => setShowCloseWizard(true)} 
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[13px] font-medium transition-colors"
            >
              Close Period
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon
          const isActive = activeReport === report.id
          return (
            <button
              key={report.id}
              onClick={() => fetchReport(report.id)}
              className={`text-left p-5 rounded-xl border transition-all ${isActive ? 'border-stone-900 bg-stone-50' : 'bg-white hover:border-stone-300'}`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                report.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                report.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                report.color === 'violet' ? 'bg-violet-100 text-violet-600' :
                'bg-amber-100 text-amber-600'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-medium text-[14px]">{report.name}</div>
              <div className="text-[12px] text-stone-500 mt-1">{report.description}</div>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-stone-300 border-t-stone-900 rounded-full mx-auto"></div>
          <p className="text-[14px] text-stone-500 mt-4">Generating report...</p>
        </div>
      )}

      {!loading && reportData && (
        <div className="bg-white rounded-xl border">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{currentReport?.name}</h2>
              <p className="text-[12px] text-stone-500">{reportData.period?.start} to {reportData.period?.end || reportData.as_of || reportData.tax_year}</p>
            </div>
            <div className="flex items-center gap-2">
              {currentReport?.pdfType && (
                <button 
                  onClick={() => downloadPDF(currentReport.pdfType!)}
                  disabled={!!downloading}
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[13px] font-medium disabled:opacity-50"
                >
                  {downloading === currentReport.pdfType ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  PDF
                </button>
              )}
              <button 
                onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-[13px] font-medium"
              >
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>

          {activeReport === 'profit_loss' && reportData.revenue && (
            <div className="p-5 space-y-6">
              <div>
                <h3 className="text-[12px] font-medium text-stone-500 uppercase mb-3">Revenue</h3>
                {reportData.revenue.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between py-2 text-[14px]">
                    <span>{item.name}</span>
                    <span className="font-medium">${item.amount?.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 text-[14px] font-semibold border-t mt-2 pt-2">
                  <span>Total Revenue</span>
                  <span className="text-emerald-600">${reportData.revenue.total?.toFixed(2)}</span>
                </div>
              </div>
              <div>
                <h3 className="text-[12px] font-medium text-stone-500 uppercase mb-3">Expenses</h3>
                {reportData.expenses.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between py-2 text-[14px]">
                    <span>{item.name}</span>
                    <span className="font-medium">${item.amount?.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 text-[14px] font-semibold border-t mt-2 pt-2">
                  <span>Total Expenses</span>
                  <span className="text-red-500">${reportData.expenses.total?.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex justify-between py-4 text-lg font-bold border-t-2">
                <span>Net Income</span>
                <span className={reportData.net_income >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                  ${reportData.net_income?.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {activeReport === 'trial_balance' && reportData.accounts && (
            <div className="p-5">
              <table className="w-full">
                <thead>
                  <tr className="text-[12px] text-stone-500 uppercase">
                    <th className="text-left py-2">Account</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-right py-2">Debit</th>
                    <th className="text-right py-2">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.accounts.map((acc: any, i: number) => (
                    <tr key={i} className="border-t text-[14px]">
                      <td className="py-3">{acc.account}</td>
                      <td className="py-3 text-stone-500">{acc.account_type}</td>
                      <td className="py-3 text-right">{acc.debit > 0 ? `$${acc.debit.toFixed(2)}` : '—'}</td>
                      <td className="py-3 text-right">{acc.credit > 0 ? `$${acc.credit.toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold text-[14px]">
                    <td className="py-3" colSpan={2}>Totals</td>
                    <td className="py-3 text-right">${reportData.totals?.debits?.toFixed(2)}</td>
                    <td className="py-3 text-right">${reportData.totals?.credits?.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className={`mt-4 px-4 py-3 rounded-lg text-[13px] ${reportData.totals?.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {reportData.totals?.balanced ? '✓ Ledger is balanced' : '⚠ Ledger is out of balance'}
              </div>
            </div>
          )}

          {activeReport === 'creator_earnings' && reportData.creators && (
            <div className="p-5">
              <table className="w-full">
                <thead>
                  <tr className="text-[12px] text-stone-500 uppercase">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Tier</th>
                    <th className="text-right py-2">Earned</th>
                    <th className="text-right py-2">Paid</th>
                    <th className="text-right py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.creators.map((c: any, i: number) => (
                    <tr key={i} className="border-t text-[14px]">
                      <td className="py-3 font-medium">{c.name}</td>
                      <td className="py-3"><span className="px-2 py-1 bg-stone-100 rounded text-[12px]">{c.tier}</span></td>
                      <td className="py-3 text-right text-emerald-600">${c.total_earned?.toFixed(2)}</td>
                      <td className="py-3 text-right">${c.total_paid?.toFixed(2)}</td>
                      <td className="py-3 text-right font-medium">${c.balance?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold text-[14px]">
                    <td className="py-3" colSpan={2}>Totals</td>
                    <td className="py-3 text-right text-emerald-600">${reportData.totals?.earned?.toFixed(2)}</td>
                    <td className="py-3 text-right">${reportData.totals?.paid?.toFixed(2)}</td>
                    <td className="py-3 text-right"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {activeReport === '1099_summary' && reportData.payees && (
            <div className="p-5">
              <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg text-[13px] text-amber-800">
                Tax Year {reportData.tax_year}: {reportData.summary?.requiring_1099} payees require 1099 forms (paid ≥ $600)
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[12px] text-stone-500 uppercase">
                    <th className="text-left py-2">Payee</th>
                    <th className="text-right py-2">Total Paid</th>
                    <th className="text-center py-2">1099 Required</th>
                    <th className="text-center py-2">W-9 Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.payees.map((p: any, i: number) => (
                    <tr key={i} className="border-t text-[14px]">
                      <td className="py-3 font-medium">{p.name}</td>
                      <td className="py-3 text-right">${p.total_paid?.toFixed(2)}</td>
                      <td className="py-3 text-center">
                        {p.requires_1099 ? <span className="text-amber-600 font-medium">Yes</span> : <span className="text-stone-400">No</span>}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-1 rounded text-[12px] ${p.w9_status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                          {p.w9_status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && !reportData && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <FileText className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-[14px] text-stone-500">Select a report to generate</p>
        </div>
      )}

      {/* Close Month Wizard */}
      <CloseMonthWizard 
        open={showCloseWizard} 
        onClose={() => setShowCloseWizard(false)}
        onComplete={() => {
          setShowCloseWizard(false)
        }}
      />
    </div>
  )
}

export default function ReportsPage() {
  return (
    <LedgerProvider mode="marketplace" ledgerId="0a885204-e07a-48c1-97e9-495ac96a2581" businessName="Booklyverse">
      <DashboardLayout>
        <ReportsContent />
      </DashboardLayout>
    </LedgerProvider>
  )
}
