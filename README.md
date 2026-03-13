# Soledgic

Treasury infrastructure for platforms.

Soledgic is a ledger-native API for platform economies: create participants, track wallet balances, hold funds, run checkouts, pay out sellers or creators, and keep the ledger balanced underneath every flow.

## What It Is

Soledgic is built for products that manage money across multiple participants:

- Marketplaces
- Creator platforms
- Gaming and digital-goods economies
- AI agent networks
- Internal credit and balance systems

The public treasury surface is resource-first:

- `participants`
- `wallets`
- `transfers`
- `holds`
- `checkout-sessions`
- `payouts`
- `refunds`
- `reconciliations`
- `fraud`
- `compliance`
- `tax`

Behind those resources is a shared service layer and a double-entry ledger.

Shared identity and ecosystem management exist too, but they are operator control-plane features rather than public API-key resources. Those routes are documented separately in [docs/OPERATOR_CONTROL_PLANE.md](docs/OPERATOR_CONTROL_PLANE.md).

## Architecture

```text
API Gateway
  -> Resource handlers
  -> Shared treasury services
  -> PostgreSQL RPCs / ledger writes
```

The gateway should stay thin:

- Authentication
- Rate limiting
- Routing
- Request logging

Financial correctness lives below that layer.

## Quick Start

Install the TypeScript SDK:

```bash
npm install @soledgic/sdk
```

Create a client:

```ts
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({
  apiKey: process.env.SOLEDGIC_API_KEY!,
  baseUrl: 'https://api.soledgic.com/v1',
  apiVersion: '2026-03-01',
})
```

Create a participant:

```ts
const participant = await soledgic.createParticipant({
  participantId: 'creator_456',
  displayName: 'Jane Creator',
  email: 'jane@example.com',
  defaultSplitPercent: 80,
})
```

Create a checkout session:

```ts
const checkout = await soledgic.createCheckoutSession({
  participantId: 'creator_456',
  amount: 2999,
  currency: 'USD',
  productName: 'Premium asset pack',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
})
```

Inspect creator earnings wallets:

```ts
const wallets = await soledgic.listWallets({
  ownerId: 'creator_456',
  walletType: 'creator_earnings',
})
```

Wallets are first-class public resources, but balances stay scoped. A Soledgic
integration can use one `/v1/wallets` API surface across products while still
keeping each wallet tied to a specific ledger, owner, and wallet type. Soledgic
does not expose a pooled universal balance.

Create a payout:

```ts
const payout = await soledgic.createPayout({
  participantId: 'creator_456',
  referenceId: 'payout_2026_03_12_001',
  amount: 1500,
  payoutMethod: 'card',
})
```

## REST Examples

Create a participant:

```bash
curl -X POST "https://api.soledgic.com/v1/participants" \
  -H "x-api-key: sk_test_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_id": "creator_456",
    "display_name": "Jane Creator",
    "email": "jane@example.com",
    "default_split_percent": 80
  }'
```

Create a hosted checkout session:

```bash
curl -X POST "https://api.soledgic.com/v1/checkout-sessions" \
  -H "x-api-key: sk_test_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_id": "creator_456",
    "amount": 2999,
    "currency": "USD",
    "product_name": "Premium asset pack",
    "success_url": "https://example.com/success",
    "cancel_url": "https://example.com/cancel"
  }'
```

Fetch wallet state:

```bash
curl -X GET "https://api.soledgic.com/v1/wallets?owner_id=creator_456&wallet_type=creator_earnings" \
  -H "x-api-key: sk_test_YOUR_API_KEY"
```

Check payout eligibility:

```bash
curl -X GET "https://api.soledgic.com/v1/participants/creator_456/payout-eligibility" \
  -H "x-api-key: sk_test_YOUR_API_KEY"
```

Create a payout:

```bash
curl -X POST "https://api.soledgic.com/v1/payouts" \
  -H "x-api-key: sk_test_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_id": "creator_456",
    "reference_id": "payout_2026_03_12_001",
    "amount": 1500,
    "payout_method": "card"
  }'
```

## Canonical Resource Flow

The primary platform treasury flow is:

```text
participant
  -> checkout_session
  -> wallet balance / hold
  -> payout
  -> refund
```

For held funds:

```text
checkout_session
  -> hold created
  -> /v1/holds
  -> /v1/holds/{hold_id}/release
  -> payout or transfer
```

## Wallet Model

The wallet API is global, but wallet balances are not.

- `consumer_credit` wallets are closed-loop product balances.
- `creator_earnings` wallets hold seller or creator proceeds for payout.
- each wallet belongs to one ledger and one owner.
- payouts are only valid for payout-eligible wallet types.
- cross-platform movement is not implicit wallet behavior.

If a future product needs inter-ledger movement, model it as explicit settlement
rather than as a hidden universal wallet transfer.

## Idempotency

Soledgic does not treat every write the same way:

- `checkout-sessions` direct-charge mode accepts `idempotency_key`
- `refunds` accepts `idempotency_key`
- wallet mutations and treasury transfers are replay-safe through unique `reference_id`
- payouts currently deduplicate on `reference_id`

For new integrations, treat `reference_id` as the canonical replay key for treasury writes unless an endpoint explicitly supports `idempotency_key`.

## Webhooks

Current public event types include:

- `checkout.completed`
- `refund.created`
- `sale.refunded`
- `payout.created`
- `payout.executed`
- `payout.failed`

See the docs site for payload examples and signature verification guidance.

## Public API

The resource-first public API is documented in:

- `apps/web/src/app/(marketing)/docs`
- `docs/openapi.yaml`

The supported external contract is the `/v1` resource surface plus webhook signing. Dashboard/session routes such as `/api/identity/*` and `/api/ecosystems/*` are intentionally excluded from the public SDK and OpenAPI spec.

## Local Development

```bash
npm install
npm run supabase:start
npm run functions:serve
cd apps/web && npm run dev
```

Useful verification commands:

```bash
npx vitest run sdk/typescript/src/index.test.ts
npm run generate:openapi
npm run test:ecosystem
npm run test:ecosystem:cleanup -- --run-id <runId>
cd apps/web && npm run build
```

## Repo Layout

```text
apps/web/                         Next.js docs site and dashboard
sdk/typescript/                   TypeScript SDK
supabase/functions/               Edge functions
supabase/functions/_shared/       Shared treasury and ledger services
docs/openapi.yaml                 Generated OpenAPI spec
scripts/generate-openapi.ts       Spec generator
```

## Documentation

- Docs site: `/docs`
- API reference: `/docs/api`
- Quickstart: `/docs/quickstart`
- Authentication: `/docs/authentication`
- SDKs: `/docs/sdks`
- Webhooks: `/docs/webhooks`

## License

Proprietary. Copyright Osifo Holdings L.L.C.
