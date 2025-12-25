'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload } from 'lucide-react'

const EXPENSE_CATEGORIES = [
  { code: 'advertising', name: 'Advertising', schedule_c_line: '8' },
  { code: 'bank_fees', name: 'Bank Fees', schedule_c_line: '27a' },
  { code: 'commissions', name: 'Commissions and Fees', schedule_c_line: '10' },
  { code: 'contract_labor', name: 'Contract Labor', schedule_c_line: '11' },
  { code: 'depreciation', name: 'Depreciation', schedule_c_line: '13' },
  { code: 'insurance', name: 'Insurance', schedule_c_line: '15' },
  { code: 'interest_mortgage', name: 'Interest - Mortgage', schedule_c_line: '16a' },
  { code: 'interest_other', name: 'Interest - Other', schedule_c_line: '16b' },
  { code: 'legal_professional', name: 'Legal and Professional Services', schedule_c_line: '17' },
  { code: 'office_expense', name: 'Office Expense', schedule_c_line: '18' },
  { code: 'pension_profit_sharing', name: 'Pension and Profit-Sharing Plans', schedule_c_line: '19' },
  { code: 'rent_equipment', name: 'Rent - Equipment', schedule_c_line: '20a' },
  { code: 'rent_property', name: 'Rent - Property', schedule_c_line: '20b' },
  { code: 'repairs', name: 'Repairs and Maintenance', schedule_c_line: '21' },
  { code: 'supplies', name: 'Supplies', schedule_c_line: '22' },
  { code: 'taxes_licenses', name: 'Taxes and Licenses', schedule_c_line: '23' },
  { code: 'travel', name: 'Travel', schedule_c_line: '24a' },
  { code: 'meals', name: 'Meals (50% deductible)', schedule_c_line: '24b' },
  { code: 'utilities', name: 'Utilities', schedule_c_line: '25' },
  { code: 'wages', name: 'Wages', schedule_c_line: '26' },
  { code: 'software', name: 'Software/SaaS', schedule_c_line: '27a' },
  { code: 'hosting', name: 'Hosting/Cloud Services', schedule_c_line: '27a' },
  { code: 'domain_registration', name: 'Domain Registration', schedule_c_line: '27a' },
  { code: 'payment_processing', name: 'Payment Processing Fees', schedule_c_line: '27a' },
  { code: 'marketing', name: 'Marketing', schedule_c_line: '8' },
  { code: 'education', name: 'Education/Training', schedule_c_line: '27a' },
  { code: 'equipment', name: 'Equipment (under $2500)', schedule_c_line: '27a' },
  { code: 'home_office', name: 'Home Office', schedule_c_line: '30' },
  { code: 'vehicle', name: 'Vehicle Expenses', schedule_c_line: '9' },
  { code: 'other', name: 'Other Expenses', schedule_c_line: '27a' },
]

export default function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: ledgerId } = use(params)
  
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/ledgers/${ledgerId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(parseFloat(amount) * 100), // Convert to cents
          category_code: category,
          merchant_name: merchantName,
          business_purpose: description,
          expense_date: expenseDate,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to record expense')
      }

      router.push(`/ledgers/${ledgerId}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/ledgers/${ledgerId}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <h1 className="text-3xl font-bold text-foreground">Record Expense</h1>
      <p className="mt-2 text-muted-foreground">
        Add a business expense with IRS category mapping.
      </p>

      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-2">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full pl-8 pr-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label htmlFor="date" className="block text-sm font-medium text-foreground mb-2">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-foreground mb-2">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a category</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.code} value={cat.code}>
                  {cat.name} (Line {cat.schedule_c_line})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="merchant" className="block text-sm font-medium text-foreground mb-2">
              Merchant / Vendor
            </label>
            <input
              id="merchant"
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Amazon, Vercel, Adobe"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
              Business Purpose
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full px-4 py-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="What was this expense for? Be specific for audit purposes."
            />
          </div>

          <div className="border border-dashed border-border rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="mt-2 text-sm text-muted-foreground">
              Receipt upload coming soon
            </p>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !amount || !category || !merchantName || !description}
              className="flex-1 bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Recording...' : 'Record expense'}
            </button>
            <Link
              href={`/ledgers/${ledgerId}`}
              className="px-6 py-3 border border-border rounded-md text-foreground hover:bg-accent"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
