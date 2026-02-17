# Inbound Processor Events (Second Half)

Soledgic treats inbound processor webhooks as an asynchronous event stream:

1. The web app receives the raw webhook.
2. The raw payload is stored for replay.
3. A background worker normalizes payloads into Soledgic domain events.
4. Domain handlers update ledger state and enqueue outbound customer webhooks.

This design is intentionally whitelabeled. Provider-specific logic is isolated to adapters and configuration.

## Components

### 1. Webhook Receiver (Web App)

Path:

- `apps/web/src/app/api/webhooks/processor/route.ts`

Responsibilities:

- Authenticate inbound requests with `PROCESSOR_WEBHOOK_TOKEN` (recommended in production).
- Persist the payload to `public.processor_webhook_inbox` (raw inbox) for async processing and replay.
- Ensure idempotency by assigning `event_id` (uses the provider id when present, otherwise a `sha256:` fallback).

### 2. Inbox Table (Database)

Migration:

- `supabase/migrations/20260290_processor_webhook_inbox.sql`

Table:

- `public.processor_webhook_inbox`

Key fields:

- `status`: `pending` | `processing` | `processed` | `failed` | `skipped`
- `attempts`, `processed_at`, `processing_error`

### 3. Worker (Edge Function)

Function:

- `supabase/functions/process-processor-inbox/index.ts`

Responsibilities:

- Claim pending inbox rows with `claim_processor_webhook_inbox()` (concurrency-safe).
- Normalize payloads into vendor-agnostic events using an adapter.
- Store normalized events in `public.processor_events` for replay/audit.
- Upsert `public.processor_transactions` for reconciliation.
- Apply handlers:
  - Payout status updates: updates payout transaction metadata and queues outbound webhooks.
  - Refund status updates: updates refund transaction metadata and queues outbound webhooks.
  - Dispute holds (optional): creates held_funds entries via `apply_dispute_hold`.

Authentication:

- Requires `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` by default.
- Optional: `PROCESS_PROCESSOR_INBOX_TOKEN` for ops/testing.

### 4. Normalization Adapter

Module:

- `supabase/functions/_shared/processor-webhook-adapters.ts`

The adapter converts inbound payloads into `NormalizedProcessorEvent` objects. The default adapter is designed to work with typical JSON event envelopes without provider naming.

Config:

- `PROCESSOR_WEBHOOK_ADAPTER=auto` (default)
- `PROCESSOR_AMOUNT_UNIT=minor` (default; change to `major` if your provider emits major units)

## Scheduling

Migration:

- `supabase/migrations/20260293_process_processor_inbox_cron.sql`

The worker runs every minute via `pg_cron` and invokes the edge function using the service role key.

## Dispute Holds (Optional)

Migration:

- `supabase/migrations/20260292_dispute_holds.sql`

Enable holds with:

- `PROCESSOR_WEBHOOK_ENABLE_DISPUTE_HOLDS=true`

Notes:

- Holds are event-driven and do not mutate historical sale transactions.
- Holds move funds from `creator_balance` to a dedicated `Dispute Reserve` account.
- Releases use the same reserve account to avoid accounting drift.

