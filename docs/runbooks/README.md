# Operational Runbooks

Single entry point for on-call engineers. Find the alert, follow the runbook.

---

## Alert-to-Runbook Index

### ops-monitor Checks

| Check | Threshold | Severity | Auto-Mitigation | Runbook |
|-------|-----------|----------|------------------|---------|
| `failed_payouts_24h` | 5+ in 24h | CRITICAL | Pause scheduled-payouts cron | [payout-failure.md](payout-failure.md) |
| `failed_webhooks_24h` | 10+ in 24h | CRITICAL | None — manual replay required | [webhook-replay.md](webhook-replay.md) |
| `stuck_inbox_rows` | 20+ pending >1h | CRITICAL | None — cron retries every minute | [webhook-replay.md](webhook-replay.md), [webhook-backlog.md](webhook-backlog.md) |
| `unreconciled_checkouts` | 10+ >4h old | CRITICAL | `reconcile-checkout-ledger` cron retries <24h sessions | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| `failed_processor_transactions_24h` | 5+ in 24h | CRITICAL | None — investigate processor status | [processor-outage.md](processor-outage.md) |
| `webhook_auth_failures_24h` | 10+ in 24h | CRITICAL | None — may indicate signing key mismatch or forgery | [security-incident.md](security-incident.md) |
| `inbox_depth` | 100+ pending (warn), 500+ (crit) | WARNING/CRITICAL | Cron retries every minute | [webhook-backlog.md](webhook-backlog.md) |
| `inbox_oldest_pending_seconds` | 300s+ (warn), 3600s+ (crit) | WARNING/CRITICAL | None — investigate stuck processor | [webhook-backlog.md](webhook-backlog.md) |
| `inbox_processing_rate_1h` | Informational | OK | N/A — trend metric only | [webhook-backlog.md](webhook-backlog.md) |
| `lock_waits` | 3+ (warn), 10+ (crit) | WARNING/CRITICAL | None — investigate long-running queries | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| `deadlocks_cumulative` | Informational | OK | N/A — cumulative counter, trend via ops_monitor_runs | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| `payout_failure_rate_24h` | 5%+ (warn), 25%+ (crit) | WARNING/CRITICAL | None — investigate processor status and payout pipeline | [payout-failure.md](payout-failure.md) |

### health-check Results

| # | Check | Severity | Auto-Mitigation | Runbook |
|---|-------|----------|------------------|---------|
| 1 | `ledger_balance` | CRITICAL | None — manual investigation required | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| 2 | `orphaned_entries` | CRITICAL | None — manual investigation required | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| 3 | `transaction_balance` | CRITICAL | None — manual investigation required | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| 4 | `processor_balance_sync` | CRITICAL (>=$1000 drift) | None — replay stuck inbox events | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| 5 | `bank_reconciliation_backlog` | WARNING (1-9) / CRITICAL (10+) | Auto-match rules run on sync | [bank-feed-outage.md](bank-feed-outage.md) |
| 6 | `processor_reconciliation_backlog` | WARNING (1-4) / CRITICAL (5+) | None — replay stuck inbox events | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| 7 | `negative_balances` | WARNING | None — review account entries | [reconciliation-mismatch.md](reconciliation-mismatch.md) |
| 8 | `webhook_delivery_health` | WARNING (1-4) / CRITICAL (5+) | Retry via `process-webhooks` (manual invoke with `x-cron-secret`) | [webhook-replay.md](webhook-replay.md) |
| 9 | `pending_payouts` | WARNING (1-2) / CRITICAL (3+) | None — investigate payout pipeline | [payout-failure.md](payout-failure.md) |
| 10 | `creator_balance_integrity` | CRITICAL | None — manual investigation required | [reconciliation-mismatch.md](reconciliation-mismatch.md) |

### security-alerts Types

These are the exact alert type strings emitted by the `security-alerts` Edge Function:

| Alert Type (emitted value) | Severity | Runbook Section |
|----------------------------|----------|-----------------|
| `High Rate Limit Activity` | warning/critical | [security-incident.md](security-incident.md) §A |
| `Distributed Attack Detected` | critical | [security-incident.md](security-incident.md) §A |
| `Pre-Auth Rate Limit Storm` | warning/critical | [security-incident.md](security-incident.md) §A |
| `Persistent Rate Limit Offenders` | warning | [security-incident.md](security-incident.md) §A |
| `High Authentication Failures` | warning/critical | [security-incident.md](security-incident.md) §B |
| `SSRF Attempts Detected` | critical | [security-incident.md](security-incident.md) §C |
| `Multiple High-Risk Events` | warning/critical | [security-incident.md](security-incident.md) §C |
| `High Error Rate` | warning | [security-incident.md](security-incident.md) §E |
| `Redis Failover Active` | warning | [security-incident.md](security-incident.md) §E |
| `High Geo-Blocked Traffic` | warning | [security-incident.md](security-incident.md) §A |

### drift_alerts

| Severity | Runbook |
|----------|---------|
| Any (`info`, `warning`, `critical`) | [reconciliation-mismatch.md](reconciliation-mismatch.md) |

---

## All Runbooks

| Runbook | Covers |
|---------|--------|
| [payout-failure.md](payout-failure.md) | Failed payouts, manual fallback, retry |
| [webhook-replay.md](webhook-replay.md) | Outbound webhook replay, inbox reprocessing |
| [reconciliation-mismatch.md](reconciliation-mismatch.md) | Stuck checkouts, processor drift, bank matching |
| [processor-outage.md](processor-outage.md) | Finix outage, pause/resume, manual fallback |
| [bank-feed-outage.md](bank-feed-outage.md) | Bank sync failures, manual import, reconnection |
| [security-incident.md](security-incident.md) | DDoS, credential stuffing, SSRF, audit chain, webhook forgery, credential leak |
| [webhook-backlog.md](webhook-backlog.md) | Processor inbox queue growth, stuck events, processing capacity |
| [safe-mode.md](safe-mode.md) | Maintenance mode, allowlist mode, IP blocking, cron pause |
| [env-validation.md](env-validation.md) | Environment variable checks |
| [finix-setup.md](finix-setup.md) | Finix integration setup |
| [secret-rotation.md](secret-rotation.md) | Secret rotation procedures |

---

## Quick Reference

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (full access) |
| `SUPABASE_ANON_KEY` | Anon key (RLS-restricted) |
| `PROCESSOR_USERNAME` | Finix API username |
| `PROCESSOR_PASSWORD` | Finix API password |
| `PROCESSOR_BASE_URL` | Finix API base URL |
| `PROCESSOR_MERCHANT_ID` | Finix merchant ID |
| `PROCESSOR_WEBHOOK_SIGNING_KEY` | Finix HMAC webhook signing key |
| `PROCESSOR_REQUEST_TIMEOUT_MS` | API timeout (default: 30000) |
| `CRON_SECRET` | Cron job authentication secret |

### Edge Function Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /functions/v1/ops-monitor` | Service Role Key | Run operational health checks |
| `POST /functions/v1/health-check` | API Key | Run ledger health checks |
| `POST /functions/v1/security-alerts` | Cron Secret | Run security alert checks |
| `POST /functions/v1/reconcile-checkout-ledger` | Service Role Key | Retry stuck checkout→sale |
| `POST /functions/v1/process-processor-inbox` | Service Role Key | Process pending processor webhooks |
| `POST /functions/v1/execute-payout` | API Key | Execute payout(s) |
| `POST /functions/v1/scheduled-payouts` | Cron Secret | Trigger scheduled payout run |
| `POST /functions/v1/process-webhooks` | Cron Secret | Deliver pending outbound webhooks |
| `POST /functions/v1/import-bank-statement` | API Key | Manual bank statement import |

### Useful SQL Queries

**System health at a glance:**

```sql
-- Failed payouts (24h)
SELECT COUNT(*) FROM transactions
WHERE transaction_type = 'payout' AND status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Stuck checkouts
SELECT COUNT(*) FROM checkout_sessions
WHERE status = 'charged_pending_ledger'
  AND updated_at < NOW() - INTERVAL '4 hours';

-- Stuck processor inbox
SELECT COUNT(*) FROM processor_webhook_inbox
WHERE status IN ('pending', 'failed')
  AND received_at < NOW() - INTERVAL '1 hour';

-- Unacknowledged drift
SELECT COUNT(*) FROM drift_alerts
WHERE acknowledged_at IS NULL;

-- Failed outbound webhooks (24h)
SELECT COUNT(*) FROM webhook_deliveries
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Unmatched bank aggregator transactions (>7d)
SELECT COUNT(*) FROM bank_aggregator_transactions
WHERE match_status = 'unmatched'
  AND created_at < NOW() - INTERVAL '7 days';
```

**Audit integrity check:**

```sql
SELECT verify_audit_chain(1, 100000);
SELECT * FROM detect_audit_gaps(1);
```
