# Soledgic - Platform Status

## Updated March 10, 2026

---

## Security Baseline

All security audit items from December 2024 are resolved:

| ID | Issue | Resolution |
|----|-------|------------|
| C1 | "Live API key in test-data/" | Verified: no real keys ever committed to git. File was never tracked. No rotation needed. |
| H1 | Supabase key duplication | Consolidated |
| H2 | Missing CSRF protection | CSRF lib added |
| M1 | Billing endpoint auth pattern | Fixed |
| M2 | Webhook secrets plaintext | Moved to Vault |
| M3 | Error message leakage | Sanitization added |
| L1-L4 | Request size, rate limiting, key display, CSP | All resolved |

### Completed Security Infrastructure

- Edge Functions hardened (48/48)
- Rate limiting (Redis + DB fallback)
- Security headers + CSP (Next.js)
- CSRF protection
- Audit logging with risk scores
- Emergency controls (maintenance mode, IP blocking)
- NACHA secure storage (private bucket, signed URLs)
- Compliance monitoring views (SOC 2 CC6.1, CC7.2)
- Webhook secrets in Vault
- Receipts bucket RLS (org-scoped access)

---

## Infrastructure Status

| Component | Status |
|-----------|--------|
| Payment processor (Finix) | Live |
| API custom domain (api.soledgic.com) | Live |
| Edge functions deployed | Current |
| Migrations applied | Current (v1 baseline) |
| Test suites passing | 265/265 (unit, e2e, stress) |
| Storage buckets | batch-payouts, payout-files, receipts (all private + RLS) |

---

## Pending Work

### Migration Consolidation - DONE
- Consolidated 234 migrations into single v1 baseline (544K)
- Production `schema_migrations` table reset to baseline
- 103 tables, 193 functions, 157 RLS policies, 268 indexes, 60 triggers preserved

### Operational

- [ ] Verify `ENVIRONMENT=production` is set in Supabase secrets
- [ ] Schedule SOC 2 Type II audit
- [ ] Schedule penetration test

### Ongoing Maintenance

| Task | Frequency |
|------|-----------|
| Review audit logs | Daily |
| Check security dashboard | Daily |
| Review rate limit offenders | Weekly |
| Check compliance views | Weekly |
| Security baseline review | Quarterly |
| Penetration testing | Annually |

---

## Compliance Monitoring Queries

### SOC 2 CC7.2 - Security Event Summary (30 days)
```sql
SELECT * FROM compliance_security_summary
ORDER BY date DESC, event_count DESC;
```

### SOC 2 CC6.1 - Financial Activity (90 days)
```sql
SELECT * FROM compliance_financial_activity
ORDER BY date DESC;
```

### Anomaly Detection
```sql
SELECT * FROM compliance_access_patterns;
```

### NACHA File Audit Trail
```sql
SELECT file_name, batch_count, entry_count,
  total_debit_amount + total_credit_amount as total_amount,
  generated_at, ip_address, expires_at
FROM nacha_files
ORDER BY generated_at DESC LIMIT 20;
```

---

## Emergency Commands

```bash
# Maintenance mode
supabase secrets set MAINTENANCE_MODE=true

# Block an IP
supabase secrets set BLOCKED_IPS=1.2.3.4

# Allowlist only
supabase secrets set ALLOWLIST_MODE=true
```

### Incident Response
1. Check `docs/DDOS_RESPONSE_PLAYBOOK.md`
2. Run tabletop exercise for reference
3. Log incident in `docs/incidents/`

---

## Security Documentation

| Document | Purpose |
|----------|---------|
| `docs/SECURITY_BASELINE_V1.md` | Frozen security baseline |
| `docs/SOC2_READINESS_MEMO.md` | Audit preparation guide |
| `docs/SECURITY_AUDIT_REPORT.md` | Detailed findings & fixes |
| `docs/DDOS_RESPONSE_PLAYBOOK.md` | Incident response |
| `docs/TABLETOP_EXERCISE_API_KEY_COMPROMISE.md` | IR training |

---

## Test Commands

```bash
# Full test suite
npm test              # Unit tests (109)
npm run test:e2e      # E2E tests (52)
npm run test:stress   # Stress tests (71)

# Security smoke test
bash scripts/first-light-test.sh
```

```sql
-- Security dashboard
SELECT * FROM security_dashboard ORDER BY hour DESC LIMIT 24;

-- Rate limit offenders
SELECT * FROM get_rate_limit_offenders(5);

-- Recent high-risk events
SELECT * FROM audit_log
WHERE risk_score >= 50
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY risk_score DESC;
```
