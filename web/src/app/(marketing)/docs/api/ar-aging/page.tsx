import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'AR Aging Report API | Soledgic Docs',
  description: 'Generate accounts receivable aging reports showing who owes you money and for how long.',
}

const exampleRequest = `curl -X GET "https://api.soledgic.com/ar-aging?as_of_date=2025-12-31" \\
  -H "x-api-key: YOUR_API_KEY"`

const exampleResponse = `{
  "success": true,
  "as_of_date": "2025-12-31",
  "summary": {
    "total_receivables": 45750.00,
    "total_current": 28500.00,
    "total_overdue": 17250.00,
    "total_invoices": 12,
    "average_days_outstanding": 35,
    "oldest_invoice_days": 95
  },
  "aging_buckets": [
    {
      "label": "Current (0-30 days)",
      "min_days": 0,
      "max_days": 30,
      "invoices": [
        {
          "transaction_id": "txn_abc123",
          "invoice_number": "INV-2412-XY7Z",
          "customer_name": "Acme Corp",
          "invoice_date": "2025-12-15",
          "due_date": "2026-01-14",
          "original_amount": 15000.00,
          "paid_amount": 0.00,
          "balance_due": 15000.00,
          "days_outstanding": 16,
          "status": "current"
        }
      ],
      "total_amount": 28500.00,
      "invoice_count": 5
    },
    {
      "label": "31-60 days",
      "min_days": 31,
      "max_days": 60,
      "total_amount": 8500.00,
      "invoice_count": 3
    },
    {
      "label": "61-90 days",
      "min_days": 61,
      "max_days": 90,
      "total_amount": 5250.00,
      "invoice_count": 2
    },
    {
      "label": "Over 90 days",
      "min_days": 91,
      "max_days": null,
      "total_amount": 3500.00,
      "invoice_count": 2
    }
  ],
  "top_customers": [
    {
      "customer_name": "Acme Corp",
      "customer_id": "cust_001",
      "total_owed": 22500.00,
      "invoice_count": 4,
      "oldest_days": 45
    }
  ]
}`

export default function ARAgingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/docs/api" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to API Reference
        </Link>
        
        <div className="flex items-center gap-3 mb-6">
          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-mono font-semibold rounded">GET</span>
          <code className="text-lg font-mono text-stone-700">/ar-aging</code>
        </div>
        
        <h1 className="text-3xl font-bold text-stone-900 mb-4">Accounts Receivable Aging</h1>
        <p className="text-stone-600 text-lg mb-8">
          Generate an aging report for accounts receivable. See who owes you money, 
          how much, and for how long. Essential for cash flow management and collections.
        </p>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Query Parameters</h2>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Parameter</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">as_of_date</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">Date for the aging report (YYYY-MM-DD). Defaults to today.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Example Request</h2>
          <CodeBlock code={exampleRequest} language="bash" />
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Example Response</h2>
          <CodeBlock code={exampleResponse} language="json" />
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Understanding Aging Buckets</h2>
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-stone-900 mb-2">Current (0-30 days)</h3>
                <p className="text-sm text-stone-600">Invoices that are not yet due or recently due. These are healthy receivables.</p>
              </div>
              <div>
                <h3 className="font-medium text-stone-900 mb-2">31-60 days</h3>
                <p className="text-sm text-stone-600">Slightly overdue. Consider sending a reminder to these customers.</p>
              </div>
              <div>
                <h3 className="font-medium text-stone-900 mb-2">61-90 days</h3>
                <p className="text-sm text-stone-600">Moderately overdue. Follow up with phone calls or formal collection notices.</p>
              </div>
              <div>
                <h3 className="font-medium text-stone-900 mb-2">Over 90 days</h3>
                <p className="text-sm text-stone-600">Seriously overdue. May require collection agency or write-off consideration.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Use Cases</h2>
          <ul className="list-disc pl-6 space-y-2 text-stone-600">
            <li>Identify customers who are slow to pay</li>
            <li>Forecast cash flow based on expected collections</li>
            <li>Prioritize collection efforts on high-value or severely overdue accounts</li>
            <li>Calculate bad debt allowance for financial statements</li>
            <li>Monitor Days Sales Outstanding (DSO) trends</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Related Endpoints</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/api/invoices" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              POST /invoices
            </Link>
            <Link href="/docs/api/balance-sheet" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /balance-sheet
            </Link>
            <Link href="/docs/api/ap-aging" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /ap-aging
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
