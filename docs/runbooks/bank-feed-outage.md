# Bank Feed Outage Runbook

## When to Use

- `bank_aggregator_connections.status` is `error` or `disconnected`
- `last_sync_at` is older than expected (no new transactions syncing)
- health-check #5 (bank_reconciliation_backlog) fails
- Users report missing bank transactions in their dashboard

---

## Diagnosis

### 1. Check Connection Status

```sql
SELECT id, ledger_id, institution_name, status,
       error_code, error_message, last_sync_at, cursor,
       updated_at
FROM bank_aggregator_connections
WHERE status IN ('error', 'disconnected')
ORDER BY updated_at DESC;
```

### 2. Check Sync Freshness

```sql
SELECT id, ledger_id, institution_name, status, last_sync_at,
       EXTRACT(EPOCH FROM (NOW() - last_sync_at)) / 3600 AS hours_since_sync
FROM bank_aggregator_connections
WHERE status = 'active'
  AND last_sync_at < NOW() - INTERVAL '24 hours'
ORDER BY last_sync_at ASC;
```

### 3. Review Error Details

```sql
SELECT id, institution_name, error_code, error_message, updated_at
FROM bank_aggregator_connections
WHERE error_code IS NOT NULL
ORDER BY updated_at DESC
LIMIT 20;
```

Common error codes:

| Error Code | Meaning | Action |
|------------|---------|--------|
| `ITEM_LOGIN_REQUIRED` | User credentials expired | User must re-authenticate via OAuth |
| `INSTITUTION_DOWN` | Bank API unavailable | Wait and retry; use manual import |
| `RATE_LIMIT` | Too many sync requests | Back off; will auto-resume |
| `INVALID_CREDENTIALS` | Access token revoked | User must re-authenticate via OAuth |

### 4. Check Aggregator Provider Status

If multiple connections from the same institution are failing, the issue may be at the aggregator level. Check the aggregator provider's status page.

---

## Fallback: Manual Bank Statement Import

When automatic sync is unavailable, import transactions manually via CSV or OFX:

### 1. Prepare Import Data

Format bank statement lines as JSON. Each line needs at minimum `transaction_date`, `amount`, and `description`:

```json
{
  "bank_account_id": "BANK_ACCOUNT_UUID",
  "lines": [
    {
      "transaction_date": "2025-01-15",
      "post_date": "2025-01-16",
      "description": "Payment from Client XYZ",
      "amount": 1500.00,
      "reference_number": "REF123",
      "merchant_name": "Client XYZ"
    }
  ],
  "auto_match": true
}
```

### 2. Import via Edge Function

```bash
curl -X POST "$SUPABASE_URL/functions/v1/import-bank-statement" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d @import-data.json
```

Maximum 5000 lines per import. Set `auto_match: true` to automatically attempt matching by amount within a 3-day window.

Note: The `import-bank-statement` function writes to `bank_statement_lines` (the manual import table). For automatic sync, transactions land in `bank_aggregator_transactions` instead.

### 3. Verify Import

```sql
SELECT COUNT(*) AS imported,
       SUM(CASE WHEN match_status = 'matched' THEN 1 ELSE 0 END) AS matched,
       SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched
FROM bank_statement_lines
WHERE bank_account_id = 'BANK_ACCOUNT_UUID'
  AND created_at > NOW() - INTERVAL '1 hour';
```

---

## Reconnection

### 1. User Re-Authentication

The user must re-authenticate their bank connection via the OAuth flow in the dashboard. This cannot be done by an operator — the user must log in and reconnect.

### 2. Verify Reconnection

After re-authentication:

```sql
SELECT id, status, last_sync_at, cursor, error_code
FROM bank_aggregator_connections
WHERE id = 'CONNECTION_UUID';
```

The `status` should return to `active` and `error_code` should be `NULL`.

### 3. Cursor-Based Sync Resumes

The sync uses a cursor stored in `bank_aggregator_connections.cursor`. After reconnection, sync resumes from the last successful position — no duplicate transactions will be imported.

---

## Post-Recovery

### 1. Auto-Match Unmatched Transactions

After sync resumes or manual import completes, run the rule-based auto-matcher on unmatched bank aggregator transactions:

```sql
SELECT bat.id, (auto_match_bank_aggregator_transaction(bat.id)).*
FROM bank_aggregator_transactions bat
WHERE bat.ledger_id = 'LEDGER_UUID'
  AND bat.match_status = 'unmatched'
ORDER BY bat.date;
```

### 2. Check Bank Reconciliation Backlog

```bash
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "ledger_id": "LEDGER_UUID"}'
```

Health-check #5 should pass once the unmatched backlog is cleared.

### 3. Verify No Stale Unmatched Transactions

```sql
-- Bank aggregator transactions (automatic sync)
SELECT COUNT(*)
FROM bank_aggregator_transactions
WHERE ledger_id = 'LEDGER_UUID'
  AND match_status = 'unmatched'
  AND created_at < NOW() - INTERVAL '7 days';

-- Bank statement lines (manual imports)
SELECT COUNT(*)
FROM bank_statement_lines
WHERE ledger_id = 'LEDGER_UUID'
  AND match_status = 'unmatched'
  AND created_at < NOW() - INTERVAL '7 days';
```

If stale unmatched transactions remain, see [reconciliation-mismatch.md](reconciliation-mismatch.md) section C for manual matching procedures.
