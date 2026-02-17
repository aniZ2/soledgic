# Atomic Money Operations Runbook

All money-moving operations in Soledgic use atomic PostgreSQL functions to prevent race conditions. This document explains the pattern, lists which operations are protected, and describes operational monitoring.

## Pattern: Lock-Check-Insert

Every financial mutation follows the same structure inside a single PostgreSQL transaction:

```
1. SELECT ... FOR UPDATE   -- Lock the relevant row (serializes concurrent requests)
2. Calculate current state  -- Sum balances, check limits (consistent read under lock)
3. Guard check              -- Reject if invariant would be violated
4. INSERT transaction       -- Create the financial record
5. INSERT entries           -- Create the double-entry ledger entries
6. RETURN result            -- Created, blocked, or duplicate
```

The `FOR UPDATE` lock is the key. Any concurrent request targeting the same row will block at step 1 until the first transaction commits or rolls back. This eliminates TOCTOU (time-of-check-to-time-of-use) race conditions.

## Protected Operations

| Operation | RPC Function | Lock Target | What It Prevents |
|---|---|---|---|
| Record sale | `record_sale_atomic` | Creator account row | Duplicate sales for same reference_id |
| Process payout | `process_payout_atomic` | Creator account row | Double-payout / overdraw of creator balance |
| Process refund | `process_stripe_refund` | Original transaction row | Double-refund / over-refund of a charge |
| Send invoice | `send_invoice_atomic` | Invoice row | Duplicate invoice sends |
| Record invoice payment | `record_invoice_payment_atomic` | Invoice row | Double-payment of an invoice |
| Void invoice | `void_invoice_atomic` | Invoice row | Double-void of an invoice |
| Record bill payment | `record_bill_payment_atomic` | Bill row | Double-payment of a bill |

## Edge Function to RPC Mapping

| Edge Function | Calls RPC | Fallback on unique_violation |
|---|---|---|
| `record-sale/index.ts` | `record_sale_atomic` | Returns existing transaction (idempotent) |
| `process-payout/index.ts` | `process_payout_atomic` | Returns existing transaction (idempotent) |
| `processor-webhook/index.ts` (handleChargeRefunded) | `process_stripe_refund` | Returns existing transaction (idempotent) |

## Defense Layers (Refund Example)

Each atomic operation has multiple defense layers:

1. **Fast-path idempotency check** (edge function) -- Quick lookup by reference_id before calling RPC
2. **FOR UPDATE row lock** (inside RPC) -- Serializes concurrent handlers
3. **Sum-and-guard check** (inside RPC) -- Rejects if invariant would be violated
4. **UNIQUE constraint on `(ledger_id, reference_id)`** -- DB-level last resort
5. **`EXCEPTION WHEN unique_violation`** (inside RPC) -- Graceful idempotent fallback

## Adding a New Atomic Operation

1. Create a migration with `CREATE OR REPLACE FUNCTION your_operation_atomic(...)` that:
   - Accepts all parameters needed (ledger_id, reference_id, amounts, metadata)
   - Locks the relevant row with `SELECT ... FOR UPDATE`
   - Performs all checks under the lock
   - Inserts transaction + entries
   - Handles `unique_violation` in `EXCEPTION` block
   - Returns JSONB with `status` field (`created`, `blocked`, `duplicate`, `error`)
2. Update the edge function to call `supabase.rpc('your_operation_atomic', {...})`
3. Add race condition event logging for `blocked` and `duplicate` returns
4. Add a test case to `supabase/tests/test_concurrent_payouts.sql` (or create a new test file)

## Operational Monitoring

### race_condition_events Table

Every time an RPC deflects a concurrent or duplicate request, the edge function logs it:

```sql
SELECT event_type, COUNT(*), MAX(created_at) AS last_seen
FROM race_condition_events
GROUP BY event_type
ORDER BY COUNT(*) DESC;
```

Event types:
- `payout_duplicate` -- process_payout_atomic returned `duplicate`
- `refund_duplicate_fast_path` -- Fast-path check caught a duplicate refund
- `refund_duplicate_rpc` -- process_stripe_refund returned `duplicate`
- `refund_over_limit` -- process_stripe_refund blocked an over-refund

### Invariant Checks

Run the combined invariant checker:

```sql
SELECT * FROM run_money_invariants();           -- All ledgers
SELECT * FROM run_money_invariants('ledger-uuid'); -- Specific ledger
```

This checks:
- **No negative balances** -- No creator's available balance (entries minus holds) is below zero
- **No duplicate references** -- No two transactions in the same ledger share a reference_id
- **Double-entry balance** -- Every transaction's debits equal its credits

Individual checks:
```sql
SELECT * FROM check_balance_invariants();
SELECT * FROM check_no_duplicate_references();
SELECT * FROM check_double_entry_balance();
```

### Running the Payout Test

```sql
SELECT * FROM test_concurrent_payouts();
```

Tests: payout succeeds, insufficient balance blocked, exact drain to zero, duplicate idempotent, no negative balances, final balance is zero.

## Incident Response

If `check_balance_invariants()` reports a negative balance:

1. Identify the affected creator and ledger from the `details` array
2. Check `race_condition_events` for recent entries on that ledger
3. Look at the creator's transaction history: `SELECT * FROM transactions WHERE ledger_id = ? AND metadata->>'creator_id' = ? ORDER BY created_at`
4. Check for overlapping payouts (same time window, different reference_ids)
5. If the race condition protection was bypassed, the root cause is likely an operation that doesn't go through an atomic RPC -- audit the code path
