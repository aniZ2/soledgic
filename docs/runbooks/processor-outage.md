# Processor Outage Runbook

## When to Use

- Multiple payout or checkout failures with errors containing "timed out" or HTTP 5xx
- ops-monitor reports spikes in `failed_processor_txns` or `failed_payouts`
- Finix status page shows degraded service
- Direct API calls to the processor return errors or hang

---

## Diagnosis

### 1. Check Recent Processor Failures

```sql
SELECT processor_id, processor_type, status, raw_data->>'failure_code' AS failure_code,
       raw_data->>'failure_message' AS failure_message, created_at
FROM processor_transactions
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 30;
```

### 2. Check for Timeout Patterns

```sql
SELECT COUNT(*) AS failures,
       raw_data->>'failure_message' AS message
FROM processor_transactions
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY raw_data->>'failure_message'
ORDER BY failures DESC;
```

### 3. Verify Processor Credentials

```bash
curl -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/merchants/$PROCESSOR_MERCHANT_ID"
```

A successful response confirms credentials are valid and the API is reachable.

### 4. Check Finix Status

Visit the Finix status page or check directly:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/merchants/$PROCESSOR_MERCHANT_ID"
```

### 5. Review Timeout Configuration

The default processor request timeout is controlled by `PROCESSOR_REQUEST_TIMEOUT_MS` (default: 30000ms / 30s). During degraded service, transient timeouts may resolve with retries.

---

## Immediate Actions

### 1. Pause Scheduled Payouts

Disable the `scheduled-payouts` cron to prevent new payout attempts from failing:

```sql
-- Find the cron job
SELECT jobid, schedule, command
FROM cron.job
WHERE command LIKE '%scheduled-payouts%';

-- Disable it
SELECT cron.unschedule(JOB_ID);
```

### 2. Notify Affected Clients

Check which ledgers have been impacted:

```sql
SELECT DISTINCT ledger_id, COUNT(*) AS failed_count
FROM processor_transactions
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ledger_id
ORDER BY failed_count DESC;
```

Notify affected clients that payouts are temporarily paused.

---

## Recovery

### 1. Verify Processor is Back

```bash
curl -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/merchants/$PROCESSOR_MERCHANT_ID"
```

### 2. Re-Enable Scheduled Payouts

```sql
-- Re-schedule the cron job (use the original schedule)
SELECT cron.schedule('scheduled-payouts', '0 */4 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-payouts',
    headers := jsonb_build_object('x-cron-secret', current_setting('app.settings.cron_secret'))
  )$$
);
```

### 3. Retry Failed Payouts

The `execute-payout` endpoint uses `idempotency_id` (format: `payout_<payout_id>`), so retries are safe against duplicates.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "execute",
    "payout_id": "PAYOUT_TX_UUID",
    "rail": "card"
  }'
```

For multiple payouts, use batch execution:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/execute-payout" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "batch_execute",
    "payout_ids": ["UUID_1", "UUID_2", "UUID_3"],
    "rail": "card"
  }'
```

### 4. Process Stuck Inbox Events

Processor webhooks may have arrived during the outage but failed processing:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "dry_run": true}'
```

Review, then execute:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "dry_run": false}'
```

---

## Manual Fallback

If the processor remains down for an extended period:

### 1. Process Through Finix Dashboard

Log into the Finix dashboard and process critical payouts manually.

### 2. Update Transaction Records

```sql
UPDATE transactions
SET status = 'completed',
    metadata = metadata || '{"manual_payout": true, "manual_reference": "EXTERNAL_REF"}'::jsonb
WHERE id = 'PAYOUT_TX_UUID';
```

### 3. Record Processor Transaction for Audit Trail

```sql
INSERT INTO processor_transactions (transaction_id, ledger_id, processor_id, processor_type, amount, status, raw_data)
SELECT id, ledger_id, 'MANUAL_' || id, 'payout', amount, 'succeeded',
       '{"manual": true, "operator": "YOUR_NAME", "external_ref": "EXTERNAL_REF"}'::jsonb
FROM transactions WHERE id = 'PAYOUT_TX_UUID';
```

---

## Post-Recovery

### 1. Run Ops Monitor

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### 2. Verify Failed Payouts Count Drops to Zero

```sql
SELECT COUNT(*)
FROM transactions
WHERE transaction_type = 'payout'
  AND status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours';
```

### 3. Run Health Checks on Affected Ledgers

```bash
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "ledger_id": "LEDGER_UUID"}'
```

### 4. Check for Reconciliation Drift

Any payouts processed manually or retried may have caused balance discrepancies. See [reconciliation-mismatch.md](reconciliation-mismatch.md) section B if drift alerts appear.
