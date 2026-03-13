import Link from 'next/link'

export default function ConceptsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Core Concepts</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Understand the public treasury, reconciliation, fraud, compliance, and tax resources and the ledger underneath them.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Participants</h2>
        <p className="text-muted-foreground mb-4">
          A participant is the treasury identity for a person or business on your platform. Participants
          receive balances, can accrue holds, and can be paid out.
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2">
          <li>They map to ledger-backed accounts.</li>
          <li>They carry payout preferences and split defaults.</li>
          <li>They are the anchor resource for wallets, holds, and payouts.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Wallets and Holds</h2>
        <p className="text-muted-foreground mb-4">
          Wallet balances show what a participant has accrued. Holds represent funds that exist in the
          ledger but are not yet releasable.
        </p>

        <div className="bg-card border border-border rounded-lg p-6 mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-foreground">State</th>
                  <th className="text-left py-2 px-3 font-medium text-foreground">Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">wallet.balance</code></td>
                  <td className="py-2 px-3 text-muted-foreground">Current ledger-backed balance attributed to the participant</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">hold</code></td>
                  <td className="py-2 px-3 text-muted-foreground">Funds withheld until release conditions are satisfied</td>
                </tr>
                <tr>
                  <td className="py-2 px-3"><code className="bg-muted px-1.5 py-0.5 rounded">available_balance</code></td>
                  <td className="py-2 px-3 text-muted-foreground">Wallet balance minus active held amounts</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Checkout and Payout Lifecycle</h2>
        <p className="text-muted-foreground mb-6">
          The public resource lifecycle is explicit rather than hidden inside command handlers.
        </p>

        <div className="bg-card border border-border rounded-lg p-6">
          <pre className="text-sm text-muted-foreground overflow-x-auto">
{`participant
  -> checkout_session
  -> wallet balance
  -> hold (optional)
  -> payout
  -> refund
  -> reconciliation
  -> fraud evaluation
  -> compliance review
  -> tax summary / document`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Operational Resources</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic also exposes ledger-scoped operational resources once money starts moving.
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2">
          <li><code className="bg-muted px-1.5 py-0.5 rounded">reconciliations/*</code> tracks unmatched transactions, matches, and frozen snapshots.</li>
          <li><code className="bg-muted px-1.5 py-0.5 rounded">fraud/*</code> evaluates proposed transactions and manages policy rules.</li>
          <li><code className="bg-muted px-1.5 py-0.5 rounded">compliance/*</code> summarizes ledger-scoped access, security, and financial monitoring signals.</li>
          <li><code className="bg-muted px-1.5 py-0.5 rounded">tax/*</code> exposes calculations, summaries, generated documents, and exports.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Shared Identity and Ecosystems</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic also has a higher-level operator model for shared user identity and multi-platform ecosystems.
          That layer sits above the public treasury resources.
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2">
          <li>Identity is global to the signed-in user.</li>
          <li>Participants and wallets remain ledger-scoped.</li>
          <li>Ecosystems group related platforms for visibility, not pooled balances.</li>
          <li>These routes are dashboard-only and are not part of the public `/v1` API contract.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Double-Entry Ledger</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic uses double-entry accounting underneath the resource API. Every state-changing write
          resolves to balanced debits and credits.
        </p>

        <div className="bg-card border border-border rounded-lg p-6 mb-4">
          <p className="text-sm text-muted-foreground mb-3">Example: a $29.99 checkout with an 80/20 split</p>
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
                  <td className="py-2 px-3 text-right">-</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 px-3 text-muted-foreground">Platform Revenue</td>
                  <td className="py-2 px-3 text-right">-</td>
                  <td className="py-2 px-3 text-right text-blue-600">$6.00</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-muted-foreground">Participant Balance</td>
                  <td className="py-2 px-3 text-right">-</td>
                  <td className="py-2 px-3 text-right text-blue-600">$23.99</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-muted-foreground">
          The ledger is the source of truth. Resources are the developer-facing model layered on top of it.
        </p>
      </section>

      <section id="architecture" className="mb-12 scroll-mt-20">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Architecture</h2>
        <p className="text-muted-foreground mb-6">
          The system is intentionally layered so developer ergonomics and financial correctness can evolve independently.
        </p>

        <div className="space-y-4 mb-6">
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Resource Layer</h3>
            <p className="text-sm text-muted-foreground">
              Public endpoints expose participants, wallets, holds, transfers, checkout sessions, payouts, refunds, reconciliations,
              fraud evaluations, compliance monitoring, and tax operations.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Operator Control Plane</h3>
            <p className="text-sm text-muted-foreground">
              Shared identity, ecosystem management, and internal verification tooling live behind authenticated dashboard routes,
              not the public API-key surface.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Shared Services</h3>
            <p className="text-sm text-muted-foreground">
              Shared treasury services centralize validation, orchestration, and response shaping across the public surface.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Ledger RPCs</h3>
            <p className="text-sm text-muted-foreground">
              Money-moving writes commit through PostgreSQL RPCs with row locks and atomic transactions.
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-1">Replay Safety</h3>
            <p className="text-sm text-muted-foreground">
              Direct checkouts and refunds support explicit idempotency keys. Transfers and payouts are currently replay-safe
              by unique <code className="bg-muted px-1.5 py-0.5 rounded text-xs">reference_id</code> checks.
            </p>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <p className="text-sm text-blue-600">
            If an API worker fails mid-request, the ledger write either committed fully or rolled back. The gateway does not own the
            financial state machine.
          </p>
        </div>
      </section>

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
