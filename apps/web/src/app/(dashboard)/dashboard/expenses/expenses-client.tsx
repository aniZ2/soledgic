'use client'

import Link from 'next/link'
import { Plus, Receipt, Download } from 'lucide-react'

interface Expense {
  id: string
  amount: number
  description: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

interface ExpensesClientProps {
  ledger: { id: string; business_name: string }
  expenses: Expense[]
  totalExpenses: number
}

export function ExpensesClient({ ledger, expenses, totalExpenses }: ExpensesClientProps) {
  const handleExport = () => {
    const rows = expenses.map((e) => ({
      date: new Date(e.created_at).toISOString().slice(0, 10),
      merchant: (e.metadata?.merchant_name as string) || '',
      category: (e.metadata?.category_code as string) || 'other',
      purpose: e.description || (e.metadata?.business_purpose as string) || '',
      amount: (e.amount / 100).toFixed(2),
    }))
    const header = 'Date,Merchant,Category,Purpose,Amount'
    const csv = [header, ...rows.map((r) =>
      `${r.date},"${r.merchant.replace(/"/g, '""')}",${r.category},"${r.purpose.replace(/"/g, '""')}",${r.amount}`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${ledger.business_name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Expenses</h1>
          <p className="mt-1 text-muted-foreground">
            {ledger.business_name} — Total: ${(totalExpenses / 100).toFixed(2)}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={expenses.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent text-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <Link
            href={`/ledgers/${ledger.id}/expenses/new`}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Link>
        </div>
      </div>

      {expenses.length > 0 ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Merchant</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Category</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Purpose</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-3 px-4 text-muted-foreground text-sm">
                    {new Date(expense.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 font-medium text-foreground">
                    {(expense.metadata?.merchant_name as string) || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground capitalize">
                      {((expense.metadata?.category_code as string) || 'other').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">
                    {expense.description || (expense.metadata?.business_purpose as string) || '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-foreground">
                    ${(expense.amount / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No expenses yet</h3>
          <p className="mt-2 text-muted-foreground">
            Expenses will appear here once your integration sends them via the API. You can also add them manually.
          </p>
          <div className="mt-6 flex items-center gap-3 justify-center">
            <Link
              href="/connect"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              Set Up Integration
            </Link>
            <Link
              href={`/ledgers/${ledger.id}/expenses/new`}
              className="inline-flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-md hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              Add Manually
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
