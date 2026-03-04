# Webhook Backlog Runbook

## When to Use

- ops-monitor `stuck_inbox_rows` alert fires (20+ pending rows older than 1 hour)
- Processor webhook inbox queue depth is rising — new events arriving faster than processing
- Oldest pending event in `processor_webhook_inbox` is older than 5 minutes
- `process-processor-inbox` cron appears to be running but not keeping up

---

## First 5 Minutes

1. Confirm alert in ops-monitor output or query inbox directly
2. Check inbox growth rate — is the backlog growing or stable?

```sql
SELECT COUNT(*) AS pending,
       MIN(received_at) AS oldest_pending,
       EXTRACT(EPOCH FROM (NOW() - MIN(received_at))) / 60 AS oldest_minutes
FROM processor_webhook_inbox
WHERE status = 'pending';
```

3. Identify which event types are piling up:

```sql
SELECT event_type, COUNT(*) AS count
FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed')
GROUP BY event_type
ORDER BY count DESC;
```

4. Assess blast radius — which ledgers are affected:

```sql
SELECT ledger_id, COUNT(*) AS stuck_count
FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed')
GROUP BY ledger_id
ORDER BY stuck_count DESC;
```

5. If CRITICAL (20+ stuck rows, growing), consider engaging [safe mode](safe-mode.md)

---

## Diagnosis

### 1. Count Pending vs Failed

```sql
SELECT status, COUNT(*) AS count,
       MIN(received_at) AS oldest,
       MAX(received_at) AS newest
FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed')
GROUP BY status;
```

### 2. Check for Processing Errors

```sql
SELECT id, event_type, status, processing_error, received_at, processed_at
FROM processor_webhook_inbox
WHERE status = 'failed'
ORDER BY received_at DESC
LIMIT 20;
```

### 3. Verify Cron Is Running

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'process-processor-inbox-minute';
```

Check recent cron executions:

```sql
SELECT jobid, runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-processor-inbox-minute')
ORDER BY start_time DESC
LIMIT 10;
```

### 4. Check if Processor Is Responding

If events are failing due to processor API errors during enrichment:

```bash
curl -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/merchants/$PROCESSOR_MERCHANT_ID"
```

---

## Recovery

### 1. Increase Processing Batch Size

Run a manual batch with a higher limit:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "dry_run": true}'
```

Review the dry-run output, then execute:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "dry_run": false}'
```

### 2. Reset Failed Rows for Reprocessing

```sql
UPDATE processor_webhook_inbox
SET status = 'pending',
    processing_error = NULL,
    processed_at = NULL,
    claimed_at = NULL
WHERE status = 'failed'
  AND received_at > NOW() - INTERVAL '24 hours';
```

### 3. Verify No Duplicates Were Created

After processing, check that no duplicate transactions were created:

```sql
SELECT reference_id, COUNT(*) AS dupes
FROM transactions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY reference_id
HAVING COUNT(*) > 1;
```

### 4. Repeat Until Queue Is Drained

Continue running manual batches until the queue is empty:

```sql
SELECT COUNT(*) FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed');
```

---

## Do NOT

- **Do NOT delete rows** from `processor_webhook_inbox` — they are the audit trail of received events
- **Do NOT run with `dry_run: false`** before reviewing `dry_run: true` output — you need to verify which events will be processed and catch any anomalies
- **Do NOT disable the cron** unless you are actively draining the queue manually — disabling stops all processing and the backlog will grow
- **Do NOT increase the limit above 200** without monitoring — large batches can cause timeouts in the Edge Function

---

## Post-Recovery

1. Verify queue depth returns to 0:

```sql
SELECT COUNT(*) FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed');
```

2. Run ops-monitor to confirm health:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

3. Check that affected ledgers have correct balances:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "ledger_id": "LEDGER_UUID"}'
```

4. If the backlog was caused by a burst of processor events, consider whether the cron frequency (every minute) is sufficient or if a temporary increase is needed
