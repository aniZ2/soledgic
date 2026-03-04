# Webhook Replay Runbook

## When to Use

- Outbound webhook deliveries failed and customer endpoint is now available
- Processor webhook events were stuck in `processor_webhook_inbox`
- Events need reprocessing after a bug fix

## First 5 Minutes

1. Confirm alert in ops-monitor output (`failed_webhooks_24h` or `stuck_inbox_rows`)
2. Determine which type of webhook failure — outbound (customer) or inbound (processor inbox):

```sql
-- Outbound failures
SELECT COUNT(*) AS failed_outbound FROM webhook_deliveries
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours';

-- Inbound stuck
SELECT COUNT(*) AS stuck_inbox FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed') AND received_at < NOW() - INTERVAL '1 hour';
```

3. Identify affected ledger(s):

```sql
SELECT DISTINCT ledger_id, COUNT(*) AS stuck_count
FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed')
GROUP BY ledger_id
ORDER BY stuck_count DESC;
```

4. If CRITICAL, engage [safe mode](safe-mode.md)

---

## Outbound Webhook Replay (Customer Webhooks)

### 1. Identify Failed Deliveries

```sql
SELECT wd.id, wd.event_type, wd.status, wd.attempt_count, wd.created_at,
       we.url, wd.response_status
FROM webhook_deliveries wd
JOIN webhook_endpoints we ON we.id = wd.endpoint_id
WHERE wd.status = 'failed'
  AND wd.created_at > NOW() - INTERVAL '7 days'
ORDER BY wd.created_at DESC;
```

### 2. Reset Failed Deliveries for Retry

```sql
UPDATE webhook_deliveries
SET status = 'pending',
    attempt_count = 0,
    next_retry_at = NOW()
WHERE id IN ('delivery-uuid-1', 'delivery-uuid-2')
  AND status = 'failed';
```

### 3. Trigger Webhook Delivery Worker

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-webhooks" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

## Processor Webhook Inbox Replay

### 1. Check Stuck Inbox Rows

```sql
SELECT id, event_type, status, error, created_at, processed_at
FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed')
ORDER BY created_at DESC
LIMIT 50;
```

### 2. Reset Failed Rows for Reprocessing

```sql
UPDATE processor_webhook_inbox
SET status = 'pending',
    error = NULL,
    processed_at = NULL,
    claimed_at = NULL
WHERE id IN ('row-uuid-1', 'row-uuid-2')
  AND status = 'failed';
```

### 3. Trigger Inbox Processing

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 25, "dry_run": false}'
```

### 4. Verify Results

```sql
SELECT status, COUNT(*) as count
FROM processor_webhook_inbox
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

## Dry Run First

Always run with `"dry_run": true` first to verify which events will be processed:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 25, "dry_run": true}'
```

## Post-Replay Verification

1. Check that expected outbound webhooks were queued
2. Verify customer endpoints received the events
3. Confirm no duplicate transactions were created
4. Run ops-monitor to validate pipeline health

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```
