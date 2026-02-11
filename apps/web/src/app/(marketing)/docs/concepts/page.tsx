import Link from 'next/link'

export default function ConceptsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Core Concepts</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Understand the fundamentals of Soledgic&apos;s accounting system.
      </p>

      {/* Ledgers */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Ledgers</h2>
        <p className="text-muted-foreground mb-4">
          A <strong>ledger</strong> is an isolated set of books for your business. Each ledger has its own:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
          <li>Accounts (platform revenue, creator balances, cash, etc.)</li>
          <li>Transactions and entries</li>
          <li>API key for authentication</li>
          <li>Settings (fee percentages, currency, etc.)</li>
        </ul>
        <p className="text-muted-foreground mb-4">
          Most organizations have a single ledger, but you might create separate ledgers for different
          business lines or subsidiaries.
        </p>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <p className="text-sm text-blue-600">
            <strong>Test & Live:</strong> Each ledger is paired—one for test mode and one for live mode.
            They share a ledger group ID but have separate data and API keys.
          </p>
        </div>
      </section>

      {/* Double-Entry Accounting */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Double-Entry Accounting</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic uses <strong>double-entry accounting</strong>, the gold standard for financial record-keeping.
          Every transaction creates at least two entries that balance out:
        </p>

        <div className="bg-card border border-border rounded-lg p-6 mb-4">
          <p className="text-sm text-muted-foreground mb-3">Example: Recording a $29.99 sale with 20% platform fee</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-foreground">Account</th>
                  <th className="text-right py-2 px-3 font-medium text-foreground">Debit</th>
                  <th className="text-right py-2 px-3 font-medium text-foreground">Credit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 px-3 text-muted-foreground">Cash</td>
                  <td className="py-2 px-3 text-right text-green-600">$29.99</td>
                  <td className="py-2 px-3 text-right">—</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 px-3 text-muted-foreground">Platform Revenue</td>
                  <td className="py-2 px-3 text-right">—</td>
                  <td className="py-2 px-3 text-right text-blue-600">$6.00</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-muted-foreground">Creator Balance (Jane)</td>
                  <td className="py-2 px-3 text-right">—</td>
                  <td className="py-2 px-3 text-right text-blue-600">$23.99</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-medium">
                  <td className="py-2 px-3 text-foreground">Total</td>
                  <td className="py-2 px-3 text-right text-foreground">$29.99</td>
                  <td className="py-2 px-3 text-right text-foreground">$29.99</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <p className="text-muted-foreground">
          <strong>Debits always equal credits.</strong> This ensures your books always balance and provides
          a complete audit trail.
        </p>
      </section>

      {/* Accounts */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Accounts</h2>
        <p className="text-muted-foreground mb-4">
          Accounts are buckets that track different types of money. Soledgic creates these
          automatically when you create a ledger:
        </p>

        <div className="space-y-4">
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Platform Revenue</h3>
            <p className="text-sm text-muted-foreground">
              Your platform&apos;s earnings from fees on sales. This is your actual income.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Creator Pool</h3>
            <p className="text-sm text-muted-foreground">
              Total amount owed to all creators. Broken down into individual creator accounts.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Cash</h3>
            <p className="text-sm text-muted-foreground">
              Your bank account balance. Increases with sales, decreases with payouts.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Processing Fees</h3>
            <p className="text-sm text-muted-foreground">
              Payment processor fees (card rails, bank rails, etc.). Tracked as an expense.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Tax Reserve</h3>
            <p className="text-sm text-muted-foreground">
              Withheld taxes (backup withholding, etc.). Held until remitted to tax authorities.
            </p>
          </div>
        </div>
      </section>

      {/* Transactions */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Transactions</h2>
        <p className="text-muted-foreground mb-4">
          A <strong>transaction</strong> is a business event that affects your ledger. Each transaction:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
          <li>Has a unique ID and reference ID (your external identifier)</li>
          <li>Contains one or more entries (debits and credits)</li>
          <li>Is immutable—once created, it cannot be modified</li>
        </ul>

        <h3 className="text-lg font-semibold text-foreground mb-3">Transaction Types</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">sale</code></td>
                <td className="py-2 px-3 text-muted-foreground">Revenue from a customer purchase</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">refund</code></td>
                <td className="py-2 px-3 text-muted-foreground">Money returned to customer</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">payout</code></td>
                <td className="py-2 px-3 text-muted-foreground">Payment to a creator</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">expense</code></td>
                <td className="py-2 px-3 text-muted-foreground">Platform operating expense</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">adjustment</code></td>
                <td className="py-2 px-3 text-muted-foreground">Manual correction or bonus</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">reversal</code></td>
                <td className="py-2 px-3 text-muted-foreground">Undo a previous transaction</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Immutability */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Immutability</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic uses an <strong>immutable ledger</strong> pattern. Once a transaction is recorded,
          it cannot be deleted or modified. This provides:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
          <li><strong>Audit trail</strong> — Complete history of all financial activity</li>
          <li><strong>Compliance</strong> — Meets requirements for financial record-keeping</li>
          <li><strong>Trust</strong> — Data integrity you can rely on</li>
        </ul>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-sm text-amber-600">
            <strong>Need to fix a mistake?</strong> Use a reversal transaction to undo the effects.
            The original transaction remains in the ledger for the audit trail, but its effects are negated.
          </p>
        </div>
      </section>

      {/* Revenue Splits */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Revenue Splits</h2>
        <p className="text-muted-foreground mb-4">
          When a sale is recorded, Soledgic automatically splits the revenue between your platform
          and the creator:
        </p>

        <div className="bg-card border border-border rounded-lg p-6 mb-4">
          <div className="flex items-center justify-center gap-4 text-center">
            <div className="flex-1">
              <div className="text-3xl font-bold text-foreground mb-1">$29.99</div>
              <div className="text-sm text-muted-foreground">Sale Amount</div>
            </div>
            <div className="text-2xl text-muted-foreground">→</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-primary mb-1">$6.00</div>
              <div className="text-sm text-muted-foreground">Platform (20%)</div>
            </div>
            <div className="text-2xl text-muted-foreground">+</div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-green-600 mb-1">$23.99</div>
              <div className="text-sm text-muted-foreground">Creator (80%)</div>
            </div>
          </div>
        </div>

        <p className="text-muted-foreground">
          The split percentage is configurable per ledger or per transaction. You can also configure
          additional deductions like tax withholding.
        </p>
      </section>

      {/* Next steps */}
      <section className="border-t border-border pt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Next Steps</h2>
        <div className="flex gap-4">
          <Link
            href="/docs/api"
            className="text-primary hover:underline"
          >
            API Reference →
          </Link>
          <Link
            href="/docs/quickstart"
            className="text-primary hover:underline"
          >
            Quickstart Guide →
          </Link>
        </div>
      </section>
    </div>
  )
}
