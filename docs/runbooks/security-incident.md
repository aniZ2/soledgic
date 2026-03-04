# Security Incident Runbook

## When to Use

- `security-alerts` Edge Function fires a warning or critical alert
- ops-monitor reports `webhook_auth_failures` above threshold
- Suspicious patterns in `audit_log` (unusual IPs, high risk scores, credential stuffing)
- Audit chain integrity check fails

---

## First 5 Minutes

1. Confirm alert source — security-alerts function, ops-monitor (`webhook_auth_failures`), or audit_log anomaly
2. Identify the alert type and severity from security-alerts output
3. Assess blast radius — which IPs, how many requests, which endpoints targeted:

```sql
SELECT action, COUNT(*) AS count, COUNT(DISTINCT ip_address) AS unique_ips
FROM audit_log
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND action IN ('rate_limit_hit', 'auth_failure', 'ssrf_attempt', 'webhook_invalid_signature', 'blocked_country')
GROUP BY action
ORDER BY count DESC;
```

4. If CRITICAL (SSRF, distributed attack, credential compromise), engage [safe mode](safe-mode.md) immediately

---

## Severity and Escalation

| Severity | Action |
|----------|--------|
| `info` | Log only, review during next business day |
| `warning` | Email notification to on-call, investigate within 4 hours |
| `critical` | Page on-call immediately, investigate within 30 minutes |

---

## A. Rate Limit Storm / DDoS

**Trigger**: `High Rate Limit Activity`, `Distributed Attack Detected`, `Pre-Auth Rate Limit Storm`, `Persistent Rate Limit Offenders`, or `High Geo-Blocked Traffic` alert from security-alerts (thresholds: 100+ rate limit hits/hour, 20+ unique IPs rate limited).

### 1. Identify the Attack Pattern

```sql
SELECT ip_address, COUNT(*) AS hits, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
FROM audit_log
WHERE action = 'rate_limit_hit'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
ORDER BY hits DESC
LIMIT 30;
```

### 2. Check if Distributed

```sql
SELECT COUNT(DISTINCT ip_address) AS unique_ips
FROM audit_log
WHERE action = 'rate_limit_hit'
  AND created_at > NOW() - INTERVAL '1 hour';
```

If 20+ unique IPs, this is a distributed attack.

### 3. Immediate Response

- **Upstash**: Review rate limit configuration in Upstash console. Consider temporarily lowering limits.
- **Cloudflare**: Enable Under Attack mode if traffic is overwhelming.
- **Block specific IPs**: If the attack is concentrated, block IPs at the CDN/WAF level.

### 4. Post-Incident

Review whether legitimate traffic was affected. Restore normal rate limits once the attack subsides.

---

## B. Auth Failure Spike

**Trigger**: `High Authentication Failures` alert from security-alerts (threshold: 50+ failures/hour).

### 1. Identify the Source

```sql
SELECT ip_address, COUNT(*) AS failures,
       array_agg(DISTINCT entity_id) AS targeted_entities
FROM audit_log
WHERE action = 'auth_failure'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
ORDER BY failures DESC
LIMIT 20;
```

### 2. Check for Credential Stuffing

Signs of credential stuffing:
- Single IP targeting many different accounts
- Rapid-fire attempts (multiple per second)
- Attempts from known bad IP ranges

```sql
SELECT ip_address, COUNT(DISTINCT entity_id) AS unique_targets, COUNT(*) AS total_attempts
FROM audit_log
WHERE action = 'auth_failure'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(DISTINCT entity_id) > 5
ORDER BY unique_targets DESC;
```

### 3. Immediate Response

- Block the offending IPs at the WAF/CDN level
- If accounts were compromised, force password resets
- Review successful logins from the same IPs:

```sql
SELECT ip_address, entity_id, action, created_at
FROM audit_log
WHERE ip_address IN ('SUSPICIOUS_IP_1', 'SUSPICIOUS_IP_2')
  AND action IN ('auth_success', 'auth_failure')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## C. SSRF Attempt

**Trigger**: `SSRF Attempts Detected` or `Multiple High-Risk Events` alert from security-alerts (any SSRF occurrence is critical).

### 1. Identify the Attempt

```sql
SELECT id, ip_address, action, entity_type, entity_id,
       request_body, risk_score, created_at
FROM audit_log
WHERE risk_score >= 95
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### 2. Immediate Response

- **Block the IP immediately** at the WAF/CDN level
- Review what endpoints were targeted
- Check if any internal services were accessed

### 3. Impact Assessment

```sql
-- Check if the IP made any successful requests
SELECT action, entity_type, response_status, COUNT(*)
FROM audit_log
WHERE ip_address = 'ATTACKER_IP'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY action, entity_type, response_status
ORDER BY COUNT(*) DESC;
```

If the attacker made successful requests, escalate to a full security review.

---

## D. Audit Chain Break

**Trigger**: `verify_audit_chain()` returns `status: 'broken'`, or `detect_audit_gaps()` returns rows.

An audit chain break is a **critical integrity event** — it may indicate data tampering or a bug in the audit system.

### 1. Verify the Chain

```sql
SELECT verify_audit_chain(1, 100000);
```

Returns:
```json
{
  "status": "intact" | "broken",
  "broken_at_seq": null | 12345,
  "reason": "prev_hash mismatch" | "row_hash mismatch" | "First record prev_hash not GENESIS",
  "records_verified": 100000
}
```

### 2. Detect Gaps

```sql
SELECT * FROM detect_audit_gaps(1);
```

Returns `gap_start`, `gap_end`, `gap_size` for any missing sequence numbers.

### 3. Investigate the Break Point

```sql
-- Get the broken record and its neighbors
SELECT seq_num, prev_hash, row_hash, action, entity_id, created_at, actor_id
FROM audit_log
WHERE seq_num BETWEEN (BROKEN_SEQ - 5) AND (BROKEN_SEQ + 5)
ORDER BY seq_num;
```

The canonical hash payload is: `seq_num|prev_hash|action|entity_id|created_at|ledger_id|actor_id|ip_address`

### 4. Determine Cause

| Finding | Likely Cause |
|---------|-------------|
| `prev_hash mismatch` | Record was modified after insertion |
| `row_hash mismatch` | Record contents don't match their hash |
| `First record prev_hash not GENESIS` | First audit record was modified |
| Gap in seq_num | Records were deleted |

### 5. Escalation

Audit chain breaks require immediate escalation:
- Preserve all evidence (export affected records)
- Notify security team
- If tampering is confirmed, engage incident response procedures
- Do NOT modify or "fix" the chain — the break itself is evidence

---

## E. Webhook Signature Failures

**Trigger**: ops-monitor `webhook_auth_failures` or `webhook_invalid_signature` events in audit_log.

### 1. Identify the Failures

```sql
SELECT ip_address, COUNT(*) AS failures, MIN(created_at) AS first, MAX(created_at) AS last
FROM audit_log
WHERE action = 'webhook_invalid_signature'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address
ORDER BY failures DESC;
```

### 2. Verify Signing Key

Check that the webhook signing key in Soledgic matches the one configured in Finix:

- Soledgic: `PROCESSOR_WEBHOOK_SIGNING_KEY` environment variable
- Finix: Webhook configuration in the Finix dashboard

If keys are mismatched, update the environment variable and redeploy.

### 3. Check for Replay Attacks

If signatures are failing from unknown IPs, someone may be sending forged webhook requests:

```sql
SELECT ip_address, request_body->>'event_type' AS event_type,
       response_status, created_at
FROM audit_log
WHERE action = 'webhook_invalid_signature'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

Block IPs that are not from the processor's known IP ranges.

### 4. Post-Resolution

After fixing the signing key or blocking malicious IPs, verify legitimate webhooks are being accepted:

```sql
SELECT status, COUNT(*)
FROM processor_webhook_inbox
WHERE received_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

All recent rows should show `signature_valid = true`.

---

## Do NOT

- **Do NOT "fix" a broken audit chain** — the break itself is forensic evidence. Never modify `audit_log` rows to repair hashes or fill gaps. See section D.
- **Do NOT DELETE `audit_log` rows** — even if they appear to be from an attacker. They are evidence and part of the integrity chain.
- **Do NOT restore from a database backup without forensic review first** — a backup restore can destroy evidence of what happened during the incident window.
- **Do NOT rotate secrets without documenting which secrets were exposed and when** — you need a clear timeline for the post-incident review.
- **Do NOT assume blocking an IP resolves the incident** — the attacker may have multiple IPs or may have already exfiltrated data.

---

## F. Credential Leak Response

If a secret is exposed (committed to git, logged, shared in chat, found in error output):

### 1. Identify Which Secret(s) Leaked

| Secret | Impact if Leaked | Rotation Priority |
|--------|-----------------|-------------------|
| `PROCESSOR_USERNAME` / `PROCESSOR_PASSWORD` | Full access to Finix API — can create transfers, read merchant data | IMMEDIATE — enable maintenance mode |
| `PROCESSOR_WEBHOOK_SIGNING_KEY` | Attacker can forge processor webhook events | IMMEDIATE — pause inbox processing |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses RLS | IMMEDIATE — enable maintenance mode |
| `CRON_SECRET` | Can trigger cron-authenticated functions | HIGH — rotate within 1 hour |
| `SUPABASE_ANON_KEY` | Limited by RLS, lower risk | MEDIUM — rotate within 24 hours |

### 2. Contain Based on Secret Type

**Processor credentials leaked (`PROCESSOR_USERNAME`/`PROCESSOR_PASSWORD`):**

1. Enable maintenance mode: `supabase secrets set MAINTENANCE_MODE=true`
2. Rotate credentials in Finix dashboard
3. Update env vars: `supabase secrets set PROCESSOR_USERNAME=... PROCESSOR_PASSWORD=...`
4. Redeploy all Edge Functions
5. Disable maintenance mode

**Webhook signing key leaked (`PROCESSOR_WEBHOOK_SIGNING_KEY`):**

1. Pause inbox processing (see [safe-mode.md](safe-mode.md))
2. Rotate the signing key in Finix dashboard
3. Update env var: `supabase secrets set PROCESSOR_WEBHOOK_SIGNING_KEY=...`
4. Redeploy all Edge Functions
5. Review `processor_webhook_inbox` for forged events during exposure window
6. Re-enable inbox processing

**Service role key leaked (`SUPABASE_SERVICE_ROLE_KEY`):**

1. Enable maintenance mode: `supabase secrets set MAINTENANCE_MODE=true`
2. Rotate in Supabase dashboard (Settings > API)
3. Update env var: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
4. Invalidate all active user sessions (Supabase Auth admin API)
5. Redeploy all Edge Functions
6. Review `audit_log` for unauthorized access during exposure window
7. Disable maintenance mode

**Cron secret leaked (`CRON_SECRET`):**

1. Rotate: `supabase secrets set CRON_SECRET=<new-value>`
2. Update pg_cron jobs that reference the cron secret (scheduled-payouts, process-webhooks, security-alerts)
3. Redeploy all Edge Functions

### 3. Post-Rotation Verification

```bash
# Verify Edge Functions are responding
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

# Verify processor connectivity
curl -u "$PROCESSOR_USERNAME:$PROCESSOR_PASSWORD" \
  -H "Finix-Version: 2022-02-01" \
  "$PROCESSOR_BASE_URL/merchants/$PROCESSOR_MERCHANT_ID"
```

### 4. Audit the Exposure Window

```sql
-- Check for suspicious activity during the exposure window
SELECT action, ip_address, entity_type, created_at
FROM audit_log
WHERE created_at BETWEEN 'LEAK_START_TIME' AND 'LEAK_END_TIME'
  AND action NOT IN ('rate_limit_hit', 'health_check')
ORDER BY created_at DESC;
```

For detailed per-secret rotation steps, see [secret-rotation.md](secret-rotation.md).

---

## Post-Incident Checklist

For any security incident:

1. **Document**: Record timeline, actions taken, and impact in an incident report
2. **Verify audit integrity**: Run `verify_audit_chain()` to confirm no tampering
3. **Run ops-monitor**: Confirm all checks pass

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ops-monitor" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

4. **Review access**: Check for any API keys or credentials that may need rotation. See [secret-rotation.md](secret-rotation.md).
5. **Update defenses**: Adjust rate limits, WAF rules, or monitoring thresholds based on lessons learned
