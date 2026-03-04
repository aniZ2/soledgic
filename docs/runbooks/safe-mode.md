# Safe Mode Procedures

This runbook documents existing infrastructure for reducing blast radius during incidents. **No code changes are required** — all mechanisms below are already deployed.

---

## When to Use

- Any CRITICAL alert from ops-monitor, health-check, or security-alerts
- Suspected credential compromise (see [security-incident.md](security-incident.md) section F)
- Processor outage with cascading failures
- Need to stop all traffic while investigating

---

## Maintenance Mode

Returns 503 for non-essential API endpoints that use the shared `createHandler` logic. Internal functions with raw `Deno.serve` handlers (`ops-monitor`, `process-webhooks`, `security-alerts`, `process-processor-inbox`) are **not** covered — they continue to run so monitoring and background processing remain operational.

**Enable:**

```bash
supabase secrets set MAINTENANCE_MODE=true
```

Affected endpoints will respond with:

```json
{
  "success": false,
  "error": "System temporarily unavailable for maintenance",
  "retry_after": 300
}
```

**Disable:**

```bash
supabase secrets set MAINTENANCE_MODE=false
```

> Source: `supabase/functions/_shared/utils.ts` — `isMaintenanceMode()`, `maintenanceResponse()`

---

## Allowlist Mode

Restricts API access to a specific set of API keys. All other requests are rejected.

**Enable:**

```bash
supabase secrets set ALLOWLIST_MODE=true
supabase secrets set ALLOWED_API_KEYS=key1,key2,key3
```

Only requests with an `x-api-key` matching one of the allowed keys will be processed.

**Disable:**

```bash
supabase secrets set ALLOWLIST_MODE=false
```

> Source: `supabase/functions/_shared/utils.ts` — `isAllowlistMode()`, `isApiKeyAllowed()`

---

## IP Blocking

Block specific IP addresses from accessing any Edge Function.

**Enable:**

```bash
supabase secrets set BLOCKED_IPS=1.2.3.4,5.6.7.8
```

**Remove blocks:**

```bash
supabase secrets set BLOCKED_IPS=
```

> Source: `supabase/functions/_shared/utils.ts` — `getBlockedIPs()`, `isIpBlocked()`

---

## Pause Scheduled Payouts

Prevents the `scheduled-payouts` cron from triggering new payout runs.

**Disable the cron job:**

```sql
-- Find the job
SELECT jobid, jobname, schedule
FROM cron.job
WHERE jobname = 'scheduled-payouts-daily';

-- Disable it
SELECT cron.unschedule('scheduled-payouts-daily');
```

**Re-enable:**

```sql
SELECT cron.schedule('scheduled-payouts-daily', '0 6 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-payouts',
    headers := jsonb_build_object(
      'x-cron-secret', current_setting('app.settings.cron_secret'),
      'Content-Type', 'application/json'
    )
  )$$
);
```

**Alternative — per-ledger pause via metadata:**

The scheduled payout worker reads `ledger.metadata->payout_settings->schedule`. Setting it to `'manual'` stops automatic payouts for that ledger.

```sql
UPDATE ledgers
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{payout_settings,schedule}',
  '"manual"'
)
WHERE id = 'LEDGER_UUID';
```

> Source: `supabase/functions/scheduled-payouts/index.ts:122`, `supabase/migrations/20260267_scheduled_payouts_cron.sql`

---

## Pause Inbox Processing

Prevents the `process-processor-inbox` cron from processing new webhook events. Events continue to be received and stored — they will be processed when the cron is re-enabled.

**Disable:**

```sql
SELECT jobid, jobname, schedule
FROM cron.job
WHERE jobname = 'process-processor-inbox-minute';

SELECT cron.unschedule('process-processor-inbox-minute');
```

**Re-enable:**

```sql
SELECT cron.schedule('process-processor-inbox-minute', '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-processor-inbox',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
```

> Source: `supabase/migrations/20260293_process_processor_inbox_cron.sql`

---

## Per-Account Payouts Pause (Schema Only)

The `connected_accounts.payouts_paused` column exists in the schema (defaults to `true` for escrow control), but **no runtime code currently checks this flag**. It is a data-level marker, not an enforced safety control.

If you need to block payouts for a specific connected account, use the per-ledger schedule pause above or disable the payout cron entirely.

```sql
-- Check current state
SELECT id, payouts_paused, can_receive_transfers
FROM connected_accounts
WHERE id = 'ACCOUNT_UUID';
```

> Source: `supabase/migrations/20260241_processor_custom_accounts.sql:38` — column exists but no runtime enforcement found

---

## Exiting Safe Mode

After resolving the incident:

1. Reverse all safe mode steps applied (maintenance mode, IP blocks, cron pauses, etc.)
2. Run ops-monitor to verify system health:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

3. Run health-check on affected ledgers:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "ledger_id": "LEDGER_UUID"}'
```

4. Run security-alerts to confirm no ongoing threats:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/security-alerts" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json"
```

5. Monitor for 30 minutes before declaring all-clear
