'use client'

import { useState } from 'react'
import { Download, Loader2, FileText, Table } from 'lucide-react'

interface ExportButtonProps {
  reportType: 'profit-loss' | 'trial-balance' | 'transactions' | 'creators' | 'creator-statements'
  ledgerId: string
  year?: number
  month?: number
  className?: string
}

export function ExportButton({
  reportType,
  ledgerId,
  year = new Date().getFullYear(),
  month,
  className = ''
}: ExportButtonProps) {
  const [loading, setLoading] = useState<'csv' | 'pdf' | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const handleExport = async (format: 'csv' | 'pdf') => {
    setLoading(format)
    setShowDropdown(false)

    try {
      const params = new URLSearchParams({
        type: reportType,
        format,
        ledger_id: ledgerId,
        year: year.toString()
      })

      if (month) {
        params.append('month', month.toString())
      }

      const response = await fetch(`/api/reports/export?${params}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Export failed')
      }

      // Create download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}-${year}${month ? '-' + month : ''}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Export error:', error)
      alert(error.message || 'Failed to export report')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md text-foreground hover:bg-accent transition-colors"
        disabled={loading !== null}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Export
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-40 bg-card border border-border rounded-md shadow-lg z-10">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Table className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      )}
    </div>
  )
}
