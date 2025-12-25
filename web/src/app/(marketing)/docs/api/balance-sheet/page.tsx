import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Balance Sheet API | Soledgic Docs',
  description: 'Generate balance sheet reports showing Assets = Liabilities + Equity with the Soledgic API.',
}

const exampleRequest = `curl -X GET "https://api.soledgic.com/balance-sheet?as_of_date=2025-12-31" \\
  -H "x-api-key: YOUR_API_KEY"`

const exampleResponse = `{
  "success": true,
  "as_of_date": "2025-12-31",
  "assets": {
    "current_assets": {
      "accounts": [
        { "account_id": "acc_123", "account_name": "Cash", "account_type": "cash", "balance": 45000.00 },
        { "account_id": "acc_124", "account_name": "Accounts Receivable", "account_type": "accounts_receivable", "balance": 12500.00 }
      ],
      "total": 57500.00
    },
    "fixed_assets": {
      "accounts": [
        { "account_id": "acc_125", "account_name": "Equipment", "account_type": "equipment", "balance": 15000.00 },
        { "account_id": "acc_126", "account_name": "Accumulated Depreciation", "account_type": "accumulated_depreciation", "balance": -3000.00 }
      ],
      "total": 12000.00
    },
    "total_assets": 69500.00
  },
  "liabilities": {
    "current_liabilities": {
      "accounts": [
        { "account_id": "acc_127", "account_name": "Accounts Payable", "account_type": "accounts_payable", "balance": 8500.00 },
        { "account_id": "acc_128", "account_name": "Creator Balances", "account_type": "creator_balance", "balance": 15000.00 }
      ],
      "total": 23500.00
    },
    "long_term_liabilities": {
      "accounts": [],
      "total": 0.00
    },
    "total_liabilities": 23500.00
  },
  "equity": {
    "owner_equity": {
      "accounts": [
        { "account_id": "acc_129", "account_name": "Owner's Capital", "account_type": "owner_equity", "balance": 30000.00 }
      ],
      "total": 30000.00
    },
    "retained_earnings": 0.00,
    "current_period_net_income": 16000.00,
    "total_equity": 46000.00
  },
  "balance_check": {
    "assets": 69500.00,
    "liabilities_plus_equity": 69500.00,
    "is_balanced": true,
    "difference": 0.00
  }
}`

export default function BalanceSheetPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/docs/api" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to API Reference
        </Link>
        
        <div className="flex items-center gap-3 mb-6">
          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-mono font-semibold rounded">GET</span>
          <code className="text-lg font-mono text-stone-700">/balance-sheet</code>
        </div>
        
        <h1 className="text-3xl font-bold text-stone-900 mb-4">Balance Sheet</h1>
        <p className="text-stone-600 text-lg mb-8">
          Generate a balance sheet report showing Assets = Liabilities + Equity. 
          Essential for understanding your financial position at any point in time.
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
                  <td className="py-3 px-4 text-stone-600">Date for the balance sheet (YYYY-MM-DD). Defaults to today.</td>
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
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Understanding the Response</h2>
          <div className="prose prose-stone max-w-none">
            <h3 className="text-lg font-medium mt-6">Assets</h3>
            <ul className="list-disc pl-6 space-y-2 text-stone-600">
              <li><strong>Current Assets:</strong> Cash, Accounts Receivable, Inventory - assets convertible to cash within a year</li>
              <li><strong>Fixed Assets:</strong> Equipment, Property - long-term assets, shown net of depreciation</li>
            </ul>
            
            <h3 className="text-lg font-medium mt-6">Liabilities</h3>
            <ul className="list-disc pl-6 space-y-2 text-stone-600">
              <li><strong>Current Liabilities:</strong> Accounts Payable, Creator Balances - obligations due within a year</li>
              <li><strong>Long-term Liabilities:</strong> Notes Payable, Long-term Debt - obligations due after a year</li>
            </ul>
            
            <h3 className="text-lg font-medium mt-6">Equity</h3>
            <ul className="list-disc pl-6 space-y-2 text-stone-600">
              <li><strong>Owner Equity:</strong> Capital contributed by owners</li>
              <li><strong>Retained Earnings:</strong> Accumulated profits from prior periods</li>
              <li><strong>Current Period Net Income:</strong> Profit/loss for the current period (Revenue - Expenses)</li>
            </ul>
            
            <h3 className="text-lg font-medium mt-6">Balance Check</h3>
            <p className="text-stone-600">
              The <code>balance_check</code> object verifies the fundamental accounting equation: 
              Assets = Liabilities + Equity. If <code>is_balanced</code> is false, there may be 
              data integrity issues that need investigation.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Use Cases</h2>
          <ul className="list-disc pl-6 space-y-2 text-stone-600">
            <li>Understand your company&apos;s financial position at any point in time</li>
            <li>Prepare for investor meetings or loan applications</li>
            <li>Track how your assets and liabilities change over time</li>
            <li>Verify your books balance (Assets = Liabilities + Equity)</li>
            <li>Calculate key ratios like current ratio, debt-to-equity</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
