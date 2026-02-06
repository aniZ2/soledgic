import Link from 'next/link'

export default function SdksPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-4">SDKs & Libraries</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Official SDKs for integrating Soledgic into your application.
      </p>

      {/* TypeScript/JavaScript */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
            <span className="text-lg">📦</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">TypeScript / JavaScript</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Our TypeScript SDK provides type-safe access to all Soledgic APIs.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Installation</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">npm install @soledgic/sdk</pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Usage</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`import { Soledgic } from '@soledgic/sdk';

// Initialize with your API key
const soledgic = new Soledgic(process.env.SOLEDGIC_API_KEY);

// Record a sale
const sale = await soledgic.recordSale({
  referenceId: 'order_123',
  creatorId: 'creator_456',
  amount: 2999, // $29.99 in cents
  description: 'Digital product sale'
});

console.log(sale.transactionId);
// => "txn_abc123"

console.log(sale.breakdown);
// => { total: 29.99, creatorAmount: 23.99, platformAmount: 6.00 }`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">More Examples</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`// Get a creator's balance
const balance = await soledgic.getBalance('creator_456');
console.log(\`Available: $\${balance.available}\`);

// Process a payout
const payout = await soledgic.processPayout({
  creatorId: 'creator_456',
  paymentMethod: 'stripe'
});

// Record a refund
const refund = await soledgic.recordRefund({
  originalSaleReference: 'order_123',
  reason: 'Customer requested'
});

// Get transactions
const transactions = await soledgic.getTransactions({
  creatorId: 'creator_456',
  type: 'sale',
  startDate: '2025-01-01',
  perPage: 50
});`}
          </pre>
        </div>
      </section>

      {/* Python */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <span className="text-lg">🐍</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Python</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Our Python SDK works with Python 3.8 and above.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Installation</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">pip install soledgic</pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Usage</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`import os
from soledgic import Soledgic

# Initialize with your API key
client = Soledgic(api_key=os.environ['SOLEDGIC_API_KEY'])

# Record a sale
sale = client.record_sale(
    reference_id='order_123',
    creator_id='creator_456',
    amount=2999,  # $29.99 in cents
    description='Digital product sale'
)

print(f"Transaction ID: {sale.transaction_id}")
print(f"Creator earns: \${sale.breakdown.creator_amount}")

# Get a creator's balance
balance = client.get_balance('creator_456')
print(f"Available: \${balance.available}")

# Process a payout
payout = client.process_payout(
    creator_id='creator_456',
    payment_method='stripe'
)`}
          </pre>
        </div>
      </section>

      {/* REST API */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
            <span className="text-lg">🌐</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">REST API</h2>
        </div>

        <p className="text-muted-foreground mb-4">
          Don&apos;t see your language? Use our REST API directly with any HTTP client.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">cURL Example</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`curl -X POST https://api.soledgic.com/v1/record-sale \\
  -H "x-api-key: sk_test_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "reference_id": "order_123",
    "creator_id": "creator_456",
    "amount": 2999,
    "description": "Digital product sale"
  }'`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Ruby</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`require 'net/http'
require 'json'

uri = URI('https://api.soledgic.com/v1/record-sale')
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true

request = Net::HTTP::Post.new(uri)
request['x-api-key'] = ENV['SOLEDGIC_API_KEY']
request['Content-Type'] = 'application/json'
request.body = {
  reference_id: 'order_123',
  creator_id: 'creator_456',
  amount: 2999
}.to_json

response = http.request(request)
result = JSON.parse(response.body)`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Go</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "os"
)

func recordSale() {
    payload := map[string]interface{}{
        "reference_id": "order_123",
        "creator_id":   "creator_456",
        "amount":       2999,
    }

    body, _ := json.Marshal(payload)

    req, _ := http.NewRequest("POST",
        "https://api.soledgic.com/v1/record-sale",
        bytes.NewBuffer(body))

    req.Header.Set("x-api-key", os.Getenv("SOLEDGIC_API_KEY"))
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`}
          </pre>
        </div>
      </section>

      {/* Webhook SDKs */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Webhook Helpers</h2>
        <p className="text-muted-foreground mb-4">
          Our SDKs include helpers for verifying webhook signatures.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">TypeScript</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto mb-4">
          <pre className="text-sm text-slate-300">
{`import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic(process.env.SOLEDGIC_API_KEY);

// Verify webhook signature
const isValid = soledgic.webhooks.verifySignature(
  payload,
  signature,
  webhookSecret
);

// Parse webhook event
const event = soledgic.webhooks.parseEvent(payload);

if (event.type === 'sale.created') {
  console.log('New sale:', event.data.transaction_id);
}`}
          </pre>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">Python</h3>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-300">
{`from soledgic import Soledgic

client = Soledgic(api_key=os.environ['SOLEDGIC_API_KEY'])

# Verify webhook signature
is_valid = client.webhooks.verify_signature(
    payload=payload,
    signature=signature,
    secret=webhook_secret
)

# Parse webhook event
event = client.webhooks.parse_event(payload)

if event.type == 'sale.created':
    print(f"New sale: {event.data['transaction_id']}")`}
          </pre>
        </div>
      </section>

      {/* Resources */}
      <section className="border-t border-border pt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="https://github.com/soledgic/sdk-typescript"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h3 className="font-semibold text-foreground">TypeScript SDK →</h3>
            <p className="text-sm text-muted-foreground mt-1">GitHub repository</p>
          </a>
          <a
            href="https://github.com/soledgic/sdk-python"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h3 className="font-semibold text-foreground">Python SDK →</h3>
            <p className="text-sm text-muted-foreground mt-1">GitHub repository</p>
          </a>
          <Link
            href="/docs/api"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">API Reference →</h3>
            <p className="text-sm text-muted-foreground mt-1">Complete endpoint documentation</p>
          </Link>
          <Link
            href="/docs/webhooks"
            className="block p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            <h3 className="font-semibold text-foreground">Webhooks →</h3>
            <p className="text-sm text-muted-foreground mt-1">Real-time event notifications</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
