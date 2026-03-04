# Failure-Drill Matrix

Controlled failure simulation drills for the Soledgic payment pipeline.

**Purpose:** Verify the system survives real-world failure modes — not just that runbooks exist. Each drill injects a specific fault in staging, defines the expected automatic response, and provides exact verify/recovery steps.

**Last updated:** 2026-03-04

---

## Prerequisites

### Environment

- **Staging Supabase project** with production schema applied
- `.env.test` configured with staging credentials (never production)
- At least one active ledger with a test creator and funded cash account
- Webhook endpoint registered (use a request-bin or test server)

### Recovery mechanism schedule

| Mechanism | Trigger | Interval |
|-----------|---------|----------|
| `process-processor-inbox` | cron or manual POST | every 2 min |
| `reconcile-checkout-ledger` | **manual POST only** (no cron scheduled) | on demand |
| `process-webhooks` | cron (`x-cron-secret`) | every 1 min |
| `claim_processor_webhook_inbox` | called by process-processor-inbox | on demand |
| `mark_webhook_failed` | called by process-webhooks | on demand |

### Safety rules

1. **Never run drills on production.** Staging only.
2. Back up the staging database before injecting faults.
3. Run drills sequentially within a category — some share state.
4. Clean up all injected test data after each category (recovery steps provided).
5. If a drill leaves the system in an unexpected state, restore from backup before continuing.

---

## Severity Legend

| Level | Label | Meaning |
|-------|-------|---------|
| **S1** | Data integrity risk | Silent corruption, stranded funds, double-spend |
| **S2** | Availability risk | Degraded service, no permanent data loss |
| **S3** | Operational risk | Delayed delivery, self-healing or low-impact |

---

## Drill Matrix

### Category 1: Duplicate & Out-of-Order Processor Events

#### INBOX-01 — Duplicate `event_id` ingestion

| Field | Detail |
|-------|--------|
| **Severity** | S3 |
| **Inject** | POST the same webhook payload twice to `/api/webhooks/processor` with identical `id` (event_id) and valid `Finix-Signature`. |

```bash
# First request — accepted
curl -X POST "$NEXT_URL/api/webhooks/processor" \
  -H "Content-Type: application/json" \
  -H "Finix-Signature: $SIG" \
  -d '{"id":"evt_drill_01","type":"transfer.updated","data":{"id":"TRxxx","state":"SUCCEEDED","tags":{"ledger_id":"'"$LEDGER_ID"'"}}}'

# Second request — duplicate
curl -X POST "$NEXT_URL/api/webhooks/processor" \
  -H "Content-Type: application/json" \
  -H "Finix-Signature: $SIG" \
  -d '{"id":"evt_drill_01","type":"transfer.updated","data":{"id":"TRxxx","state":"SUCCEEDED","tags":{"ledger_id":"'"$LEDGER_ID"'"}}}'
```

| Field | Detail |
|-------|--------|
| **Expected** | First request returns `200`. Second returns `200` with `{ "duplicate": true }`. Only one row in `processor_webhook_inbox`. |
| **Verify** | |

```sql
SELECT count(*) FROM processor_webhook_inbox WHERE event_id = 'evt_drill_01';
-- Expected: 1
```

| Field | Detail |
|-------|--------|
| **Recovery** | `DELETE FROM processor_webhook_inbox WHERE event_id = 'evt_drill_01';` |
| **Automatable?** | Yes — integration test against staging route |

---

#### INBOX-02 — Duplicate in `processor_events`

| Field | Detail |
|-------|--------|
| **Severity** | S3 |
| **Inject** | Insert an inbox row whose `processor_event_id` already exists in `processor_events`, then invoke `process-processor-inbox`. The `ignoreDuplicates` upsert pattern should skip without error. |

```sql
-- Seed a processor_event first
INSERT INTO processor_events (processor_event_id, ledger_id, event_type, amount, status, raw_data, created_at)
VALUES ('TRdrill02', $LEDGER_ID, 'transfer', 1000, 'completed', '{}', NOW());

-- Insert inbox row referencing the same processor_event_id
INSERT INTO processor_webhook_inbox (event_id, event_type, payload, status, received_at)
VALUES ('evt_drill_02', 'transfer.updated',
  '{"id":"evt_drill_02","type":"transfer.updated","data":{"id":"TRdrill02","state":"SUCCEEDED","amount":1000,"tags":{"ledger_id":"' || $LEDGER_ID || '"}}}'::jsonb,
  'pending', NOW());
```

Then POST to `process-processor-inbox`.

| Field | Detail |
|-------|--------|
| **Expected** | Inbox row transitions to `processed`. Original `processor_events` row is unchanged (upsert kept original). |
| **Verify** | |

```sql
SELECT status FROM processor_webhook_inbox WHERE event_id = 'evt_drill_02';
-- Expected: 'processed'

SELECT count(*) FROM processor_events WHERE processor_event_id = 'TRdrill02';
-- Expected: 1 (no duplicate created)
```

| Field | Detail |
|-------|--------|
| **Recovery** | |

```sql
DELETE FROM processor_webhook_inbox WHERE event_id = 'evt_drill_02';
DELETE FROM processor_events WHERE processor_event_id = 'TRdrill02';
```

| Field | Detail |
|-------|--------|
| **Automatable?** | Yes — Vitest with Supabase service client |

---

#### INBOX-03 — Out-of-order: refund before charge (processed as no-op)

| Field | Detail |
|-------|--------|
| **Severity** | S1 |
| **Inject** | Insert a refund inbox row with a valid `ledger_id` in tags but referencing a refund transaction that does not yet exist. Then insert the original charge. |

```sql
-- Step 1: refund arrives first (no matching refund transaction in ledger)
INSERT INTO processor_webhook_inbox (event_id, event_type, payload, status, received_at)
VALUES ('evt_drill_03_refund', 'refund.updated',
  '{"id":"evt_drill_03_refund","type":"refund.updated","data":{"id":"RFdrill03","state":"SUCCEEDED","amount":500,"linked_to":"TRdrill03","tags":{"ledger_id":"' || $LEDGER_ID || '"}}}'::jsonb,
  'pending', NOW());
```

Then invoke `process-processor-inbox`.

```sql
-- Step 2: charge arrives later
INSERT INTO processor_webhook_inbox (event_id, event_type, payload, status, received_at)
VALUES ('evt_drill_03_charge', 'transfer.updated',
  '{"id":"evt_drill_03_charge","type":"transfer.updated","data":{"id":"TRdrill03","state":"SUCCEEDED","amount":1000,"tags":{"ledger_id":"' || $LEDGER_ID || '"}}}'::jsonb,
  'pending', NOW());
```

Then invoke `process-processor-inbox` again.

| Field | Detail |
|-------|--------|
| **Expected** | **Refund row is marked `processed` — but as a silent no-op.** `handleRefundUpdate()` returns `{ transactionId: null, webhookQueued: false }` when no matching refund transaction exists (`process-processor-inbox/index.ts:175`). The main loop still marks the inbox row and processor event as `processed` (`index.ts:467-473`). No ledger write occurs, no webhook queued. The charge processes normally on the second run. **This is a known gap**: the refund event is silently consumed without applying any state change. |
| **Verify** | |

```sql
SELECT event_id, status, processing_error
FROM processor_webhook_inbox
WHERE event_id IN ('evt_drill_03_refund', 'evt_drill_03_charge')
ORDER BY event_id;
-- refund: 'processed' (silent no-op — no linked transaction found)
-- charge: 'processed'

-- Verify no refund-related ledger entries were created
SELECT count(*) FROM processor_events
WHERE processor_event_id = 'RFdrill03';
-- Expected: 1 (event stored, but no transaction linked)

SELECT pe.transaction_id FROM processor_events pe
WHERE pe.processor_event_id = 'RFdrill03';
-- Expected: NULL (no linked transaction)
```

| Field | Detail |
|-------|--------|
| **Recovery** | |

```sql
DELETE FROM processor_webhook_inbox WHERE event_id LIKE 'evt_drill_03%';
DELETE FROM processor_events WHERE processor_event_id IN ('TRdrill03', 'RFdrill03');
```

| Field | Detail |
|-------|--------|
| **Automatable?** | Yes — Vitest with controlled insert ordering |
| **Follow-up** | Consider adding dead-letter detection for refund events processed with `transaction_id = NULL` |

---

### Category 2: Stuck Processor Webhook Inbox

#### INBOX-04 — Stale processing row reclaim

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | Insert an inbox row stuck in `processing` with `processing_started_at` 15 minutes ago. |

```sql
INSERT INTO processor_webhook_inbox (event_id, event_type, payload, status, processing_started_at, attempts, received_at)
VALUES ('evt_drill_04', 'transfer.updated',
  '{"id":"evt_drill_04","type":"transfer.updated","data":{"id":"TRdrill04","state":"SUCCEEDED","amount":100,"tags":{"ledger_id":"' || $LEDGER_ID || '"}}}'::jsonb,
  'processing', NOW() - interval '15 minutes', 1, NOW() - interval '16 minutes');
```

Then invoke `process-processor-inbox`.

| Field | Detail |
|-------|--------|
| **Expected** | `claim_processor_webhook_inbox` reclaims the row (status = `processing` AND `processing_started_at <= NOW() - 10 min`). Row is reprocessed and transitions to `processed`. |
| **Verify** | |

```sql
SELECT status, attempts FROM processor_webhook_inbox WHERE event_id = 'evt_drill_04';
-- Expected: status = 'processed', attempts = 2
```

| Field | Detail |
|-------|--------|
| **Recovery** | |

```sql
DELETE FROM processor_webhook_inbox WHERE event_id = 'evt_drill_04';
DELETE FROM processor_events WHERE processor_event_id = 'TRdrill04';
```

| Field | Detail |
|-------|--------|
| **Automatable?** | Yes — Vitest |

---

#### INBOX-05 — Concurrent worker safety

| Field | Detail |
|-------|--------|
| **Severity** | S1 |
| **Inject** | Insert 10 pending inbox rows. Fire two concurrent `process-processor-inbox` calls. |

```sql
INSERT INTO processor_webhook_inbox (event_id, event_type, payload, status, received_at)
SELECT
  'evt_drill_05_' || i,
  'transfer.updated',
  ('{"id":"evt_drill_05_' || i || '","type":"transfer.updated","data":{"id":"TRdrill05_' || i || '","state":"SUCCEEDED","amount":100,"tags":{"ledger_id":"' || $LEDGER_ID || '"}}}')::jsonb,
  'pending',
  NOW()
FROM generate_series(1, 10) AS i;
```

```bash
# Fire two workers concurrently
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" &
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" &
wait
```

| Field | Detail |
|-------|--------|
| **Expected** | `FOR UPDATE SKIP LOCKED` ensures no row is claimed twice. Each event appears exactly once in `processor_events`. Both workers return success (one may process 0 rows). |
| **Verify** | |

```sql
-- No row processed more than once
SELECT event_id, count(*) FROM processor_events
WHERE processor_event_id LIKE 'TRdrill05_%'
GROUP BY event_id HAVING count(*) > 1;
-- Expected: 0 rows

-- All 10 inbox rows processed
SELECT count(*) FROM processor_webhook_inbox
WHERE event_id LIKE 'evt_drill_05_%' AND status = 'processed';
-- Expected: 10
```

| Field | Detail |
|-------|--------|
| **Recovery** | |

```sql
DELETE FROM processor_webhook_inbox WHERE event_id LIKE 'evt_drill_05_%';
DELETE FROM processor_events WHERE processor_event_id LIKE 'TRdrill05_%';
```

| Field | Detail |
|-------|--------|
| **Automatable?** | Partially — requires concurrent HTTP calls (shell script or Promise.all in test) |

---

#### INBOX-06 — Missing `ledger_id`

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | Insert an inbox row with no `tags.ledger_id` and no resolvable `linked_transfer_id`. |

```sql
INSERT INTO processor_webhook_inbox (event_id, event_type, payload, status, received_at)
VALUES ('evt_drill_06', 'transfer.updated',
  '{"id":"evt_drill_06","type":"transfer.updated","data":{"id":"TRdrill06","state":"SUCCEEDED","amount":100,"tags":{}}}'::jsonb,
  'pending', NOW());
```

Then invoke `process-processor-inbox`.

| Field | Detail |
|-------|--------|
| **Expected** | Row marked `skipped` — no ledger_id available, cannot route to any ledger. |
| **Verify** | |

```sql
SELECT status, processing_error FROM processor_webhook_inbox WHERE event_id = 'evt_drill_06';
-- Expected: status = 'skipped' (or 'failed' with error referencing missing ledger_id)
```

| Field | Detail |
|-------|--------|
| **Recovery** | `DELETE FROM processor_webhook_inbox WHERE event_id = 'evt_drill_06';` |
| **Automatable?** | Yes — Vitest |

---

### Category 3: Payout Execution Failure & Retry

#### PAYOUT-01 — Processor timeout / failure during execute

| Field | Detail |
|-------|--------|
| **Severity** | S1 |
| **Inject** | Create a payout ledger entry (debit cash, credit creator_balance). Call `execute-payout` with a processor API endpoint that returns a failure or times out (configure `PROCESSOR_API_URL` to a failing endpoint). |

```bash
# Point processor to a failing endpoint
# In staging .env:
# PROCESSOR_API_URL=https://httpstat.us/504?sleep=60000

curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payout_id":"'"$TEST_PAYOUT_ID"'"}'
```

| Field | Detail |
|-------|--------|
| **Expected** | The provider returns a failed result. **`execute-payout` still writes `rail_status` and `rail_error` into the transaction metadata** (`execute-payout/index.ts:568-579`) — the update always runs after `railImpl.execute()`, regardless of success or failure. The local payout status is marked `failed`. **The external outcome is ambiguous**: the processor may or may not have initiated the transfer before the timeout. An operator must verify processor-side status before retrying. |
| **Verify** | |

```sql
SELECT id, status,
  metadata->>'rail_status' as rail_status,
  metadata->>'rail_error' as rail_error,
  metadata->>'rail_used' as rail_used
FROM transactions WHERE id = $TEST_PAYOUT_ID;
-- Expected: rail_status = 'failed', rail_error IS NOT NULL

-- Check audit log for the execution attempt
SELECT action, details->>'status' as status
FROM audit_log
WHERE details->>'payout_id' = $TEST_PAYOUT_ID
ORDER BY created_at DESC LIMIT 1;
```

| Field | Detail |
|-------|--------|
| **Recovery** | 1. Restore `PROCESSOR_API_URL` to valid endpoint. 2. **Before retrying**: check processor dashboard for the `idempotency_id` (`payout_{id}`) to verify whether a transfer was created. 3. If no processor-side transfer exists, re-invoke `execute-payout` (idempotency protects against duplicate). If a transfer does exist, manually reconcile status. |
| **Automatable?** | Partially — requires env var manipulation and a mock failing endpoint |

---

#### PAYOUT-02 — Idempotent manual retry

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | After a successful `execute-payout`, call it again with the same `payout_id`. The processor's `idempotency_id` (`payout_{id}`) should prevent a duplicate transfer. |

```bash
# First call
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payout_id":"'"$TEST_PAYOUT_ID"'"}'

# Retry (same payout_id)
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payout_id":"'"$TEST_PAYOUT_ID"'"}'
```

| Field | Detail |
|-------|--------|
| **Expected** | Second call either returns the same transfer (idempotent) or recognizes the payout is already completed. No duplicate processor transfer created. |
| **Verify** | |

```sql
-- Only one processor transaction for this payout
SELECT count(*) FROM processor_transactions
WHERE metadata->>'soledgic_payout_id' = $TEST_PAYOUT_ID;
-- Expected: 1

-- Payout status unchanged
SELECT status FROM payouts WHERE id = $TEST_PAYOUT_ID;
-- Expected: 'completed' or 'processing'
```

| Field | Detail |
|-------|--------|
| **Recovery** | No cleanup needed if idempotency worked correctly. |
| **Automatable?** | Yes — Vitest with staging processor sandbox |

---

#### PAYOUT-03 — Concurrent payout race

| Field | Detail |
|-------|--------|
| **Severity** | S1 |
| **Inject** | Fire two `execute-payout` calls for the same `payout_id` simultaneously. |

```bash
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payout_id":"'"$TEST_PAYOUT_ID"'"}' &
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payout_id":"'"$TEST_PAYOUT_ID"'"}' &
wait
```

| Field | Detail |
|-------|--------|
| **Expected** | `FOR UPDATE` lock serializes access. One call succeeds and transitions payout. The other either waits and sees it's already processed, or gets a conflict error. No double-spend. |
| **Verify** | |

```sql
-- Exactly one processor transfer
SELECT count(*) FROM processor_transactions
WHERE metadata->>'soledgic_payout_id' = $TEST_PAYOUT_ID;
-- Expected: 1

-- Ledger balanced
SELECT
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as debits,
  SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as credits
FROM entries e JOIN transactions t ON e.transaction_id = t.id
WHERE t.reference_id = 'payout_' || $TEST_PAYOUT_ID;
-- Expected: debits = credits
```

| Field | Detail |
|-------|--------|
| **Recovery** | Standard payout cleanup if needed. |
| **Automatable?** | Partially — requires concurrent HTTP calls |

---

### Category 4: Delayed `charged_pending_ledger` Reconciliation

> **Note:** `reconcile-checkout-ledger` has no cron schedule in the repo. These drills
> simulate manual operator invocations of the worker. If a cron is added later, these
> drills also validate the automated path.

#### RECON-01 — Manual reconciler catches stuck session

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | Create a checkout session stuck in `charged_pending_ledger` for 30 minutes (within the 24h cutoff). |

```sql
INSERT INTO checkout_sessions (
  id, ledger_id, creator_id, amount, creator_amount, platform_amount,
  status, reference_id, updated_at, created_at
) VALUES (
  gen_random_uuid(), $LEDGER_ID, $CREATOR_ID, 1000, 900, 100,
  'charged_pending_ledger', 'checkout_drill_recon01',
  NOW() - interval '30 minutes', NOW() - interval '35 minutes'
) RETURNING id;
-- Save the returned id as $SESSION_ID
```

Then manually invoke `reconcile-checkout-ledger`:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-checkout-ledger" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

| Field | Detail |
|-------|--------|
| **Expected** | Reconciler calls `record_sale_atomic`, transitions session to `completed`, queues `checkout.completed` webhook. |
| **Verify** | |

```sql
SELECT status, completed_at FROM checkout_sessions WHERE id = $SESSION_ID;
-- Expected: status = 'completed', completed_at IS NOT NULL

-- Sale recorded in ledger
SELECT count(*) FROM transactions WHERE reference_id = 'checkout_drill_recon01';
-- Expected: 1

-- Webhook queued
SELECT count(*) FROM webhook_deliveries
WHERE ledger_id = $LEDGER_ID AND event_type = 'checkout.completed'
  AND payload->'data'->>'session_id' = $SESSION_ID;
-- Expected: 1
```

| Field | Detail |
|-------|--------|
| **Recovery** | |

```sql
DELETE FROM webhook_deliveries WHERE payload->'data'->>'session_id' = $SESSION_ID;
DELETE FROM entries WHERE transaction_id IN (SELECT id FROM transactions WHERE reference_id = 'checkout_drill_recon01');
DELETE FROM transactions WHERE reference_id = 'checkout_drill_recon01';
DELETE FROM checkout_sessions WHERE id = $SESSION_ID;
```

| Field | Detail |
|-------|--------|
| **Automatable?** | Yes — Vitest |

---

#### RECON-02 — 24h cutoff enforcement

| Field | Detail |
|-------|--------|
| **Severity** | S1 |
| **Inject** | Create a checkout session stuck in `charged_pending_ledger` for 25 hours (beyond the 24h cutoff). |

```sql
INSERT INTO checkout_sessions (
  id, ledger_id, creator_id, amount, creator_amount, platform_amount,
  status, reference_id, updated_at, created_at
) VALUES (
  gen_random_uuid(), $LEDGER_ID, $CREATOR_ID, 2000, 1800, 200,
  'charged_pending_ledger', 'checkout_drill_recon02',
  NOW() - interval '25 hours', NOW() - interval '26 hours'
) RETURNING id;
-- Save as $SESSION_ID_OLD
```

Then manually invoke `reconcile-checkout-ledger`:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-checkout-ledger" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

| Field | Detail |
|-------|--------|
| **Expected** | Reconciler skips this session (its `updated_at` is older than `NOW() - 24h`). Session stays in `charged_pending_ledger`. Requires manual intervention. |
| **Verify** | |

```sql
SELECT status FROM checkout_sessions WHERE id = $SESSION_ID_OLD;
-- Expected: 'charged_pending_ledger' (unchanged)

-- No transaction created
SELECT count(*) FROM transactions WHERE reference_id = 'checkout_drill_recon02';
-- Expected: 0
```

| Field | Detail |
|-------|--------|
| **Recovery** | `DELETE FROM checkout_sessions WHERE id = $SESSION_ID_OLD;` |
| **Automatable?** | Yes — Vitest |

---

#### RECON-03 — Duplicate reconciliation safety

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | Create a stuck session, then manually invoke `reconcile-checkout-ledger` twice concurrently. |

```bash
# Fire two manual reconciler invocations simultaneously
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-checkout-ledger" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":5}' &
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-checkout-ledger" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":5}' &
wait
```

| Field | Detail |
|-------|--------|
| **Expected** | First run calls `record_sale_atomic` and transitions session. Second run either: (a) `record_sale_atomic` returns `23505` unique_violation on `reference_id` (treated as "already recorded"), or (b) the atomic `UPDATE ... eq('status', 'charged_pending_ledger')` returns no rows. Either way, no duplicate ledger entries. |
| **Verify** | |

```sql
-- Exactly one transaction
SELECT count(*) FROM transactions WHERE reference_id LIKE 'checkout_drill_recon03%';
-- Expected: 1

-- Session completed exactly once
SELECT status FROM checkout_sessions WHERE reference_id = 'checkout_drill_recon03';
-- Expected: 'completed'
```

| Field | Detail |
|-------|--------|
| **Recovery** | Same cleanup as RECON-01. |
| **Automatable?** | Partially — requires concurrent invocations |

---

### Category 5: Webhook Delivery Backlog & Replay

#### WEBHOOK-01 — Endpoint returns 500 → retry

| Field | Detail |
|-------|--------|
| **Severity** | S3 |
| **Inject** | Configure the test webhook endpoint to return `500`. Queue a webhook delivery. Invoke `process-webhooks`. |

```sql
-- Insert a pending delivery (assumes webhook_endpoint already registered)
INSERT INTO webhook_deliveries (
  id, ledger_id, webhook_endpoint_id, event_type, payload, status, attempts, max_attempts, created_at
) VALUES (
  gen_random_uuid(), $LEDGER_ID, $ENDPOINT_ID,
  'test.drill', '{"drill":"WEBHOOK-01"}'::jsonb,
  'pending', 0, 5, NOW()
) RETURNING id;
-- Save as $DELIVERY_ID
```

Then invoke `process-webhooks` via cron trigger.

| Field | Detail |
|-------|--------|
| **Expected** | Delivery attempt fails (500). `mark_webhook_failed` sets `status = 'retrying'`, `attempts = 1`, `next_retry_at = NOW() + ~60s` (base 2^0 * 60 = 60s + 0-30s jitter). |
| **Verify** | |

```sql
SELECT status, attempts, next_retry_at, response_status
FROM webhook_deliveries WHERE id = $DELIVERY_ID;
-- Expected: status = 'retrying', attempts = 1, response_status = 500
-- next_retry_at between NOW() + 60s and NOW() + 90s
```

| Field | Detail |
|-------|--------|
| **Recovery** | `DELETE FROM webhook_deliveries WHERE id = $DELIVERY_ID;` |
| **Automatable?** | Yes — Vitest with mock HTTP server |

---

#### WEBHOOK-02 — 429 throttle minimum delay

| Field | Detail |
|-------|--------|
| **Severity** | S3 |
| **Inject** | Configure the test webhook endpoint to return `429`. Queue a delivery and invoke `process-webhooks`. |

```sql
INSERT INTO webhook_deliveries (
  id, ledger_id, webhook_endpoint_id, event_type, payload, status, attempts, max_attempts, created_at
) VALUES (
  gen_random_uuid(), $LEDGER_ID, $ENDPOINT_ID,
  'test.drill', '{"drill":"WEBHOOK-02"}'::jsonb,
  'pending', 0, 5, NOW()
) RETURNING id;
-- Save as $DELIVERY_ID
```

| Field | Detail |
|-------|--------|
| **Expected** | `mark_webhook_failed` applies the 429 override: `GREATEST(base_delay, 300)` → at least 5 minutes. `next_retry_at >= NOW() + interval '5 minutes'`. |
| **Verify** | |

```sql
SELECT status, attempts, next_retry_at, response_status
FROM webhook_deliveries WHERE id = $DELIVERY_ID;
-- Expected: status = 'retrying', response_status = 429
-- next_retry_at >= NOW() + interval '5 minutes'

SELECT EXTRACT(EPOCH FROM (next_retry_at - NOW())) >= 300 AS throttle_enforced
FROM webhook_deliveries WHERE id = $DELIVERY_ID;
-- Expected: true
```

| Field | Detail |
|-------|--------|
| **Recovery** | `DELETE FROM webhook_deliveries WHERE id = $DELIVERY_ID;` |
| **Automatable?** | Yes — Vitest with mock HTTP server returning 429 |

---

#### WEBHOOK-03 — Max attempts exhaustion

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | Insert a delivery with `attempts = 4` and `max_attempts = 5`. Configure endpoint to return 500. Invoke `process-webhooks`. |

```sql
INSERT INTO webhook_deliveries (
  id, ledger_id, webhook_endpoint_id, event_type, payload, status, attempts, max_attempts, next_retry_at, created_at
) VALUES (
  gen_random_uuid(), $LEDGER_ID, $ENDPOINT_ID,
  'test.drill', '{"drill":"WEBHOOK-03"}'::jsonb,
  'retrying', 4, 5, NOW(), NOW() - interval '1 hour'
) RETURNING id;
-- Save as $DELIVERY_ID
```

| Field | Detail |
|-------|--------|
| **Expected** | 5th failure triggers `mark_webhook_failed` with `v_attempts + 1 >= v_max_attempts`. Status becomes `'failed'`. `next_retry_at` set to `NULL`. No further retries. |
| **Verify** | |

```sql
SELECT status, attempts, next_retry_at FROM webhook_deliveries WHERE id = $DELIVERY_ID;
-- Expected: status = 'failed', attempts = 5, next_retry_at IS NULL
```

| Field | Detail |
|-------|--------|
| **Recovery** | `DELETE FROM webhook_deliveries WHERE id = $DELIVERY_ID;` |
| **Automatable?** | Yes — Vitest |

---

### Category 6: Redis / Rate-Limit Fallback

#### RATE-01 — Redis down → Postgres fallback

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | Set `UPSTASH_REDIS_REST_URL` to an invalid endpoint (e.g., `https://invalid.upstash.io`). Call a non-fail-closed endpoint (e.g., `list-transactions`). |

```bash
# In staging environment
supabase secrets set UPSTASH_REDIS_REST_URL=https://invalid.upstash.io

curl -X GET "$SUPABASE_URL/functions/v1/list-transactions" \
  -H "x-api-key: $TEST_API_KEY"
```

| Field | Detail |
|-------|--------|
| **Expected** | Redis connection fails. System falls back to Postgres rate limiting at 50% throughput (`DB_FALLBACK_THROTTLE = 0.5`). Request succeeds. Logs emit `"DB Fallback Active"` warning. |
| **Verify** | |

```bash
# Request should succeed (non-fail-closed endpoint)
# Check function logs for:
#   "DB Fallback Active: list-transactions throttled to N/Ns"
```

| Field | Detail |
|-------|--------|
| **Recovery** | `supabase secrets set UPSTASH_REDIS_REST_URL=$REAL_REDIS_URL` |
| **Automatable?** | Partially — requires env var changes on staging |

---

#### RATE-02 — Fail-closed with Redis down

| Field | Detail |
|-------|--------|
| **Severity** | S2 |
| **Inject** | With Redis still pointed at the invalid endpoint (from RATE-01), call a fail-closed endpoint: `execute-payout`. |

```bash
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payout_id":"'"$TEST_PAYOUT_ID"'"}'
```

| Field | Detail |
|-------|--------|
| **Expected** | Redis fails. DB fallback is attempted with `p_fail_closed: true`. If DB fallback also errors, the request is **blocked** (fail-closed). The `FAIL_CLOSED_ENDPOINTS` list includes `execute-payout`, `process-payout`, `record-sale`, and `create-ledger`. |
| **Verify** | |

```bash
# Response should be 429 (rate limited) or 503
# Logs should show:
#   "All rate limiting failed for execute-payout"
#   followed by fail-closed block
```

| Field | Detail |
|-------|--------|
| **Recovery** | `supabase secrets set UPSTASH_REDIS_REST_URL=$REAL_REDIS_URL` |
| **Automatable?** | Partially — requires env var manipulation |

---

#### RATE-03 — Redis failover alert detection

| Field | Detail |
|-------|--------|
| **Severity** | S3 |
| **Inject** | With Redis invalid, make 5+ requests to different endpoints to trigger repeated DB fallback activations. Check `security-alerts` logs or the `security_alert_log` table. |

```bash
for i in {1..6}; do
  curl -s -o /dev/null "$SUPABASE_URL/functions/v1/list-transactions" \
    -H "x-api-key: $TEST_API_KEY"
done
```

| Field | Detail |
|-------|--------|
| **Expected** | After 5+ DB fallback activations, the `security-alerts` function (if running) should emit a "Redis Failover Active" warning. Logs accumulate `"DB Fallback Active"` messages. |
| **Verify** | |

```bash
# Check Edge Function logs for repeated "DB Fallback Active" warnings
# If security-alerts cron exists, check:
```

```sql
SELECT * FROM audit_log
WHERE action LIKE '%redis%' OR action LIKE '%fallback%'
ORDER BY created_at DESC LIMIT 10;
```

| Field | Detail |
|-------|--------|
| **Recovery** | `supabase secrets set UPSTASH_REDIS_REST_URL=$REAL_REDIS_URL` |
| **Automatable?** | Partially — depends on security-alerts cron being active (currently no cron scheduled) |

---

## Drill Runner Checklist

Execute drills in this order to minimize dependency conflicts:

### Phase 1: Rate-limit drills (isolated env var changes)
- [ ] RATE-01 — Redis down → Postgres fallback
- [ ] RATE-02 — Fail-closed with Redis down
- [ ] RATE-03 — Redis failover alert detection
- [ ] **Restore** `UPSTASH_REDIS_REST_URL` to real value

### Phase 2: Inbox drills (inject test rows, process, verify)
- [ ] INBOX-01 — Duplicate event_id ingestion
- [ ] INBOX-02 — Duplicate in processor_events
- [ ] INBOX-03 — Out-of-order: refund before charge
- [ ] INBOX-04 — Stale processing row reclaim
- [ ] INBOX-05 — Concurrent worker safety
- [ ] INBOX-06 — Missing ledger_id
- [ ] **Cleanup:** `DELETE FROM processor_webhook_inbox WHERE event_id LIKE 'evt_drill_%';`

### Phase 3: Payout drills (requires creator with balance)
- [ ] PAYOUT-01 — Processor timeout during execute
- [ ] PAYOUT-02 — Idempotent manual retry
- [ ] PAYOUT-03 — Concurrent payout race
- [ ] **Restore** `PROCESSOR_API_URL` if modified

### Phase 4: Reconciliation drills (manual worker invocation, requires checkout session)
- [ ] RECON-01 — Manual reconciler catches stuck session
- [ ] RECON-02 — 24h cutoff enforcement
- [ ] RECON-03 — Duplicate reconciliation safety
- [ ] **Cleanup:** `DELETE FROM checkout_sessions WHERE reference_id LIKE 'checkout_drill_%';`

### Phase 5: Webhook delivery drills (requires endpoint + deliveries)
- [ ] WEBHOOK-01 — Endpoint returns 500 → retry
- [ ] WEBHOOK-02 — 429 throttle minimum delay
- [ ] WEBHOOK-03 — Max attempts exhaustion
- [ ] **Cleanup:** `DELETE FROM webhook_deliveries WHERE payload->>'drill' LIKE 'WEBHOOK-%';`

### Phase 6: Final cleanup
- [ ] Verify no drill artifacts remain: `SELECT count(*) FROM processor_webhook_inbox WHERE event_id LIKE 'evt_drill_%';`
- [ ] Verify staging ledger balances are unchanged (run health check)
- [ ] Document results and any unexpected behaviors

---

## Gap Analysis

Known failure paths **not covered** by this matrix (future work):

| Gap | Reason |
|-----|--------|
| `security-alerts` cron trigger | No cron job currently scheduled for `security-alerts`; RATE-03 depends on manual invocation |
| `reconcile-checkout-ledger` cron | No cron schedule exists for the reconciler; RECON drills require manual invocation; stuck sessions go undetected until an operator runs the worker |
| Bank aggregator feed staleness | No stale-detection mechanism exists; bank feed goes silent without alert |
| Dispute hold RPC failure | Error currently swallowed in `process-processor-inbox` dispute handler; no retry or alert |
| SSRF DNS rebinding timing window | Hard to simulate deterministically; `process-webhooks` validates DNS at delivery time but a fast rebind could theoretically slip through |
| Partial NACHA file upload | `execute-payout` manual rail writes to storage bucket; storage failure mid-write is not tested |
| Cron scheduling conflict | Two crons firing within the same window (e.g., health-checks at 05:00 and reconciler at 05:01) — no contention test |
