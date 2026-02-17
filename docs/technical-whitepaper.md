# Soledgic Technical Whitepaper
## Audit-Ready Accounting Infrastructure for Creator Platforms

**Version:** 1.0  
**Last Updated:** December 2024  
**Classification:** Customer-Facing

---

## Executive Summary

Soledgic is programmable accounting infrastructure designed for platforms that collect money and pay creators. This document details how Soledgic maintains ledger integrity, handles sensitive data, and ensures your business is audit-ready from day one.

**Key Claims:**
- Every transaction is cryptographically linked to external proof (Payment Processor, bank records)
- Ledger entries cannot be silently modified—all changes create audit trails
- Daily automated health checks verify internal records match external reality
- Tax documents are generated automatically for creators earning $600+

---

## 1. Ledger Architecture

### 1.1 Double-Entry Accounting

Every money movement in Soledgic creates balanced journal entries:

```
Sale: $100.00
├── Debit:  Cash                 $100.00
├── Debit:  Processing Fees        $3.20
├── Credit: Creator Balance       $77.44
└── Credit: Platform Revenue      $19.36
            ─────────────────────────────
            Debits: $103.20 = Credits: $103.20 ✓
```

**Guarantee:** The sum of all debits always equals the sum of all credits. This is enforced at the database level.

### 1.2 Triple-Entry Verification

Each transaction has up to three independent records:

| Entry | Source | Mutability |
|-------|--------|------------|
| **Entry 1** | Payment processor (Payment Processor) | Immutable—controlled by Payment Processor |
| **Entry 2** | Soledgic ledger | Append-only—changes create reversals |
| **Entry 3** | Bank statement | Immutable—controlled by bank |

**Benefit:** If any party tampers with Entry 2, Entries 1 and 3 expose the discrepancy.

### 1.3 Immutability Model

Soledgic never deletes or overwrites financial records:

| Action | How It's Handled |
|--------|------------------|
| Correct an error | Create reversing entry, then new entry |
| Void a transaction | Status changes to `voided`, entries remain |
| Refund a sale | New `refund` transaction with opposite entries |

**Audit Trail:** Every change is logged with timestamp, actor, and reason.

---

## 2. Data Integrity

### 2.1 Period Locking

At month-end, periods can be "closed":

1. Trial balance snapshot is computed
2. SHA-256 hash of all transactions is generated
3. Period is locked—no modifications allowed

```
Period: November 2024
Status: LOCKED
Hash: 8f4a2b1c9e3d...
Snapshot: { assets: 45000, liabilities: 12000, equity: 33000 }
```

**Guarantee:** If anyone claims November's numbers were different, the hash proves otherwise.

### 2.2 Daily Health Checks

Automated verification runs daily:

| Check | What It Verifies |
|-------|------------------|
| Ledger Balance | Total debits = Total credits |
| Transaction Integrity | Each transaction balances internally |
| Payment Processor Sync | Cash account ≈ Payment Processor available balance |
| Bank Reconciliation | No stale unmatched transactions |
| Creator Balances | No impossible negative balances |

**Alert System:** Critical failures trigger email notifications within minutes.

### 2.3 Reconciliation

Soledgic automatically matches:
- Payment Processor charges → Ledger sales
- Payment Processor payouts → Bank deposits
- Bank transactions → Ledger records

**Match Criteria:**
- Amount (exact, ±$0.01)
- Date (within 3 business days)
- Reference IDs when available

**Unmatched items** are flagged for human review—nothing is silently ignored.

---

## 3. Data Security

### 3.1 Data Classification

| Data Type | Classification | Storage |
|-----------|---------------|---------|
| Transaction amounts | Business data | Encrypted at rest |
| Bank account numbers | Sensitive PII | Tokenized via Bank Feed |
| TIN/SSN/EIN | Highly sensitive PII | Encrypted, access-logged |
| API keys | Secret | Hashed, never displayed after creation |

### 3.2 Access Control

| Layer | Mechanism |
|-------|-----------|
| API | Per-ledger API keys |
| Database | Row-level security (RLS) |
| Dashboard | Email + password, session tokens |
| Webhooks | Signature verification (Payment Processor, Bank Feed) |

### 3.3 Infrastructure

- **Database:** Supabase (PostgreSQL) with automatic backups
- **Edge Functions:** Deno runtime, stateless
- **Hosting:** SOC 2 Type II compliant infrastructure
- **Encryption:** TLS 1.3 in transit, AES-256 at rest

### 3.4 Third-Party Integrations

| Service | Data Shared | Security |
|---------|-------------|----------|
| Payment Processor | Webhook events only | Signature verification |
| Bank Feed | Bank credentials (tokenized) | OAuth, never stored by Soledgic |
| Resend | Email addresses only | TLS, no PII in body |

---

## 4. Tax Compliance

### 4.1 1099 Generation

Soledgic automatically:
1. Tracks gross payments per creator
2. Identifies creators exceeding $600 threshold
3. Generates IRS-compliant 1099-K forms
4. Provides monthly breakdowns for Box 5

### 4.2 Tax Information Collection

W-9 equivalent data collected:
- Legal name and business name
- TIN (SSN or EIN)
- Tax classification
- Address
- Electronic certification with timestamp and IP

### 4.3 Limitations

Soledgic **prepares** tax documents but does **not**:
- E-file with the IRS
- Validate TINs against IRS database
- Provide tax advice
- Calculate backup withholding

**Recommendation:** Use a tax professional or filing service (Tax1099.com, Track1099) for submission.

---

## 5. Audit Support

### 5.1 What Auditors Can Access

| Report | Contents |
|--------|----------|
| Trial Balance | All account balances at any point in time |
| General Ledger | Complete transaction history |
| Transaction Detail | Individual transaction with all entries |
| Source Documents | Raw Payment Processor webhooks, bank import records |
| Reconciliation Status | Matched vs. unmatched items |

### 5.2 Export Formats

- PDF (human-readable reports)
- CSV (for spreadsheet analysis)
- JSON (for programmatic access)

### 5.3 Audit Trail Query

Every question an auditor might ask:
- "Show me all transactions for Creator X in Q3" ✓
- "Prove this $5,000 deposit matches a Payment Processor payout" ✓
- "When was this entry created and by whom?" ✓
- "What was the account balance on March 15?" ✓

---

## 6. Disaster Recovery

### 6.1 Backup Schedule

| Type | Frequency | Retention |
|------|-----------|-----------|
| Full database | Daily | 30 days |
| Point-in-time | Continuous | 7 days |
| Transaction logs | Real-time | 90 days |

### 6.2 Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Database failure | < 1 hour | < 5 minutes |
| Region outage | < 4 hours | < 1 hour |
| Complete rebuild | < 24 hours | < 24 hours |

### 6.3 Data Portability

Customers can export their complete ledger at any time:
- All transactions and entries
- All source documents
- All tax documents
- All audit logs

**No lock-in:** Your data is always yours.

---

## 7. Compliance Posture

### 7.1 Current Status

| Framework | Status |
|-----------|--------|
| SOC 2 Type II | Infrastructure provider certified |
| GDPR | Compliant (EU data handling) |
| CCPA | Compliant (CA privacy rights) |
| PCI DSS | Not applicable (no card data stored) |

### 7.2 Roadmap

| Q1 2025 | Q2 2025 |
|---------|---------|
| TIN encryption upgrade | SOC 2 Type II (Soledgic-specific) |
| Penetration testing | HIPAA BAA (if required) |

---

## 8. Service Level Agreement

### 8.1 Availability

| Tier | Uptime Target | Support Response |
|------|---------------|------------------|
| Pro | 99.5% | 24 hours |
| Business | 99.9% | 4 hours |
| Scale | 99.95% | 1 hour |

### 8.2 Data Processing

| Operation | Expected Latency |
|-----------|------------------|
| Record sale | < 200ms |
| Generate report | < 5 seconds |
| Health check | < 30 seconds |
| 1099 generation (batch) | < 5 minutes |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Ledger** | Isolated accounting environment for one business |
| **Transaction** | A complete accounting event (sale, refund, payout) |
| **Entry** | One line of a transaction (debit or credit) |
| **Creator** | Entity receiving revenue splits (author, artist, etc.) |
| **Reconciliation** | Process of matching internal records to external sources |
| **Period Lock** | Freezing a month to prevent retroactive changes |

---

## Appendix B: Contact

**Technical Questions:** support@soledgic.com  
**Security Issues:** security@soledgic.com  
**Sales:** sales@soledgic.com

---

*This document is provided for informational purposes. For binding commitments, refer to the Master Service Agreement and Terms of Service.*
