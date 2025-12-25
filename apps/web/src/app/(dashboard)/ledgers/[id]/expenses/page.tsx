import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Receipt, Download } from 'lucide-react'

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  // Get ledger
  const { data: ledger, error } = await supabase
    .from('ledgers')
    .select('id, platform_name')
    .eq('id', id)
    .single()

  if (error || !ledger) {
    notFound()
  }

  // Get expense transactions
  const { data: expenses } = await supabase
    .from('transactions')
    .select('*')
    .eq('ledger_id', id)
    .eq('transaction_type', 'expense')
    .order('created_at', { ascending: false })

  const totalExpenses = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0

  return (
    <div>
      <Link
        href={`/ledgers/${id}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Expenses</h1>
          <p className="mt-1 text-muted-foreground">
            {ledger.platform_name} • Total: ${(totalExpenses / 100).toFixed(2)}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent">
            <Download className="h-4 w-4" />
            Export
          </button>
          <Link
            href={`/ledgers/${id}/expenses/new`}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add expense
          </Link>
        </div>
      </div>

      <div className="mt-8">
        {expenses && expenses.length > 0 ? (
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
                      {expense.metadata?.merchant_name || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {expense.metadata?.category_code?.replace(/_/g, ' ') || 'other'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">
                      {expense.description || expense.metadata?.business_purpose || '-'}
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
              Start tracking your business expenses.
            </p>
            <Link
              href={`/ledgers/${id}/expenses/new`}
              className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add expense
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
