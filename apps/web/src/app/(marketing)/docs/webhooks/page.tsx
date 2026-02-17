import Link from 'next/link'

export default function WebhooksPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">Webhooks</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Receive real-time notifications when events occur in your ledger.
      </p>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Overview</h2>
        <p className="text-muted-foreground mb-4">
          Webhooks let you build integrations that react to events in Soledgic.
          When an event occurs (like a sale or payout), we send an HTTP POST request
          to your configured endpoint.
        </p>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            Configure webhooks in your{' '}
            <Link href="/settings/webhooks" className="text-primary hover:underline">
              Settings → Webhooks
            </Link>{' '}
            page.
          </p>
        </div>
      </section>

      {/* Event Types */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Event Types</h2>
        <p className="text-muted-foreground mb-4">
          Subscribe to specific events or use <code className="bg-muted px-1.5 py-0.5 rounded">*</code> to receive all events.
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
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">sale.created</code></td>
                <td className="py-2 px-3 text-muted-foreground">A new sale was recorded</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">sale.refunded</code></td>
                <td className="py-2 px-3 text-muted-foreground">A sale was refunded</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payout.processed</code></td>
                <td className="py-2 px-3 text-muted-foreground">A payout was initiated</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payout.executed</code></td>
                <td className="py-2 px-3 text-muted-foreground">A payout was completed</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">payout.failed</code></td>
                <td className="py-2 px-3 text-muted-foreground">A payout failed</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">creator.created</code></td>
                <td className="py-2 px-3 text-muted-foreground">A new creator was added</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">period.closed</code></td>
                <td className="py-2 px-3 text-muted-foreground">An accounting period was closed</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">statement.generated</code></td>
                <td className="py-2 px-3 text-muted-foreground">A creator statement was generated</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Webhook Payload */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Webhook Payload</h2>
        <p className="text-muted-foreground mb-4">
          Every webhook POST includes these headers and a JSON body:
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
                <td className="py-2 px-3 text-muted-foreground">HMAC-SHA256 signature</td>
              </tr>
              <tr>
                <td className="py-2 px-3"><code className="bg-muted px-1 rounded">X-Soledgic-Event</code></td>
                <td className="py-2 px-3 text-muted-foreground">Event type (e.g., sale.created)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Example Payload</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`{
  "id": "evt_abc123",
  "type": "sale.created",
  "created_at": "2025-12-18T10:30:00Z",
  "livemode": true,
  "data": {
    "transaction_id": "txn_xyz789",
    "reference_id": "order_123",
    "creator_id": "creator_456",
    "amount": 2999,
    "currency": "USD",
    "breakdown": {
      "total": 29.99,
      "creator_amount": 23.99,
      "platform_amount": 6.00
    }
  }
}`}
          </pre>
        </div>
      </section>

      {/* Verifying Signatures */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Verifying Signatures</h2>
        <p className="text-muted-foreground mb-4">
          Always verify webhook signatures to ensure requests are from Soledgic.
          The signature is computed using HMAC-SHA256 with your webhook secret.
        </p>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-amber-600">
            <strong>Important:</strong> Your webhook secret is shown only once when you create the endpoint.
            Store it securely.
          </p>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Node.js</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// In your webhook handler
app.post('/webhooks/soledgic', (req, res) => {
  const signature = req.headers['x-soledgic-signature'];

  if (!verifyWebhookSignature(req.body, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  // Process the event
  const event = req.body;
  console.log('Received event:', event.type);

  res.status(200).send('OK');
});`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Python</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`import hmac
import hashlib
import json

def verify_webhook_signature(payload, signature, secret):
    expected = 'sha256=' + hmac.new(
        secret.encode(),
        json.dumps(payload).encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected)

# In your webhook handler (Flask example)
@app.route('/webhooks/soledgic', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Soledgic-Signature')

    if not verify_webhook_signature(request.json, signature, WEBHOOK_SECRET):
        return 'Invalid signature', 401

    event = request.json
    print(f"Received event: {event['type']}")

    return 'OK', 200`}
          </pre>
        </div>
      </section>

      {/* Retry Policy */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Retry Policy</h2>
        <p className="text-muted-foreground mb-4">
          If your endpoint returns a non-2xx status code, we&apos;ll retry the webhook:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2 mb-4">
          <li>Up to 5 retry attempts</li>
          <li>Exponential backoff: 1 min, 5 min, 30 min, 2 hours, 24 hours</li>
          <li>After 5 failures, the delivery is marked as failed</li>
        </ul>
        <p className="text-muted-foreground">
          You can view delivery attempts in the{' '}
          <Link href="/settings/webhooks" className="text-primary hover:underline">
            Webhooks settings
          </Link>{' '}
          page.
        </p>
      </section>

      {/* Best Practices */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Best Practices</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Return 200 quickly</p>
              <p className="text-sm text-muted-foreground">Acknowledge receipt immediately, then process asynchronously</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Handle duplicates</p>
              <p className="text-sm text-muted-foreground">Use the event ID to deduplicate in case of retries</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Verify signatures</p>
              <p className="text-sm text-muted-foreground">Always validate the X-Soledgic-Signature header</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-green-500">✓</span>
            <div>
              <p className="font-medium text-foreground">Use HTTPS</p>
              <p className="text-sm text-muted-foreground">Webhook endpoints must use HTTPS for security</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testing */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Testing Webhooks</h2>
        <p className="text-muted-foreground mb-4">
          Use the &quot;Test&quot; button in your webhook settings to send a test event.
          This sends a sample payload to verify your endpoint is configured correctly.
        </p>
        <p className="text-muted-foreground">
          For local development, use a tool like{' '}
          <a href="https://ngrok.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            ngrok
          </a>{' '}
          to expose your local server to the internet.
        </p>
      </section>

      {/* Processor Events (Internal) */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Processor Events (Internal)</h2>
        <p className="text-muted-foreground mb-4">
          Soledgic keeps payouts, refunds, and dispute holds in sync by ingesting events from your underlying payment processor.
          This is separate from the customer webhooks described above.
        </p>
        <div className="bg-card border border-border rounded-lg p-4 mb-4">
          <p className="text-sm text-muted-foreground">
            Configure your processor to send webhooks to <code className="bg-muted px-1.5 py-0.5 rounded">POST /api/webhooks/processor</code>.
            Protect it with <code className="bg-muted px-1.5 py-0.5 rounded">PROCESSOR_WEBHOOK_TOKEN</code> using one of:
            <span className="block mt-2">
              <code className="bg-muted px-1.5 py-0.5 rounded">Authorization: Bearer &lt;token&gt;</code>
              {' '}or{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded">Basic Auth</code> (password = token)
              {' '}or{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded">?token=&lt;token&gt;</code>.
            </span>
          </p>
        </div>
        <p className="text-muted-foreground">
          Inbound processor events are persisted and processed asynchronously, and may trigger outbound Soledgic webhooks
          like <code className="bg-muted px-1.5 py-0.5 rounded">payout.executed</code> after settlement.
        </p>
      </section>
    </div>
  )
}
