# Soledgic TypeScript SDK

TypeScript client for Soledgic's public resource-first treasury API.

This package targets the supported API-key surface:

- `participants`
- `wallets`
- `transfers`
- `holds`
- `checkout-sessions`
- `payouts`
- `refunds`
- webhook endpoint management and signature verification

It does not wrap the dashboard/operator control-plane routes such as `/api/identity/*` or `/api/ecosystems/*`.

## Installation

```bash
npm install @soledgic/sdk
```

## Quick Start

```ts
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({
  apiKey: process.env.SOLEDGIC_API_KEY!,
  baseUrl: 'https://api.soledgic.com/v1',
  apiVersion: '2026-03-01',
})

const participant = await soledgic.createParticipant({
  participantId: 'creator_456',
  userId: '9f9b62d2-2f32-4b20-bc24-1f86b16cb9eb',
  displayName: 'Jane Creator',
  email: 'jane@example.com',
  defaultSplitPercent: 80,
})

const checkout = await soledgic.createCheckoutSession({
  participantId: participant.participant.id,
  amount: 2999,
  currency: 'USD',
  productName: 'Premium asset pack',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
})

const wallet = await soledgic.getParticipantWallet(participant.participant.id)

const payout = await soledgic.createPayout({
  participantId: participant.participant.id,
  referenceId: 'payout_2026_03_13_001',
  amount: 1500,
  payoutMethod: 'card',
})

console.log({
  checkoutUrl: checkout.checkoutSession.checkoutUrl,
  linkedUserId: participant.participant.linkedUserId,
  availableBalance: wallet.wallet.availableBalance,
  payoutStatus: payout.payout.status,
})
```

## Public Treasury Methods

### Participants

| Method | Description |
| --- | --- |
| `createParticipant(req)` | Create or provision a participant-backed treasury account |
| `listParticipants()` | List participant balances and linked-user state |
| `getParticipant(participantId)` | Get one participant with active hold detail |
| `getParticipantPayoutEligibility(participantId)` | Check payout readiness |

`createParticipant` accepts an optional `userId` so a public participant can be linked to a shared identity record without exposing the operator APIs directly.

### Wallets, Transfers, and Holds

| Method | Description |
| --- | --- |
| `getParticipantWallet(participantId)` | Get wallet balance and available balance |
| `walletDeposit(req)` | Deposit funds into a participant wallet |
| `walletWithdraw(req)` | Withdraw funds from a participant wallet |
| `getWalletHistory(participantId, opts?)` | List wallet entries |
| `createTransfer(req)` | Move funds between participant wallets |
| `listHolds(opts?)` | List held funds |
| `getHoldSummary()` | Get aggregate held-funds totals |
| `releaseHold(req)` | Release a hold and optionally execute the transfer |

### Checkout, Payouts, and Refunds

| Method | Description |
| --- | --- |
| `createCheckoutSession(req)` | Create hosted or direct checkout flows |
| `createPayout(req)` | Create a payout resource |
| `createRefund(req)` | Create a refund resource |
| `listRefunds(req?)` | Query refunds, including by `saleReference` |

### Webhooks

| Method | Description |
| --- | --- |
| `listWebhookEndpoints()` | List configured webhook endpoints |
| `getWebhookDeliveries(endpointId?, limit?)` | Inspect recent deliveries |
| `rotateWebhookSecret(endpointId)` | Rotate an endpoint secret |
| `webhooks.verifySignature(...)` | Verify `X-Soledgic-Signature` |
| `webhooks.parseEvent(payload)` | Parse a webhook payload into an event object |

## Replay Safety

Replay protection is endpoint-specific:

- direct checkout mode supports `idempotencyKey`
- refunds support `idempotencyKey`
- wallet writes, transfers, and payouts rely on stable `referenceId`

If your integration retries requests or replays processor events, treat `referenceId` as mandatory for treasury writes even when the type allows it.

## Error Handling

```ts
import Soledgic, { SoledgicError } from '@soledgic/sdk'

try {
  await soledgic.createPayout({
    participantId: 'creator_456',
    referenceId: 'payout_retry_safe_001',
    amount: 999999,
    payoutMethod: 'card',
  })
} catch (error) {
  if (error instanceof SoledgicError) {
    console.log(error.message)
    console.log(error.status)
    console.log(error.code)
  }
}
```

The SDK surfaces structured `error_code` values from the API when they are present. Use those codes for client logic instead of matching on human-readable messages.

## Security Boundary

This SDK is intentionally limited to the public integration contract:

- API-key treasury resources under `/v1/*`
- webhook verification helpers

It does not authenticate end-user dashboard sessions, and it does not expose the internal operator routes used for:

- shared identity profiles
- participant identity linking and unlinking
- ecosystem management
- internal fixture cleanup

Those flows are documented in [docs/OPERATOR_CONTROL_PLANE.md](../../docs/OPERATOR_CONTROL_PLANE.md).
