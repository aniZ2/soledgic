# Reconciliation Mismatch Runbook

## When to Use

- ops-monitor reports `unreconciled_checkouts` above threshold
- health-check fails on #1 (ledger_balance), #3 (transaction_balance), #4 (processor_balance_sync), #7 (negative_balances), or #10 (creator_balance_integrity)
- `drift_alerts` table has unacknowledged rows
- Bank transactions remain `unmatched` for more than 7 days

---

## A. Checkout Stuck in `charged_pending_ledger`

A checkout session has been charged at the processor but the ledger sale was not recorded. The `reconcile-checkout-ledger` cron retries these automatically within 24 hours.

### 1. Identify Stuck Sessions

```sql
SELECT id, ledger_id, amount, payment_id, reference_id, status, updated_at,
       EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 AS hours_stuck
FROM checkout_sessions
WHERE status = 'charged_pending_ledger'
ORDER BY updated_at ASC;
```

### 2. Check Auto-Recovery Status

Sessions under 24 hours old are retried by the `reconcile-checkout-ledger` cron. Verify it has been processing recently by checking for sessions that moved out of `charged_pending_ledger`:

```sql
-- Recently reconciled sessions (completed by the cron)
SELECT id, ledger_id, amount, status, completed_at
FROM checkout_sessions
WHERE status = 'completed'
  AND completed_at > NOW() - INTERVAL '1 hour'
ORDER BY completed_at DESC
LIMIT 10;

-- Or check cron execution via audit log
SELECT id, action, created_at, request_body
FROM audit_log
WHERE action = 'reconcile_checkout'
ORDER BY created_at DESC
LIMIT 5;
```

### 3. Manual Recovery (Dry Run First)

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-checkout-ledger" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "dry_run": true}'
```

Review the dry-run output, then execute:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reconcile-checkout-ledger" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "dry_run": false}'
```

### 4. Sessions Older Than 24 Hours

The cron skips sessions older than 24 hours. Manual investigation is required:

1. Verify the charge exists at the processor:

```bash
curl -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/transfers/PAYMENT_ID"
```

2. If the charge succeeded, check why `record_sale_atomic()` failed:

```sql
SELECT id, ledger_id, amount, creator_amount, platform_amount, creator_id, metadata
FROM checkout_sessions
WHERE id = 'SESSION_UUID';
```

3. Verify no duplicate sale already exists:

```sql
SELECT id, reference_id, amount, status
FROM transactions
WHERE reference_id = 'SESSION_REFERENCE_ID'
  AND transaction_type = 'sale';
```

4. If no sale exists and the charge is confirmed, call `record_sale_atomic()` directly via SQL or investigate the failure in Edge Function logs.

### 5. Post-Recovery

```sql
-- Verify sale transaction exists
SELECT id, amount, status, created_at
FROM transactions
WHERE reference_id = 'SESSION_REFERENCE_ID'
  AND transaction_type = 'sale';

-- Verify checkout session is completed
SELECT id, status, completed_at
FROM checkout_sessions
WHERE id = 'SESSION_UUID';

-- Verify webhook was queued
SELECT id, event_type, status
FROM webhook_deliveries
WHERE payload->>'reference_id' = 'SESSION_REFERENCE_ID'
ORDER BY created_at DESC
LIMIT 5;
```

---

## B. Processor-to-Ledger Drift

The processor reports a different balance than the internal ledger. Drift alerts are created by the reconciliation system and surfaced by health-check #4.

### 1. Find Unacknowledged Drift Alerts

```sql
SELECT id, ledger_id, expected_balance, actual_balance,
       drift_amount, drift_percent, severity, created_at
FROM drift_alerts
WHERE acknowledged_at IS NULL
ORDER BY severity DESC, created_at DESC;
```

### 2. Compare Balances

```sql
-- Latest processor snapshot
SELECT ledger_id, snapshot_at, available, pending
FROM processor_balance_snapshots
WHERE ledger_id = 'LEDGER_UUID'
ORDER BY snapshot_at DESC
LIMIT 1;

-- Internal ledger cash balance (sum of entries on cash account)
SELECT a.id, a.name, a.balance
FROM accounts a
WHERE a.ledger_id = 'LEDGER_UUID'
  AND a.account_type = 'cash';
```

### 3. Run Health Check

```bash
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "ledger_id": "LEDGER_UUID"}'
```

### 4. Identify Missing Events

Drift is often caused by processor events that were not ingested. Check the inbox:

```sql
SELECT id, event_type, resource_id, status, processing_error, received_at
FROM processor_webhook_inbox
WHERE ledger_id = 'LEDGER_UUID'
  AND status IN ('pending', 'failed')
ORDER BY received_at DESC;
```

If events are stuck, replay them:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-processor-inbox" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "dry_run": true}'
```

### 5. Acknowledge the Alert

After resolving the drift:

```sql
UPDATE drift_alerts
SET acknowledged_at = NOW(),
    acknowledged_by = 'YOUR_NAME',
    resolution_notes = 'Replayed 3 stuck inbox events, drift resolved'
WHERE id = 'ALERT_UUID';
```

### 6. Post-Recovery

Re-run health check and verify drift is gone:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "ledger_id": "LEDGER_UUID"}'
```

```sql
-- Confirm no unacknowledged drift remains
SELECT COUNT(*) FROM drift_alerts
WHERE ledger_id = 'LEDGER_UUID'
  AND acknowledged_at IS NULL;
```

---

## C. Bank-to-Ledger Unmatched Transactions

Bank aggregator transactions that cannot be automatically matched to ledger entries. Surfaced by health-check #5 (`bank_reconciliation_backlog`), which queries `bank_aggregator_transactions` where `match_status = 'unmatched'` and older than 7 days.

### 1. Find Stale Unmatched Transactions

```sql
SELECT id, ledger_id, connection_id, amount, date,
       name, merchant_name, match_status, created_at
FROM bank_aggregator_transactions
WHERE match_status = 'unmatched'
  AND created_at < NOW() - INTERVAL '7 days'
ORDER BY date DESC;
```

### 2. Attempt Auto-Match

Run the rule-based auto-matcher on individual unmatched transactions. Rules are defined in `auto_match_rules` per ledger.

```sql
-- Match a single transaction
SELECT * FROM auto_match_bank_aggregator_transaction('BANK_AGGREGATOR_TXN_UUID');
```

To batch-match all unmatched transactions for a ledger:

```sql
SELECT bat.id, (auto_match_bank_aggregator_transaction(bat.id)).*
FROM bank_aggregator_transactions bat
WHERE bat.ledger_id = 'LEDGER_UUID'
  AND bat.match_status = 'unmatched'
ORDER BY bat.date;
```

Matching strategies (configured via `auto_match_rules`):
- `match_by_amount`: same amount on same day, confidence 0.85
- `match_by_reference`: reference ID exact match
- Custom rules with merchant name, category, and amount conditions

### 3. Manual Match

For remaining unmatched transactions, find a candidate ledger transaction:

```sql
-- Find ledger transactions near the bank aggregator transaction amount and date
SELECT t.id, t.transaction_type, t.reference_id, t.amount, t.created_at
FROM transactions t
WHERE t.ledger_id = 'LEDGER_UUID'
  AND t.amount = ABS(BANK_AGG_TX_AMOUNT)
  AND t.created_at BETWEEN 'BANK_AGG_TX_DATE'::date - INTERVAL '3 days'
                        AND 'BANK_AGG_TX_DATE'::date + INTERVAL '3 days'
ORDER BY t.created_at DESC;
```

Then match them directly:

```sql
UPDATE bank_aggregator_transactions
SET matched_transaction_id = 'LEDGER_TX_UUID',
    match_status = 'matched',
    match_confidence = 1.00
WHERE id = 'BANK_AGGREGATOR_TXN_UUID';
```

### 4. Escalation

If the amount or date does not align with any ledger entry:

- The bank transaction may represent an event not yet recorded in the ledger (missing sale, unprocessed refund)
- Check processor for the original charge/transfer matching the bank transaction description
- If a ledger entry is genuinely missing, it may require manual adjustment via the `adjustment` transaction type

### 5. Post-Recovery

```sql
-- Verify no stale unmatched transactions remain
SELECT COUNT(*)
FROM bank_aggregator_transactions
WHERE ledger_id = 'LEDGER_UUID'
  AND match_status = 'unmatched'
  AND created_at < NOW() - INTERVAL '7 days';
```

Run ops-monitor to confirm overall health:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```
