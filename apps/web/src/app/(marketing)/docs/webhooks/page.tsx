import Link from 'next/link'

export default function WebhooksPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Webhooks</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Receive resource events when checkout, payout, and refund state changes occur.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Overview</h2>
        <p className="text-muted-foreground mb-4">
          Webhooks let your platform react to treasury events without polling. Configure endpoints in{' '}
          <Link href="/settings/webhooks" className="text-primary hover:underline">
            Settings → Webhooks
          </Link>
          .
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Event Types</h2>
        <p className="text-muted-foreground mb-4">
          These are the current public event names emitted by the checkout, payout, and refund flows.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Event</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">checkout.completed</code></td>
                <td className="py-2 px-3 text-muted-foreground">A checkout completed and the sale was booked to the ledger</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">refund.created</code></td>
                <td className="py-2 px-3 text-muted-foreground">A refund was created inside Soledgic</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">sale.refunded</code></td>
                <td className="py-2 px-3 text-muted-foreground">A processor-backed refund finished and the sale is fully reflected as refunded</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payout.created</code></td>
                <td className="py-2 px-3 text-muted-foreground">A payout record was created</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payout.executed</code></td>
                <td className="py-2 px-3 text-muted-foreground">A payout rail reported completion</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payout.failed</code></td>
                <td className="py-2 px-3 text-muted-foreground">A payout rail reported failure</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Webhook Payload</h2>
        <p className="text-muted-foreground mb-4">
          Deliveries include a JSON body and signature headers.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Headers</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium text-foreground">Header</th>
                <th className="text-left py-2 px-3 font-medium text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">Content-Type</code></td>
                <td className="py-2 px-3 text-muted-foreground">application/json</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">X-Soledgic-Signature</code></td>
                <td className="py-2 px-3 text-muted-foreground"><code className="bg-muted px-1 rounded">t=&lt;unix&gt;,v1=&lt;hex&gt;</code> HMAC-SHA256 signature for payload verification</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">X-Soledgic-Event</code></td>
                <td className="py-2 px-3 text-muted-foreground">The event name, such as payout.executed</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">X-Soledgic-Delivery-Id</code></td>
                <td className="py-2 px-3 text-muted-foreground">Stable delivery identifier for deduplication and replay handling</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">X-Soledgic-Attempt</code></td>
                <td className="py-2 px-3 text-muted-foreground">Current delivery attempt number</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Example Payload</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "event": "payout.executed",
  "data": {
    "payout_id": "6f2f0ac5-4f50-4e96-b412-4f534f1c85c6",
    "external_id": "tr_123",
    "status": "completed",
    "occurred_at": "2026-03-12T10:29:30Z"
  }
}`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Verifying Signatures</h2>
        <p className="text-muted-foreground mb-4">
          Always verify the signature before processing the payload.
        </p>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-amber-600">
            <strong>Important:</strong> The webhook secret is shown when the endpoint is created. Store it outside your app code.
          </p>
        </div>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`import Soledgic from '@soledgic/sdk';

const soledgic = new Soledgic({
  apiKey: process.env.SOLEDGIC_API_KEY!,
  baseUrl: 'https://soledgic.com/v1',
});

const rawBody = await request.text();
const signature = request.headers.get('x-soledgic-signature') || '';

const isValid = await soledgic.webhooks.verifySignature(
  rawBody,
  signature,
  process.env.SOLEDGIC_WEBHOOK_SECRET!,
);

if (!isValid) {
  throw new Error('Invalid webhook signature');
}`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Retry Policy</h2>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
          <li>Up to 5 retry attempts for non-2xx responses</li>
          <li>Exponential backoff between attempts, capped at 4 hours</li>
          <li>HTTP 429 responses are slowed down to at least 5 minutes before retry</li>
          <li>Failed deliveries stay visible in webhook delivery history</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Best Practices</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Return 200 quickly</p>
              <p className="text-sm text-muted-foreground">Acknowledge the delivery, then process work asynchronously</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Deduplicate by event ID</p>
              <p className="text-sm text-muted-foreground">Webhook delivery retries are normal and should be safe</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Verify signatures</p>
              <p className="text-sm text-muted-foreground">Never trust the body before checking the HMAC signature</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
