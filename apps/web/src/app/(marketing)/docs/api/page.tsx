export default function ApiReferencePage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">API Reference</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Complete reference for all Soledgic API endpoints.
      </p>

      {/* Base URL */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Base URL</h2>
        <div className="bg-slate-900 rounded-lg p-4">
          <code className="text-sm text-slate-300">https://api.soledgic.com/v1</code>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          All endpoints require the <code className="bg-muted px-1.5 py-0.5 rounded">x-api-key</code> header.
        </p>
      </section>

      {/* Record Sale */}
      <section id="record-sale" className="mb-12 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 bg-green-500/20 text-green-600 text-xs font-bold rounded">POST</span>
          <h2 className="text-2xl font-semibold text-foreground">Record Sale</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Records a new sale with automatic revenue split between platform and creator.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <code className="text-sm text-slate-300">POST /record-sale</code>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Request Body</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Field</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Required</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">reference_id</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">Your external sale ID</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">creator_id</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">Creator receiving funds</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">amount</code></td>
                <td className="py-2 px-3 text-muted-foreground">number</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">Amount in cents</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">currency</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">Default: &quot;USD&quot;</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">platform_fee_percent</code></td>
                <td className="py-2 px-3 text-muted-foreground">number</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">Override default fee (e.g., 20)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">description</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">Sale description</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">metadata</code></td>
                <td className="py-2 px-3 text-muted-foreground">object</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">Additional data to store</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Response</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "transaction_id": "txn_abc123",
  "breakdown": {
    "total": 29.99,
    "creator_amount": 23.99,
    "platform_amount": 6.00
  }
}`}
          </pre>
        </div>
      </section>

      {/* Get Balance */}
      <section id="get-balance" className="mb-12 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 bg-blue-500/20 text-blue-600 text-xs font-bold rounded">GET</span>
          <h2 className="text-2xl font-semibold text-foreground">Get Balance</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Returns balance for a creator or all creators.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <code className="text-sm text-slate-300">GET /get-balance</code>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Query Parameters</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Parameter</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">creator_id</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">Get single creator balance</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">include_platform</code></td>
                <td className="py-2 px-3 text-muted-foreground">boolean</td>
                <td className="py-2 px-3 text-muted-foreground">Include platform summary</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Response (Single Creator)</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "balance": {
    "creator_id": "creator_456",
    "available": 150.00,
    "pending": 25.00,
    "total_earned": 500.00,
    "total_paid_out": 325.00,
    "currency": "USD"
  }
}`}
          </pre>
        </div>
      </section>

      {/* Process Payout */}
      <section id="process-payout" className="mb-12 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 bg-green-500/20 text-green-600 text-xs font-bold rounded">POST</span>
          <h2 className="text-2xl font-semibold text-foreground">Process Payout</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Initiates a payout to a creator.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <code className="text-sm text-slate-300">POST /process-payout</code>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Request Body</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Field</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Required</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">creator_id</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">Creator to pay</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payment_method</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">stripe, paypal, bank_transfer, manual</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">amount</code></td>
                <td className="py-2 px-3 text-muted-foreground">number</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">Amount in cents (default: full balance)</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payment_reference</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">External payment ID</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Response</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "payout_id": "pay_xyz789",
  "transaction_id": "txn_def456",
  "amount": 150.00,
  "status": "pending"
}`}
          </pre>
        </div>
      </section>

      {/* Record Refund */}
      <section id="record-refund" className="mb-12 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 bg-green-500/20 text-green-600 text-xs font-bold rounded">POST</span>
          <h2 className="text-2xl font-semibold text-foreground">Record Refund</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Records a refund and adjusts balances accordingly.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <code className="text-sm text-slate-300">POST /record-refund</code>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Request Body</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Field</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Required</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">original_sale_reference</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">Reference ID of original sale</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">reason</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-green-600">Yes</td>
                <td className="py-2 px-3 text-muted-foreground">Refund reason</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">amount</code></td>
                <td className="py-2 px-3 text-muted-foreground">number</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">Amount in cents (default: full sale)</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">refund_from</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">No</td>
                <td className="py-2 px-3 text-muted-foreground">both, platform_only, creator_only</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Response</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "success": true,
  "transaction_id": "txn_ref123",
  "refunded_amount": 29.99,
  "breakdown": {
    "from_creator": 23.99,
    "from_platform": 6.00
  }
}`}
          </pre>
        </div>
      </section>

      {/* Get Transactions */}
      <section id="transactions" className="mb-12 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 bg-blue-500/20 text-blue-600 text-xs font-bold rounded">GET</span>
          <h2 className="text-2xl font-semibold text-foreground">Get Transactions</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Returns transaction history with filtering options.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <code className="text-sm text-slate-300">GET /get-transactions</code>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Query Parameters</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Parameter</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">creator_id</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">Filter by creator</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">type</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">sale, payout, refund, etc.</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">status</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">pending, completed, failed</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">start_date</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">ISO date string</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">end_date</code></td>
                <td className="py-2 px-3 text-muted-foreground">string</td>
                <td className="py-2 px-3 text-muted-foreground">ISO date string</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">page</code></td>
                <td className="py-2 px-3 text-muted-foreground">number</td>
                <td className="py-2 px-3 text-muted-foreground">Page number (default: 1)</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">per_page</code></td>
                <td className="py-2 px-3 text-muted-foreground">number</td>
                <td className="py-2 px-3 text-muted-foreground">Results per page (max: 100)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Error Responses */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Error Responses</h2>
        <p className="text-muted-foreground mb-4">
          All errors follow this format:
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`{
  "success": false,
  "error": "Error message here"
}`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">HTTP Status Codes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Code</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">200</code></td>
                <td className="py-2 px-3 text-muted-foreground">Success</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">400</code></td>
                <td className="py-2 px-3 text-muted-foreground">Bad Request (validation error)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">401</code></td>
                <td className="py-2 px-3 text-muted-foreground">Unauthorized (invalid API key)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">403</code></td>
                <td className="py-2 px-3 text-muted-foreground">Forbidden (ledger suspended)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">404</code></td>
                <td className="py-2 px-3 text-muted-foreground">Not Found</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">409</code></td>
                <td className="py-2 px-3 text-muted-foreground">Conflict (duplicate, already reversed)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">429</code></td>
                <td className="py-2 px-3 text-muted-foreground">Rate limited</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">500</code></td>
                <td className="py-2 px-3 text-muted-foreground">Internal Server Error</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
