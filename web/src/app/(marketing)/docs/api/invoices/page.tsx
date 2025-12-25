import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CodeBlock } from '@/components/code-block'

export const metadata: Metadata = {
  title: 'Invoices API | Soledgic Docs',
  description: 'Create, send, and manage invoices. Track payments and automatically update accounts receivable.',
}

const createInvoiceRequest = `curl -X POST "https://api.soledgic.com/invoices" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_name": "Acme Corporation",
    "customer_email": "billing@acme.com",
    "customer_id": "cust_acme_001",
    "line_items": [
      {
        "description": "Monthly SaaS Subscription - Pro Plan",
        "quantity": 1,
        "unit_price": 9900
      },
      {
        "description": "Additional API Calls (50,000)",
        "quantity": 50,
        "unit_price": 100
      }
    ],
    "due_date": "2026-01-31",
    "notes": "Thank you for your business!",
    "terms": "Net 30"
  }'`

const createInvoiceResponse = `{
  "success": true,
  "data": {
    "id": "inv_abc123xyz",
    "invoice_number": "INV-2412-K7XZ",
    "customer_name": "Acme Corporation",
    "customer_email": "billing@acme.com",
    "line_items": [
      {
        "description": "Monthly SaaS Subscription - Pro Plan",
        "quantity": 1,
        "unit_price": 9900,
        "amount": 9900
      },
      {
        "description": "Additional API Calls (50,000)",
        "quantity": 50,
        "unit_price": 100,
        "amount": 5000
      }
    ],
    "subtotal": 14900,
    "tax_amount": 0,
    "total_amount": 14900,
    "amount_paid": 0,
    "amount_due": 14900,
    "currency": "USD",
    "status": "draft",
    "issue_date": "2025-12-23",
    "due_date": "2026-01-31",
    "created_at": "2025-12-23T10:30:00Z"
  }
}`

const sendInvoiceRequest = `curl -X POST "https://api.soledgic.com/invoices/inv_abc123xyz/send" \\
  -H "x-api-key: YOUR_API_KEY"`

const sendInvoiceResponse = `{
  "success": true,
  "message": "Invoice sent and AR entry created",
  "data": {
    "id": "inv_abc123xyz",
    "invoice_number": "INV-2412-K7XZ",
    "status": "sent",
    "sent_at": "2025-12-23T10:35:00Z",
    "transaction_id": "txn_def456"
  }
}`

const recordPaymentRequest = `curl -X POST "https://api.soledgic.com/invoices/inv_abc123xyz/record-payment" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 14900,
    "payment_method": "bank_transfer",
    "reference_id": "CHK-12345"
  }'`

const recordPaymentResponse = `{
  "success": true,
  "message": "Payment of $149.00 recorded",
  "data": {
    "invoice": {
      "id": "inv_abc123xyz",
      "status": "paid",
      "amount_paid": 14900,
      "amount_due": 0,
      "paid_at": "2025-12-23T14:00:00Z"
    },
    "payment_transaction_id": "txn_ghi789"
  }
}`

const listInvoicesRequest = `curl -X GET "https://api.soledgic.com/invoices?status=sent&limit=10" \\
  -H "x-api-key: YOUR_API_KEY"`

export default function InvoicesPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/docs/api" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to API Reference
        </Link>
        
        <h1 className="text-3xl font-bold text-stone-900 mb-4">Invoices</h1>
        <p className="text-stone-600 text-lg mb-8">
          Create and manage invoices programmatically. When you send an invoice, 
          Soledgic automatically creates the accounts receivable entry. When you 
          record payments, it updates AR and Cash accounts with proper double-entry bookkeeping.
        </p>

        {/* Endpoints Overview */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Available Endpoints</h2>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Method</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Endpoint</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr>
                  <td className="py-3 px-4"><span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-mono rounded">GET</span></td>
                  <td className="py-3 px-4 font-mono text-stone-800">/invoices</td>
                  <td className="py-3 px-4 text-stone-600">List all invoices</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">POST</span></td>
                  <td className="py-3 px-4 font-mono text-stone-800">/invoices</td>
                  <td className="py-3 px-4 text-stone-600">Create a new invoice</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-mono rounded">GET</span></td>
                  <td className="py-3 px-4 font-mono text-stone-800">/invoices/:id</td>
                  <td className="py-3 px-4 text-stone-600">Get invoice details</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">POST</span></td>
                  <td className="py-3 px-4 font-mono text-stone-800">/invoices/:id/send</td>
                  <td className="py-3 px-4 text-stone-600">Send invoice &amp; create AR entry</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">POST</span></td>
                  <td className="py-3 px-4 font-mono text-stone-800">/invoices/:id/record-payment</td>
                  <td className="py-3 px-4 text-stone-600">Record payment on invoice</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">POST</span></td>
                  <td className="py-3 px-4 font-mono text-stone-800">/invoices/:id/void</td>
                  <td className="py-3 px-4 text-stone-600">Void an unpaid invoice</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Create Invoice */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Create Invoice</h2>
          <p className="text-stone-600 mb-4">
            Create a new invoice in draft status. Invoices in draft don&apos;t affect your books 
            until you send them.
          </p>
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Request Body</h3>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Field</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Required</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">customer_name</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">Yes</td>
                  <td className="py-3 px-4 text-stone-600">Customer&apos;s name</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">customer_email</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">No</td>
                  <td className="py-3 px-4 text-stone-600">Email for sending invoice</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">customer_id</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">No</td>
                  <td className="py-3 px-4 text-stone-600">Your internal customer ID</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">line_items</td>
                  <td className="py-3 px-4 text-stone-600">array</td>
                  <td className="py-3 px-4 text-stone-600">Yes</td>
                  <td className="py-3 px-4 text-stone-600">Array of line items (see below)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">due_date</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">No</td>
                  <td className="py-3 px-4 text-stone-600">Due date (YYYY-MM-DD). Defaults to 30 days.</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">notes</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">No</td>
                  <td className="py-3 px-4 text-stone-600">Notes to display on invoice</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">terms</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">No</td>
                  <td className="py-3 px-4 text-stone-600">Payment terms (e.g., &quot;Net 30&quot;)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Line Item Fields</h3>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Field</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">description</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">Description of the item/service</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">quantity</td>
                  <td className="py-3 px-4 text-stone-600">number</td>
                  <td className="py-3 px-4 text-stone-600">Quantity (must be positive)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">unit_price</td>
                  <td className="py-3 px-4 text-stone-600">integer</td>
                  <td className="py-3 px-4 text-stone-600">Price per unit in cents</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Request</h3>
          <CodeBlock code={createInvoiceRequest} language="bash" />
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Response</h3>
          <CodeBlock code={createInvoiceResponse} language="json" />
        </section>

        {/* Send Invoice */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Send Invoice</h2>
          <p className="text-stone-600 mb-4">
            Sending an invoice changes its status from &quot;draft&quot; to &quot;sent&quot; and creates the 
            double-entry bookkeeping entries: <strong>Debit Accounts Receivable, Credit Revenue</strong>.
          </p>
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Request</h3>
          <CodeBlock code={sendInvoiceRequest} language="bash" />
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Response</h3>
          <CodeBlock code={sendInvoiceResponse} language="json" />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-800">
              <strong>Accounting Impact:</strong> When you send an invoice, Soledgic automatically creates 
              a transaction with entries that debit Accounts Receivable and credit Revenue. This follows 
              proper accrual accounting principles.
            </p>
          </div>
        </section>

        {/* Record Payment */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Record Payment</h2>
          <p className="text-stone-600 mb-4">
            Record a payment against an invoice. Creates entries: <strong>Debit Cash, Credit Accounts Receivable</strong>.
            Supports partial payments—the invoice status will be &quot;partial&quot; until fully paid.
          </p>
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Request Body</h3>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Field</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-stone-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">amount</td>
                  <td className="py-3 px-4 text-stone-600">integer</td>
                  <td className="py-3 px-4 text-stone-600">Payment amount in cents (required)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">payment_method</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">e.g., &quot;bank_transfer&quot;, &quot;credit_card&quot;, &quot;check&quot;</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">reference_id</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">Check number, transaction ID, etc.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Request</h3>
          <CodeBlock code={recordPaymentRequest} language="bash" />
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Response</h3>
          <CodeBlock code={recordPaymentResponse} language="json" />
        </section>

        {/* List Invoices */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">List Invoices</h2>
          <p className="text-stone-600 mb-4">
            Retrieve a paginated list of invoices with optional filtering by status and customer.
          </p>
          
          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Query Parameters</h3>
          <div className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-4">
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
                  <td className="py-3 px-4 font-mono text-stone-800">status</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">Filter by status: draft, sent, partial, paid, overdue, void</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">customer_id</td>
                  <td className="py-3 px-4 text-stone-600">string</td>
                  <td className="py-3 px-4 text-stone-600">Filter by customer ID</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">limit</td>
                  <td className="py-3 px-4 text-stone-600">integer</td>
                  <td className="py-3 px-4 text-stone-600">Number of results (max 100, default 50)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono text-stone-800">offset</td>
                  <td className="py-3 px-4 text-stone-600">integer</td>
                  <td className="py-3 px-4 text-stone-600">Pagination offset</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-medium text-stone-900 mt-6 mb-3">Example Request</h3>
          <CodeBlock code={listInvoicesRequest} language="bash" />
        </section>

        {/* Invoice Statuses */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Invoice Statuses</h2>
          <div className="bg-white border border-stone-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <span className="px-2 py-1 bg-stone-100 text-stone-600 text-xs font-medium rounded">draft</span>
                <p className="text-sm text-stone-600">Created but not sent. No AR entry yet.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">sent</span>
                <p className="text-sm text-stone-600">Sent to customer. AR entry created.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">partial</span>
                <p className="text-sm text-stone-600">Some payment received, balance remaining.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">paid</span>
                <p className="text-sm text-stone-600">Fully paid. AR balance is zero.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">overdue</span>
                <p className="text-sm text-stone-600">Past due date with balance remaining.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="px-2 py-1 bg-stone-200 text-stone-500 text-xs font-medium rounded">void</span>
                <p className="text-sm text-stone-600">Cancelled. AR entry reversed if sent.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold text-stone-900 mb-4">Related Endpoints</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/api/ar-aging" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /ar-aging
            </Link>
            <Link href="/docs/api/balance-sheet" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /balance-sheet
            </Link>
            <Link href="/docs/api/profit-loss" className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700">
              GET /profit-loss
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
