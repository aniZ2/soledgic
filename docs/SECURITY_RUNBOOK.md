# Soledgic Security Best Practices & Runbook

## Overview

This document outlines security best practices for operating Soledgic and responding to security incidents.

## Environment Variables

### Required Security Configuration

```bash
# Rate Limiting (Upstash Redis)
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=xxx

# Environment (CRITICAL: defaults to 'production' if not set)
ENVIRONMENT=production

# Security Alerts
SECURITY_ALERT_EMAIL=security@yourcompany.com
RESEND_API_KEY=re_xxx

# Cron Job Authentication
CRON_SECRET=your-secure-random-string
```

### Optional Security Controls

```bash
# IP Blocking (comma-separated)
BLOCKED_IPS=1.2.3.4,5.6.7.8

# Geo-IP Blocking (ISO country codes)
BLOCKED_COUNTRIES=KP,IR

# Emergency Mode - Block all non-allowlisted API keys
ALLOWLIST_MODE=true
ALLOWED_API_KEYS=sk_live_xxx,sk_live_yyy

# Maintenance Mode - Return 503 for all endpoints
MAINTENANCE_MODE=true
```

## Security Monitoring

### Dashboard Views

Query these views for security monitoring:

```sql
-- Quick hourly summary
SELECT * FROM security_summary_hourly;

-- Security events by hour (last 24h)
SELECT * FROM security_events_hourly;

-- Top offending IPs
SELECT * FROM security_top_offending_ips;

-- Stripe fee reconciliation status
SELECT * FROM stripe_fee_reconciliation_status;
```

### Alert Thresholds

The security-alerts function monitors these thresholds:

| Metric | Threshold | Severity |
|--------|-----------|----------|
| Rate limit hits/hour | 100 | warning |
| Rate limit hits/hour | 300 | critical |
| Auth failures/hour | 50 | warning |
| Auth failures/hour | 100 | critical |
| Unique IPs rate limited | 20 | critical |
| Pre-auth rate limits/hour | 50 | warning |
| Geo-blocked requests | 20 | info |
| High-risk events (score≥70) | 10 | critical |
| SSRF attempts | 1 | critical |

## Incident Response

### DDoS Attack

1. **Enable Cloudflare Under Attack Mode**
   - Log into Cloudflare dashboard
   - Enable "Under Attack Mode" for the domain

2. **Check Rate Limiting**
   ```sql
   -- Find top offending IPs
   SELECT ip_address, COUNT(*) as hits
   FROM audit_log
   WHERE action = 'rate_limited'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY ip_address
   ORDER BY hits DESC
   LIMIT 20;
   ```

3. **Block Malicious IPs**
   - Add to `BLOCKED_IPS` environment variable
   - Redeploy Edge Functions

4. **Enable Allowlist Mode (if severe)**
   ```bash
   ALLOWLIST_MODE=true
   ALLOWED_API_KEYS=sk_live_known_good_key
   ```

### Brute Force Attack (API Keys)

1. **Check pre-auth rate limit events**
   ```sql
   SELECT ip_address, COUNT(*) as attempts
   FROM audit_log
   WHERE action = 'preauth_rate_limited'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY ip_address
   ORDER BY attempts DESC;
   ```

2. **Block offending IPs**
3. **Consider rotating compromised API keys**
   ```sql
   -- Find API keys with high auth failures
   SELECT 
     l.business_name,
     COUNT(*) as failures
   FROM audit_log a
   JOIN ledgers l ON l.id = a.ledger_id
   WHERE a.action = 'auth_failed'
     AND a.created_at > NOW() - INTERVAL '24 hours'
   GROUP BY l.id, l.business_name
   ORDER BY failures DESC;
   ```

### SSRF Attempt

1. **CRITICAL: Investigate immediately**
   ```sql
   SELECT * FROM audit_log
   WHERE action = 'ssrf_attempt'
   ORDER BY created_at DESC
   LIMIT 50;
   ```

2. **Block attacker IPs immediately**
3. **Review webhook URLs**
   ```sql
   SELECT * FROM webhook_endpoints
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

4. **Check for unauthorized connections**

### Redis Failure

1. **Check Upstash Console** for health and quotas
2. **Monitor database fallback usage**
   ```sql
   SELECT COUNT(*) as db_fallbacks
   FROM audit_log
   WHERE action = 'rate_limited'
     AND request_body->>'source' = 'database'
     AND created_at > NOW() - INTERVAL '1 hour';
   ```
3. **If persistent, enable maintenance mode** while investigating

### Leaked API Key

1. **Immediately rotate the key**
   ```sql
   -- Find the ledger
   SELECT id, business_name FROM ledgers
   WHERE api_key_hash = encode(sha256('leaked_key'::bytea), 'hex');
   
   -- Generate new key in application
   ```

2. **Revoke old key**
3. **Review audit logs for unauthorized activity**
   ```sql
   SELECT * FROM audit_log
   WHERE ledger_id = 'affected-ledger-id'
     AND created_at > NOW() - INTERVAL '7 days'
   ORDER BY created_at DESC;
   ```

4. **Notify affected customer**

## Security Checklist

### Pre-Launch

- [ ] `ENVIRONMENT=production` is set
- [ ] Upstash Redis is configured and healthy
- [ ] Security alert email is configured
- [ ] CRON_SECRET is set for security-alerts
- [ ] All sensitive data uses Vault storage
- [ ] RLS policies are verified

### Regular Maintenance

- [ ] Review `security_summary_hourly` daily
- [ ] Check `security_top_offending_ips` weekly
- [ ] Review `stripe_fee_reconciliation_status` weekly
- [ ] Run `cleanup_old_reference_ids()` monthly
- [ ] Rotate webhook secrets quarterly
- [ ] Review and update blocked countries list

### After Security Incident

- [ ] Document the incident
- [ ] Update blocked IPs/countries if needed
- [ ] Review and adjust thresholds
- [ ] Notify affected parties
- [ ] Post-incident review meeting

## Rate Limiting Architecture

```
Request Flow:
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Pre-Auth    │     │   Auth       │     │  Post-Auth   │
│  Rate Limit  │ --> │  Validation  │ --> │  Rate Limit  │
│  (by IP)     │     │  (API Key)   │     │  (by Ledger) │
└──────────────┘     └──────────────┘     └──────────────┘
       │                                         │
       v                                         v
┌──────────────┐                         ┌──────────────┐
│    Redis     │                         │    Redis     │
│  (primary)   │                         │  (primary)   │
└──────────────┘                         └──────────────┘
       │                                         │
       v (fallback)                              v (fallback)
┌──────────────┐                         ┌──────────────┐
│   Postgres   │                         │   Postgres   │
│  (10% limit) │                         │  (10% limit) │
└──────────────┘                         └──────────────┘
```

## Contact

- Security Issues: security@soledgic.com
- Emergency: [On-call engineer contact]
