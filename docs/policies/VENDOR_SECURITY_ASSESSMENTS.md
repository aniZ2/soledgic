# Vendor Security Assessments
## Osifo Holdings, L.L.C. - Soledgic Platform
**Last Updated:** December 22, 2024  
**Next Review:** December 22, 2025  
**Owner:** Anita Osifo, Founder & CEO

---

## Overview

This document contains security assessments for all third-party vendors that process, store, or have access to Soledgic confidential data. Each vendor is assessed against our security requirements and must maintain acceptable security posture to remain approved.

---

## Assessment Criteria

Each vendor is evaluated on:

| Criteria | Weight | Minimum Requirement |
|----------|--------|---------------------|
| SOC 2 Type II (or equivalent) | Critical | Required |
| Data encryption at rest | Critical | AES-256 or equivalent |
| Data encryption in transit | Critical | TLS 1.2+ |
| Access controls | High | MFA, RBAC |
| Incident response | High | Documented process |
| Data processing agreement | Critical | Signed |
| Subprocessor management | Medium | Documented |
| Data residency | Medium | Known locations |

**Risk Ratings:**
- 🟢 **Low Risk** - Meets or exceeds all requirements
- 🟡 **Medium Risk** - Minor gaps, compensating controls in place
- 🔴 **High Risk** - Significant gaps, requires remediation or replacement

---

## Vendor Assessment: Supabase

### Basic Information

| Field | Value |
|-------|-------|
| Vendor Name | Supabase, Inc. |
| Service | Database, Authentication, Edge Functions, Storage |
| Contract Start | November 2024 |
| Data Processed | All Soledgic data (transactions, accounts, audit logs) |
| Data Classification | Confidential, Restricted |
| Business Criticality | Critical |

### Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| SOC 2 Type II | ✅ | Report available at supabase.com/security |
| SOC 2 Type I | ✅ | Completed |
| ISO 27001 | ✅ | Certified |
| HIPAA | ✅ | BAA available |
| GDPR | ✅ | DPA available |

### Technical Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Encryption at rest | AES-256 | ✅ |
| Encryption in transit | TLS 1.3 | ✅ |
| Database encryption | Transparent Data Encryption | ✅ |
| Backup encryption | AES-256 | ✅ |
| Key management | AWS KMS | ✅ |
| Network isolation | VPC per project | ✅ |
| DDoS protection | Cloudflare | ✅ |
| WAF | Cloudflare | ✅ |

### Access Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| MFA | Available, enforced for our account | ✅ |
| SSO | Available (Enterprise) | ⚪ N/A |
| RBAC | Project-level roles | ✅ |
| Audit logging | Available | ✅ |
| API authentication | JWT, API keys | ✅ |

### Data Handling

| Aspect | Details |
|--------|---------|
| Data residency | AWS us-east-1 (configurable) |
| Data retention | Customer controlled |
| Data deletion | On project deletion + 30 day grace |
| Subprocessors | AWS, Cloudflare, Twilio (listed) |

### Incident Response

| Aspect | Details |
|--------|---------|
| Incident notification | 72 hours |
| Status page | status.supabase.com |
| Security contact | security@supabase.io |

### Risk Assessment

**Overall Risk: 🟢 Low Risk**

| Risk | Mitigation |
|------|------------|
| Vendor lock-in | PostgreSQL standard, exportable |
| Data breach | SOC 2 controls, encryption |
| Service outage | Multi-AZ, status monitoring |

### Documents on File

- [x] SOC 2 Type II Report (2024)
- [x] Data Processing Agreement
- [x] Terms of Service
- [x] Privacy Policy
- [x] Subprocessor List

---

## Vendor Assessment: Upstash

### Basic Information

| Field | Value |
|-------|-------|
| Vendor Name | Upstash, Inc. |
| Service | Redis (rate limiting, caching) |
| Contract Start | December 2024 |
| Data Processed | Rate limit counters (API key hashes, counts) |
| Data Classification | Internal |
| Business Criticality | High (graceful degradation available) |

### Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| SOC 2 Type II | ✅ | Report available |
| GDPR | ✅ | Compliant |
| HIPAA | ✅ | Available |

### Technical Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Encryption at rest | AES-256 | ✅ |
| Encryption in transit | TLS 1.2+ | ✅ |
| Network isolation | Per-database isolation | ✅ |
| Access control | Token-based | ✅ |

### Access Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| MFA | Available | ✅ |
| API authentication | REST token | ✅ |
| Audit logging | Available | ✅ |

### Data Handling

| Aspect | Details |
|--------|---------|
| Data residency | Global Edge (configurable) |
| Data retention | TTL-based (1 hour for rate limits) |
| Data deletion | Automatic via TTL |
| Subprocessors | AWS, Fly.io |

### Risk Assessment

**Overall Risk: 🟢 Low Risk**

| Risk | Mitigation |
|------|------------|
| Service outage | Database fallback implemented |
| Data exposure | Only stores hashes and counts |

### Documents on File

- [x] SOC 2 Type II Report
- [x] Terms of Service
- [x] Privacy Policy

---

## Vendor Assessment: Stripe

### Basic Information

| Field | Value |
|-------|-------|
| Vendor Name | Stripe, Inc. |
| Service | Payment processing (for Soledgic billing) |
| Contract Start | December 2024 |
| Data Processed | Payment card data (not stored by Soledgic) |
| Data Classification | Restricted (handled by Stripe) |
| Business Criticality | High |

### Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| SOC 2 Type II | ✅ | Report available |
| PCI DSS Level 1 | ✅ | Certified |
| ISO 27001 | ✅ | Certified |
| GDPR | ✅ | Compliant |

### Technical Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Encryption at rest | AES-256 | ✅ |
| Encryption in transit | TLS 1.2+ | ✅ |
| Tokenization | Card data never touches our servers | ✅ |
| Webhook signatures | HMAC-SHA256 | ✅ |
| Replay protection | Timestamp verification | ✅ |

### Access Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| MFA | Enforced | ✅ |
| API key scoping | Restricted/Secret keys | ✅ |
| Audit logging | Dashboard available | ✅ |
| IP allowlisting | Available | ✅ |

### Data Handling

| Aspect | Details |
|--------|---------|
| Data residency | US (configurable) |
| PCI scope | Stripe handles all card data |
| Data retention | Per Stripe policy |

### Soledgic Integration Security

| Control | Implementation |
|---------|----------------|
| Webhook signature verification | ✅ HMAC-SHA256 with timing-safe comparison |
| Replay attack prevention | ✅ 5-minute timestamp window |
| Secret rotation | ✅ Supported |
| Test/Live separation | ✅ Separate keys |

### Risk Assessment

**Overall Risk: 🟢 Low Risk**

| Risk | Mitigation |
|------|------------|
| Payment fraud | Stripe Radar, 3D Secure |
| Webhook spoofing | Signature verification |
| Key compromise | Immediate rotation capability |

### Documents on File

- [x] SOC 2 Type II Report
- [x] PCI DSS Attestation of Compliance
- [x] Data Processing Agreement
- [x] Terms of Service

---

## Vendor Assessment: Plaid

### Basic Information

| Field | Value |
|-------|-------|
| Vendor Name | Plaid, Inc. |
| Service | Bank account connections |
| Contract Start | December 2024 |
| Data Processed | Bank account access tokens |
| Data Classification | Restricted |
| Business Criticality | Medium |

### Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| SOC 2 Type II | ✅ | Report available |
| ISO 27001 | ✅ | Certified |
| GDPR | ✅ | Compliant |

### Technical Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Encryption at rest | AES-256 | ✅ |
| Encryption in transit | TLS 1.2+ | ✅ |
| Token encryption | Application-level | ✅ |
| Webhook signatures | Available | ✅ |

### Access Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| MFA | Enforced | ✅ |
| API key management | Client ID + Secret | ✅ |
| Environment separation | Sandbox/Development/Production | ✅ |

### Data Handling

| Aspect | Details |
|--------|---------|
| Data residency | US |
| Token storage | Encrypted in Supabase Vault |
| Data minimization | Only balance/transaction data accessed |

### Soledgic Integration Security

| Control | Implementation |
|---------|----------------|
| Token storage | ✅ Supabase Vault (AES-256) |
| Token refresh | ✅ Automatic |
| Link token expiry | ✅ 4 hours |
| Webhook verification | ✅ Signature validation |

### Risk Assessment

**Overall Risk: 🟢 Low Risk**

| Risk | Mitigation |
|------|------------|
| Token compromise | Encrypted storage in Vault |
| Bank data exposure | Minimal data retention |
| Service outage | Non-critical path |

### Documents on File

- [x] SOC 2 Type II Report
- [x] Security whitepaper
- [x] Terms of Service
- [x] Privacy Policy

---

## Vendor Assessment: Resend

### Basic Information

| Field | Value |
|-------|-------|
| Vendor Name | Resend, Inc. |
| Service | Transactional email delivery |
| Contract Start | December 2024 |
| Data Processed | Email addresses (security alerts only) |
| Data Classification | Confidential |
| Business Criticality | Low |

### Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| SOC 2 Type II | ✅ | Report available |
| GDPR | ✅ | Compliant |

### Technical Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Encryption in transit | TLS 1.2+ | ✅ |
| API authentication | API key | ✅ |
| SPF/DKIM/DMARC | Supported | ✅ |

### Access Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| MFA | Available | ✅ |
| API key scoping | Domain-level | ✅ |
| Audit logging | Available | ✅ |

### Data Handling

| Aspect | Details |
|--------|---------|
| Data retention | 30 days |
| Email content | Security alerts only |
| PII exposure | Minimal (admin email only) |

### Risk Assessment

**Overall Risk: 🟢 Low Risk**

| Risk | Mitigation |
|------|------------|
| Email interception | TLS in transit |
| Spam/Phishing | SPF/DKIM/DMARC |
| Service outage | Alerts queue for retry |

### Documents on File

- [x] SOC 2 Type II Report
- [x] Terms of Service
- [x] Privacy Policy

---

## Vendor Assessment: Cloudflare (via Supabase)

### Basic Information

| Field | Value |
|-------|-------|
| Vendor Name | Cloudflare, Inc. |
| Service | CDN, DDoS protection, WAF |
| Contract Start | Via Supabase |
| Data Processed | HTTP requests (in transit) |
| Data Classification | Internal |
| Business Criticality | Critical |

### Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| SOC 2 Type II | ✅ | Report available |
| ISO 27001 | ✅ | Certified |
| PCI DSS | ✅ | Certified |
| GDPR | ✅ | Compliant |

### Technical Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| DDoS mitigation | Automatic | ✅ |
| WAF | Rule-based | ✅ |
| TLS termination | TLS 1.3 | ✅ |
| Bot protection | Available | ✅ |

### Risk Assessment

**Overall Risk: 🟢 Low Risk**

Cloudflare is a subprocessor of Supabase. Security controls are validated through Supabase's SOC 2 report.

---

## Vendor Review Schedule

| Vendor | Last Review | Next Review | Status |
|--------|-------------|-------------|--------|
| Supabase | Dec 2024 | Dec 2025 | ✅ Current |
| Upstash | Dec 2024 | Dec 2025 | ✅ Current |
| Stripe | Dec 2024 | Dec 2025 | ✅ Current |
| Plaid | Dec 2024 | Dec 2025 | ✅ Current |
| Resend | Dec 2024 | Dec 2025 | ✅ Current |
| Cloudflare | Dec 2024 | Dec 2025 | ✅ Current |

---

## New Vendor Onboarding Process

1. **Security Questionnaire** - Vendor completes security questionnaire
2. **Documentation Review** - Review SOC 2 report, DPA, policies
3. **Risk Assessment** - Evaluate based on data access and criticality
4. **Approval** - CEO approval required
5. **Contract Execution** - DPA and MSA signed
6. **Integration Review** - Security review of integration points
7. **Ongoing Monitoring** - Annual review cycle

---

## Vendor Offboarding Process

1. **Access Revocation** - Immediately revoke API keys and access
2. **Data Retrieval** - Export any necessary data
3. **Data Deletion** - Request deletion confirmation
4. **Documentation** - Update vendor inventory
5. **Post-Mortem** - Document reasons for offboarding

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 22, 2024 | Anita Osifo | Initial assessments |

---

**Approved by:**

Name: Anita Osifo  
Title: Founder & CEO  
Date: December 22, 2024
