# Resource Model Migration

As of March 12, 2026, the canonical public treasury API is resource-first, and the older command-style treasury endpoints have been removed from the active runtime.

Use these endpoints for new integrations:

- `POST /v1/participants`
- `GET /v1/participants/{participant_id}`
- `GET /v1/participants/{participant_id}/payout-eligibility`
- `GET /v1/wallets`
- `POST /v1/wallets`
- `GET /v1/wallets/{wallet_id}`
- `GET /v1/wallets/{wallet_id}/entries`
- `POST /v1/wallets/{wallet_id}/topups`
- `POST /v1/wallets/{wallet_id}/withdrawals`
- `POST /v1/transfers`
- `GET /v1/holds`
- `GET /v1/holds/summary`
- `POST /v1/holds/{hold_id}/release`
- `POST /v1/checkout-sessions`
- `POST /v1/payouts`
- `POST /v1/refunds`

## Legacy Mapping

These older command-style endpoints are deprecated for new integrations:

| Legacy endpoint | Use instead |
|---|---|
| `POST /v1/create-creator` | `POST /v1/participants` |
| `GET|POST /v1/get-balance` | `GET /v1/participants/{participant_id}` and `GET /v1/wallets?owner_id={participant_id}` |
| `GET|POST /v1/get-balances` | `GET /v1/participants` and `GET /v1/wallets` |
| `POST /v1/create-checkout` | `POST /v1/checkout-sessions` |
| `POST /v1/process-payout` | `POST /v1/payouts` |
| `GET|POST /v1/check-payout-eligibility` | `GET /v1/participants/{participant_id}/payout-eligibility` |
| `POST /v1/record-refund` | `POST /v1/refunds` |
| `POST /v1/release-funds` | `GET /v1/holds`, `GET /v1/holds/summary`, `POST /v1/holds/{hold_id}/release` |
| `POST /v1/record-sale` | `POST /v1/checkout-sessions` for payment-backed sales |
| `POST /v1/execute-payout` | `POST /v1/payouts` plus payout rail status via webhooks |

## Replay Safety

Replay protection is not identical across every write:

- direct checkout requests support `idempotency_key`
- refunds support `idempotency_key`
- wallet mutations and transfers use unique `reference_id`
- payouts currently deduplicate on unique `reference_id`

If you are integrating retries or replay-prone webhooks, use a stable `reference_id` for payouts and transfers.
