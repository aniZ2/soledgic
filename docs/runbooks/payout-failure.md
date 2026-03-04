# Payout Failure Handling Runbook

## When to Use

- A payout failed at the processor level
- `payout.failed` webhook was emitted
- Creator reports missing payout

## First 5 Minutes

1. Confirm alert in ops-monitor output (`failed_payouts_24h`)
2. Identify affected ledger(s):

```sql
SELECT DISTINCT ledger_id, COUNT(*) AS failed_count
FROM transactions
WHERE transaction_type = 'payout' AND status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ledger_id
ORDER BY failed_count DESC;
```

3. Assess blast radius — how many creators are affected:

```sql
SELECT COUNT(DISTINCT creator_id) AS affected_creators
FROM transactions
WHERE transaction_type = 'payout' AND status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours';
```

4. If CRITICAL (5+ failures), consider pausing scheduled payouts and engaging [safe mode](safe-mode.md)

---

## Diagnosis

### 1. Find the Failed Payout

```sql
SELECT t.id, t.reference_id, t.amount, t.status, t.metadata, t.created_at,
       pt.processor_id, pt.status as processor_status, pt.raw_data
FROM transactions t
LEFT JOIN processor_transactions pt ON pt.transaction_id = t.id
WHERE t.type = 'payout'
  AND t.status = 'failed'
ORDER BY t.created_at DESC
LIMIT 20;
```

### 2. Check Processor Transaction Details

```sql
SELECT processor_id, status, raw_data, created_at
FROM processor_transactions
WHERE transaction_id = 'PAYOUT_TX_UUID'
ORDER BY created_at DESC;
```

### 3. Check Finix Transfer Status Directly

```bash
curl -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/transfers/FINIX_TRANSFER_ID"
```

## Common Failure Reasons

| Reason | Action |
|--------|--------|
| `INSUFFICIENT_FUNDS` | Check platform funding source balance |
| `INVALID_INSTRUMENT` | Creator's payment instrument is expired/invalid. Contact creator. |
| `PROCESSOR_DECLINED` | Retry after investigating. May be temporary. |
| `DUMMY_V1 in production` | `PROCESSOR_NAME` env var not set. Fix and redeploy. |

## Recovery

### Retry a Failed Payout

1. Fix the underlying issue (credentials, instrument, balance)
2. Execute the payout again:

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

### Manual Payout (Outside Soledgic)

If the processor integration is down:

1. Process payout manually through Finix dashboard or bank transfer
2. Update the transaction record:

```sql
UPDATE transactions
SET status = 'completed',
    metadata = metadata || '{"manual_payout": true, "manual_reference": "EXTERNAL_REF"}'::jsonb,
    updated_at = NOW()
WHERE id = 'PAYOUT_TX_UUID';
```

3. Record a processor transaction for audit trail:

```sql
INSERT INTO processor_transactions (transaction_id, ledger_id, processor_id, status, raw_data)
SELECT id, ledger_id, 'MANUAL_' || id, 'succeeded',
       '{"manual": true, "operator": "your_name", "external_ref": "EXTERNAL_REF"}'::jsonb
FROM transactions WHERE id = 'PAYOUT_TX_UUID';
```

## Post-Recovery

1. Verify creator balance is correct
2. Run health check on the ledger
3. Confirm `payout.executed` webhook is delivered to customer
