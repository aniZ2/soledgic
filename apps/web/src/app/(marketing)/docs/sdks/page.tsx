import Link from 'next/link'
import { API_BASE_URL } from '../constants'

export default function SdksPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">SDKs & Libraries</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Use the TypeScript SDK or integrate against the REST API directly.
      </p>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
            <span className="text-lg">TS</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">TypeScript / JavaScript</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          The TypeScript SDK exposes the resource-first treasury surface directly.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Installation</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">npm install @soledgic/sdk</pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Usage</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`import Soledgic from '@soledgic/sdk';

const soledgic = new Soledgic(process.env.SOLEDGIC_API_KEY!);

const participant = await soledgic.createParticipant({
  participantId: 'creator_456',
  displayName: 'Jane Creator',
  email: 'jane@example.com',
  defaultSplitPercent: 80,
});

const checkout = await soledgic.createCheckoutSession({
  participantId: 'creator_456',
  amount: 2999,
  currency: 'USD',
  productName: 'Premium asset pack',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
});

console.log(checkout.checkoutSession.checkoutUrl);`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Treasury Helpers</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`const wallet = await soledgic.getParticipantWallet('creator_456');
const holds = await soledgic.listHolds({ participantId: 'creator_456' });
const eligibility = await soledgic.getParticipantPayoutEligibility('creator_456');

const payout = await soledgic.createPayout({
  participantId: 'creator_456',
  referenceId: 'payout_2026_03_12_001',
  amount: 1500,
  payoutMethod: 'card',
});

const refund = await soledgic.createRefund({
  saleReference: 'sale_123',
  reason: 'Customer requested refund',
});`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
            <span className="text-lg">REST</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">REST API</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          If you are not using the TypeScript SDK, the REST API is the canonical integration surface.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Create a Participant</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/participants \\
  -H "x-api-key: sk_test_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "participant_id": "creator_456",
    "display_name": "Jane Creator"
  }'`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Create a Checkout Session</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST ${API_BASE_URL}/v1/checkout-sessions \\
  -H "x-api-key: sk_test_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "participant_id": "creator_456",
    "amount": 2999,
    "currency": "USD",
    "success_url": "https://example.com/success"
  }'`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Node.js fetch</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`const response = await fetch('${API_BASE_URL}/v1/payouts', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.SOLEDGIC_API_KEY!,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    participant_id: 'creator_456',
    reference_id: 'payout_2026_03_12_001',
    amount: 1500,
    payout_method: 'card',
  }),
});

const result = await response.json();`}
          </pre>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Webhook Helpers</h2>
        <p className="text-muted-foreground mb-4">
          The TypeScript SDK includes webhook helpers for signature verification and payload parsing.
        </p>

        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`import Soledgic from '@soledgic/sdk';

const soledgic = new Soledgic(process.env.SOLEDGIC_API_KEY!);

const isValid = soledgic.webhooks.verifySignature(
  payload,
  signature,
  webhookSecret,
);

const event = soledgic.webhooks.parseEvent(payload);

if (event.type === 'payout.executed') {
  console.log('Payout completed:', event.data.payout_id);
}`}
          </pre>
        </div>
      </section>

      <section className="border-t border-border pt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/docs/api"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">API Reference →</h3>
            <p className="text-sm text-muted-foreground mt-1">Generated request and response docs</p>
          </Link>
          <Link
            href="/docs/webhooks"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Webhooks →</h3>
            <p className="text-sm text-muted-foreground mt-1">Event types and signature verification</p>
          </Link>
          <a
            href="https://github.com/soledgic/sdk-typescript"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h3 className="font-semibold text-foreground">TypeScript SDK →</h3>
            <p className="text-sm text-muted-foreground mt-1">Repository and package source</p>
          </a>
          <Link
            href="/docs/quickstart"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Quickstart →</h3>
            <p className="text-sm text-muted-foreground mt-1">End-to-end platform treasury flow</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
