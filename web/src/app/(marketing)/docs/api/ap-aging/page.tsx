import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'AP Aging Report API | Soledgic Docs',
  description: 'Generate accounts payable aging reports showing what you owe and when it is due.',
}

const exampleRequest = `curl -X GET "https://api.soledgic.com/ap-aging?as_of_date=2025-12-31" \\
  -H "x-api-key: YOUR_API_KEY"`

const exampleResponse = `{
  "success": true,
  "as_of_date": "2025-12-31",
  "summary": {
    "total_payables": 32500.00,
    "total_current": 18000.00,
    "total_overdue": 14500.00,
    "total_bills": 8,
    "average_days_outstanding": 28,
    "oldest_bill_days": 72,
    "cash_needed_30_days": 22500.00
  },
  "aging_buckets": [
    {
      "label": "Current (0-30 days)",
      "min_days": 0,
      "max_days": 30,
      "bills": [
        {
          "transaction_id": "txn_xyz789",
          "bill_number": "BILL-2412",
          "vendor_name": "AWS",
          "vendor_id": "vendor_001",
          "bill_date": "2025-12-10",
          "due_date": "2026-01-09",
          "original_amount": 5000.00,
          "paid_amount": 0.00,
          "balance_due": 5000.00,
          "days_outstanding": 21,
          "status": "current"
        }
      ],
      "total_amount": 18000.00,
      "bill_count": 4
    },
    {
      "label": "31-60 days",
      "min_days": 31,
      "max_days": 60,
      "total_amount": 8500.00,
      "bill_count": 2
    },
    {
      "label": "61-90 days",
      "min_days": 61,
      "max_days": 90,
      "total_amount": 6000.00,
      "bill_count": 2
    },
    {
      "label": "Over 90 days",
      "min_days": 91,
      "max_days": null,
      "total_amount": 0.00,
      "bill_count": 0
    }
  ],
  "top_vendors": [
    {
      "vendor_name": "AWS",
      "vendor_id": "vendor_001",
      "total_owed": 12500.00,
      "bill_count": 3,
      "oldest_days": 45,
      "next_due_date": "2026-01-09"
    },
    {
      "vendor_name": "Stripe",
      "vendor_id": "vendor_002",
      "total_owed": 8000.00,
      "bill_count": 2,
      "oldest_days": 72,
      "next_due_date": "2025-12-28"
    }
  ],
  "upcoming_due": [
    {
      "transaction_id": "txn_abc456",
      "vendor_name": "Stripe",
      "amount": 3500.00,
      "due_date": "2025-12-28",
      "days_until_due": -3
    },
    {
      "transaction_id": "txn_xyz789",
      "vendor_name": "AWS",
      "amount": 5000.00,
      "due_date": "2026-01-09",
      "days_until_due": 9
    }
  ]
}`

export default function APAgingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/docs/api" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to API Reference
        </Link>
        
        <div className="flex items-center gap-3 mb-6">
          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-mono font-semibold rounded">GET</span>
          <code className="text-lg font-mono text-stone-700">/ap-aging</code>
        </div>
        
        <h1 className="text-3xl font-bold text-stone-900 mb-4">Accounts Payable Aging</h1>
        <p className="text-stone-600 text-lg mb-8">
          Generate an aging report for accounts payable. See what you owe, to whom, 
          and when it&apos;s due. Critical for cash flow planning and vendor relationship management.
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
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Key Metrics</h2>
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-stone-900 mb-2">Cash Needed (30 days)</h3>
                <p className="text-sm text-stone-600">
                  Total amount due within the next 30 days. Use this for cash flow forecasting 
                  to ensure you have sufficient funds.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-stone-900 mb-2">Upcoming Due</h3>
                <p className="text-sm text-stone-600">
                  Bills due in the next 14 days, sorted by urgency. Negative <code>days_until_due</code> 
                  means the bill is already overdue.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-stone-900 mb-2">Top Vendors</h3>
                <p className="text-sm text-stone-600">
                  Your largest creditors ranked by amount owed. Useful for prioritizing 
                  payments and maintaining key vendor relationships.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-stone-900 mb-2">Oldest Bill Days</h3>
                <p className="text-sm text-stone-600">
                  How long your oldest unpaid bill has been outstanding. High values may 
                  indicate cash flow issues or disputes.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Use Cases</h2>
          <ul className="list-disc pl-6 space-y-2 text-stone-600">
            <li>Plan weekly/monthly payment runs based on due dates</li>
            <li>Forecast cash requirements to avoid overdrafts</li>
            <li>Identify bills at risk of late payment penalties</li>
            <li>Negotiate better terms with high-volume vendors</li>
            <li>Prioritize payments when cash is tight</li>
            <li>Maintain good vendor relationships by paying on time</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Related Endpoints</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/api/record-expense" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              POST /record-expense
            </Link>
            <Link href="/docs/api/balance-sheet" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /balance-sheet
            </Link>
            <Link href="/docs/api/ar-aging" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /ar-aging
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
