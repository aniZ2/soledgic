# Business Continuity Plan
## Osifo Holdings, L.L.C. - Soledgic Platform
**Version:** 1.0  
**Effective Date:** December 22, 2024  
**Last Review:** December 22, 2024  
**Next Review:** June 22, 2025  
**Owner:** Anita Osifo, Founder & CEO

---

## 1. Purpose

This Business Continuity Plan (BCP) ensures Soledgic can maintain essential business functions during and after a disaster or significant disruption. This plan covers prevention, response, and recovery procedures.

---

## 2. Scope

This plan covers:
- Soledgic API and backend services
- Customer data and financial records
- Internal systems and communications
- Third-party service dependencies

---

## 3. Business Impact Analysis

### 3.1 Critical Business Functions

| Function | Description | Max Tolerable Downtime | Priority |
|----------|-------------|------------------------|----------|
| API Availability | Customer API endpoints | 4 hours | Critical |
| Transaction Processing | Record sales, payouts | 4 hours | Critical |
| Data Integrity | Ledger accuracy | 0 (no data loss) | Critical |
| Customer Portal | Dashboard access | 24 hours | High |
| Reporting | Financial reports | 72 hours | Medium |
| Email Notifications | Alerts and statements | 24 hours | Medium |

### 3.2 Recovery Objectives

| Objective | Target | Justification |
|-----------|--------|---------------|
| **RTO** (Recovery Time Objective) | 4 hours | Customer SLA expectations |
| **RPO** (Recovery Point Objective) | 5 minutes | Supabase continuous backup |
| **MTPD** (Max Tolerable Period of Disruption) | 24 hours | Business viability |

### 3.3 Dependencies

| Dependency | Provider | Criticality | Fallback |
|------------|----------|-------------|----------|
| Database | Supabase | Critical | Point-in-time recovery |
| Edge Functions | Supabase | Critical | Multi-region deployment |
| Rate Limiting | Upstash Redis | High | Database fallback |
| DDoS Protection | Cloudflare | High | Supabase native |
| Email Delivery | Resend | Medium | Queue and retry |
| Payments | Stripe | Medium | Queue transactions |
| Bank Data | Plaid | Low | Manual entry |

---

## 4. Risk Assessment

### 4.1 Identified Risks

| Risk | Likelihood | Impact | Risk Score | Mitigation |
|------|------------|--------|------------|------------|
| Supabase outage | Low | Critical | High | Multi-region, PITR |
| DDoS attack | Medium | High | High | Cloudflare, rate limiting |
| Data breach | Low | Critical | High | Encryption, access controls |
| API key compromise | Medium | High | High | Rotation, monitoring |
| Redis failure | Medium | Medium | Medium | Database fallback |
| Developer unavailable | Medium | Medium | Medium | Documentation |
| Natural disaster | Low | High | Medium | Cloud infrastructure |
| Cyber attack | Medium | Critical | High | Security hardening |

### 4.2 Risk Mitigation Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEFENSE IN DEPTH                             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Cloudflare DDoS Protection                           │
│  Layer 2: Rate Limiting (Redis + DB fallback)                  │
│  Layer 3: API Authentication (hash-based)                      │
│  Layer 4: Row-Level Security (RLS)                             │
│  Layer 5: Encryption at Rest (AES-256)                         │
│  Layer 6: Audit Logging & Monitoring                           │
│  Layer 7: Automated Backups (continuous)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Recovery Strategies

### 5.1 Database Recovery

**Scenario:** Database corruption or data loss

**Recovery Procedure:**

1. **Assess Damage** (5 minutes)
   - Check Supabase status page
   - Identify scope of data affected
   - Determine point of corruption

2. **Enable Maintenance Mode** (2 minutes)
   ```bash
   supabase secrets set MAINTENANCE_MODE=true
   ```

3. **Initiate Point-in-Time Recovery** (30-60 minutes)
   - Navigate to Supabase Dashboard > Database > Backups
   - Select recovery point (within 7 days)
   - Initiate restoration
   - Verify data integrity

4. **Validate Recovery** (30 minutes)
   ```sql
   -- Check transaction count
   SELECT COUNT(*) FROM transactions;
   
   -- Verify recent transactions
   SELECT * FROM transactions 
   ORDER BY created_at DESC LIMIT 10;
   
   -- Run health check
   SELECT * FROM run_all_health_checks();
   ```

5. **Disable Maintenance Mode** (2 minutes)
   ```bash
   supabase secrets set MAINTENANCE_MODE=false
   ```

6. **Notify Customers** (if data loss occurred)

**RTO:** 2 hours | **RPO:** 5 minutes

---

### 5.2 DDoS Attack Response

**Scenario:** Distributed denial of service attack

**Recovery Procedure:**

1. **Detection** (Automated)
   - Security alerts trigger at 300+ rate limit hits/hour
   - Monitoring dashboard shows anomaly

2. **Immediate Response** (5 minutes)
   ```bash
   # Block attacking IPs
   supabase secrets set BLOCKED_IPS=<attacker-ips>
   
   # If severe, enable allowlist mode
   supabase secrets set ALLOWLIST_MODE=true
   supabase secrets set ALLOWED_API_KEYS=<trusted-keys>
   ```

3. **Assess & Adapt** (ongoing)
   - Monitor `security_dashboard` view
   - Check rate limit offenders
   - Adjust thresholds if needed

4. **Recovery** (after attack subsides)
   ```bash
   # Remove IP blocks (after cooling period)
   supabase secrets set BLOCKED_IPS=
   
   # Disable allowlist mode
   supabase secrets set ALLOWLIST_MODE=false
   ```

5. **Post-Incident**
   - Document attack patterns
   - Update playbook
   - Consider permanent blocks

**Reference:** See `docs/DDOS_RESPONSE_PLAYBOOK.md`

---

### 5.3 API Key Compromise

**Scenario:** Customer API key exposed or stolen

**Recovery Procedure:**

1. **Immediate Rotation** (2 minutes)
   ```sql
   SELECT rotate_api_key('<ledger-id>'::UUID);
   ```

2. **Investigate** (15 minutes)
   ```sql
   SELECT * FROM audit_log
   WHERE ledger_id = '<ledger-id>'
     AND created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```

3. **Reverse Fraudulent Transactions** (if any)
   ```sql
   SELECT reverse_transaction('<txn-id>'::UUID, 'Security incident', 'fraud');
   ```

4. **Block Attacker IP** (if identified)
   ```bash
   supabase secrets set BLOCKED_IPS=<attacker-ip>
   ```

5. **Notify Customer**
   - Provide new API key
   - Share investigation findings
   - Recommend security improvements

**Reference:** See `docs/TABLETOP_EXERCISE_API_KEY_COMPROMISE.md`

---

### 5.4 Third-Party Service Failure

**Scenario:** Critical vendor (Supabase, Upstash) experiences outage

**Upstash Redis Failure:**

1. **Automatic Fallback** - System automatically falls back to database rate limiting
2. **Monitor** - Check logs for "DB Fallback Active" messages
3. **No action required** - System continues at 10% capacity (narrow gate)

**Supabase Failure:**

1. **Check Status** - status.supabase.com
2. **Enable Maintenance Mode** - Prevent partial operations
3. **Monitor Recovery** - Supabase handles infrastructure
4. **Validate** - Run health checks after recovery

**Stripe Failure:**

1. **Queue Transactions** - Store locally, process later
2. **Monitor Status** - status.stripe.com
3. **Retry** - Process queued transactions after recovery

---

### 5.5 Complete Infrastructure Failure

**Scenario:** Total loss of Supabase project

**Recovery Procedure:**

1. **Create New Supabase Project**
   - Same region for latency
   - Document new project ID

2. **Restore Database**
   - Request backup from Supabase support
   - Or use most recent PITR

3. **Redeploy Edge Functions**
   ```bash
   cd /Users/osifo/Desktop/soledgic
   supabase link --project-ref <new-project-id>
   ./scripts/deploy-all-functions.sh
   ```

4. **Restore Secrets**
   ```bash
   supabase secrets set UPSTASH_REDIS_URL=<url>
   supabase secrets set UPSTASH_REDIS_TOKEN=<token>
   supabase secrets set STRIPE_SECRET_KEY=<key>
   supabase secrets set STRIPE_WEBHOOK_SECRET=<secret>
   supabase secrets set PLAID_CLIENT_ID=<id>
   supabase secrets set PLAID_SECRET=<secret>
   supabase secrets set RESEND_API_KEY=<key>
   ```

5. **Update DNS/Integrations**
   - Update API URL in customer integrations
   - Update webhook URLs in Stripe, Plaid

6. **Validate**
   - Run full test suite
   - Verify customer access

**RTO:** 4 hours | **RPO:** 5 minutes (with PITR)

---

## 6. Communication Plan

### 6.1 Internal Communication

| Situation | Channel | Responsible |
|-----------|---------|-------------|
| Incident detected | Slack/Email | Automated |
| Major outage | Status page | Ani |
| Data breach | Phone + Email | Ani |

### 6.2 External Communication

| Stakeholder | Trigger | Channel | Timeline |
|-------------|---------|---------|----------|
| Affected customers | Service disruption > 1 hour | Email | Within 1 hour |
| All customers | Major incident | Status page | Within 2 hours |
| Regulators | Data breach | Official channels | Within 72 hours |

### 6.3 Status Page

**URL:** status.soledgic.com (to be configured)

| Status | Description |
|--------|-------------|
| Operational | All systems functioning normally |
| Degraded Performance | Slower response times |
| Partial Outage | Some features unavailable |
| Major Outage | Service unavailable |
| Maintenance | Planned downtime |

### 6.4 Communication Templates

**Service Disruption:**
```
Subject: [Soledgic] Service Disruption - [DATE]

We are currently experiencing [brief description].

Impact: [what's affected]
Status: [current status]
ETA: [estimated resolution]

We will provide updates every [30 minutes/hour].

For urgent inquiries: support@soledgic.com
```

**Resolution:**
```
Subject: [Soledgic] Service Restored - [DATE]

The service disruption has been resolved at [TIME].

Root Cause: [brief explanation]
Duration: [X hours/minutes]
Data Impact: [none/description]

We apologize for any inconvenience.
```

---

## 7. Roles and Responsibilities

### 7.1 Incident Response Team

| Role | Person | Responsibilities |
|------|--------|------------------|
| Incident Commander | Anita Osifo | Overall coordination, decisions |
| Technical Lead | Anita Osifo | Technical investigation, recovery |
| Communications | Anita Osifo | Customer and stakeholder updates |

*Note: As a solo founder, all roles are currently consolidated. This will expand with team growth.*

### 7.2 Contact Information

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Primary | Anita Osifo | [REDACTED] | anita@soledgic.com |
| Backup | [Future hire] | - | - |

### 7.3 Vendor Contacts

| Vendor | Support Channel | Escalation |
|--------|-----------------|------------|
| Supabase | support@supabase.io | Dashboard ticket |
| Upstash | support@upstash.com | Dashboard |
| Stripe | Dashboard | Phone (Enterprise) |
| Plaid | Dashboard | Support ticket |

---

## 8. Testing and Maintenance

### 8.1 Test Schedule

| Test Type | Frequency | Last Test | Next Test |
|-----------|-----------|-----------|-----------|
| Backup restoration | Quarterly | - | Q1 2025 |
| Failover test | Semi-annual | - | Q2 2025 |
| Tabletop exercise | Annual | Dec 2024 | Dec 2025 |
| Full DR test | Annual | - | Q2 2025 |

### 8.2 Test Procedures

**Backup Restoration Test:**
1. Create test project in Supabase
2. Restore production backup to test project
3. Verify data integrity
4. Document results
5. Delete test project

**Failover Test:**
1. Enable maintenance mode
2. Simulate primary service failure
3. Verify fallback mechanisms activate
4. Document recovery time
5. Restore normal operations

### 8.3 Plan Maintenance

This plan shall be reviewed and updated:
- Semi-annually (minimum)
- After any significant incident
- After major infrastructure changes
- After adding new critical vendors

---

## 9. Recovery Checklists

### 9.1 Quick Reference: Emergency Commands

```bash
# Enable maintenance mode
supabase secrets set MAINTENANCE_MODE=true

# Block IPs
supabase secrets set BLOCKED_IPS=1.2.3.4,5.6.7.8

# Enable allowlist (nuclear option)
supabase secrets set ALLOWLIST_MODE=true
supabase secrets set ALLOWED_API_KEYS=sk_live_xxx

# Rotate API key
supabase db execute "SELECT rotate_api_key('ledger-uuid'::UUID)"

# Check system health
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/health-check \
  -H "x-api-key: $SOLEDGIC_API_KEY" \
  -d '{"action": "status"}'

# Deploy all functions
./scripts/deploy-all-functions.sh
```

### 9.2 Incident Severity Matrix

| Severity | Definition | Response | Notification |
|----------|------------|----------|--------------|
| SEV-1 | Service down, data at risk | 15 min | Immediate |
| SEV-2 | Major feature unavailable | 1 hour | 1 hour |
| SEV-3 | Minor feature impacted | 4 hours | 4 hours |
| SEV-4 | Low impact issue | 24 hours | None |

### 9.3 Post-Incident Checklist

- [ ] Incident timeline documented
- [ ] Root cause identified
- [ ] Affected customers notified
- [ ] Data integrity verified
- [ ] Security implications assessed
- [ ] Preventive measures identified
- [ ] Plan updates required?
- [ ] Lessons learned documented

---

## 10. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 22, 2024 | Anita Osifo | Initial release |

---

## 11. Approval

This Business Continuity Plan has been reviewed and approved.

**Approved by:**

Name: Anita Osifo  
Title: Founder & CEO  
Date: December 22, 2024

---

## Appendix A: Recovery Time Summary

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Database corruption | 2 hours | 5 min | Section 5.1 |
| DDoS attack | 30 min | 0 | Section 5.2 |
| API key compromise | 15 min | 0 | Section 5.3 |
| Vendor outage | Varies | 0 | Section 5.4 |
| Complete failure | 4 hours | 5 min | Section 5.5 |

---

## Appendix B: Key Locations

| Item | Location |
|------|----------|
| Source code | GitHub (private repo) |
| Database backups | Supabase (automatic) |
| Configuration | `/Users/osifo/Desktop/soledgic` |
| Secrets | Supabase Dashboard > Secrets |
| Documentation | `/docs/` directory |
| Incident reports | `/docs/incidents/` |
| Playbooks | `/docs/DDOS_RESPONSE_PLAYBOOK.md` |

---

*This document is confidential and intended for internal use only.*
