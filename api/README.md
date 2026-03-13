# @soledgic/api

Legacy compatibility client for older Soledgic integrations.

This package is not the primary public SDK anymore. New integrations should use
[`@soledgic/sdk`](../sdk/typescript/README.md), which targets the supported
resource-first API surface under `/v1/*`.

## Status

- `@soledgic/sdk`: supported public SDK
- `@soledgic/api`: compatibility client for older command-oriented consumers

If you are building against Soledgic today, use:

```bash
npm install @soledgic/sdk
```

and point it at:

```text
https://api.soledgic.com/v1
```

## Public Wallet API

The supported wallet contract is exposed through the public treasury API and the
`@soledgic/sdk` client:

- `GET /v1/wallets`
- `POST /v1/wallets`
- `GET /v1/wallets/{wallet_id}`
- `GET /v1/wallets/{wallet_id}/entries`
- `POST /v1/wallets/{wallet_id}/topups`
- `POST /v1/wallets/{wallet_id}/withdrawals`

Wallets are first-class objects, but balances remain scoped. A wallet belongs
to one ledger, one owner, and one wallet type such as `consumer_credit` or
`creator_earnings`. Soledgic does not currently expose a universal pooled
wallet balance across platforms.

## Migration Guidance

If you still depend on this package:

1. move new integrations to `@soledgic/sdk`
2. migrate command-style checkout, payout, and refund flows to the resource
   routes documented in [`docs/RESOURCE_MODEL_MIGRATION.md`](../docs/RESOURCE_MODEL_MIGRATION.md)
3. treat this package as compatibility-only until it is either upgraded or
   removed
