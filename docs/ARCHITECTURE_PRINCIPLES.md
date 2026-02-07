# Soledgic Architecture Principles

## The One Rule That Cannot Be Broken

> **Soledgic never custodies funds. Money movement is executed by external processors. Soledgic can initiate payouts and record outcomes, but rails handle compliance and settlement.**

Recording ≠ deciding. Keep that line bright red.

---

## What Soledgic Is

Soledgic is a platform finance system: a double-entry ledger plus payment orchestration. It does not custody funds. Payouts and compliance (KYC/KYB, tax identity) are handled by external processors; Soledgic can initiate payouts and record outcomes, and may generate exports for tax workflows.

---

## Allowed Actions ✅

| Action | Example |
|--------|---------|
| Record completed event | "Stripe payout completed" → record |
| Record failed event | "Stripe payout failed" → record |
| Mirror external balances | "Creator balance per Stripe" → mirror |
| Generate reports | "Export earnings report" → generate |
| Verify consistency | "Reconcile Stripe vs ledger" → verify |
| Track history | "Show all transactions for creator" → query |
| Initiate payout | "Execute payout via Stripe" → instruct |

---

## Prohibited Actions 🚫

| Action | Why It's Dangerous |
|--------|-------------------|
| Custody funds | Requires money transmitter obligations |
| Override processor compliance | KYC/KYB and tax identity must remain with processor |
| Store raw tax IDs | High-risk PII outside processor scope |
| Bypass processor settlement rules | Settlement is the rail's responsibility |

**If a processor hasn't executed it, Soledgic shouldn't claim it happened.**

---

## The Boundary That Matters

```
┌─────────────────────────────────────────────────────────────┐
│                         STRIPE                               │
│  • Moves money                                               │
│  • Collects tax info (W-9)                                   │
│  • Issues 1099s (or provides source data)                    │
│  • Enforces payout thresholds                                │
│  • KYC/AML compliance                                        │
│  • Final settlement                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Events (webhooks)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        SOLEDGIC                              │
│  • Initiates payouts and records outcomes                    │
│  • Maintains audit trail                                     │
│  • Generates reports and exports                             │
│  • Reconciles with Stripe                                    │
│  • Proves history                                            │
│  • NEVER custodies funds                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Architecture Protects You

1. **No custody** → No money transmitter license needed
2. **Processor compliance** → KYC/KYB and tax identity stay with the rail
3. **Separation of concerns** → Clear audit trail and reliable settlement
4. **Single source of truth** → Finance and ops see accurate, reconcilable data

If an auditor asks:
> "Who controls payouts?"

Your answer:
> "Stripe executes payouts. We initiate and record them."

If a regulator asks:
> "Where is tax information stored?"

Your answer:
> "With Stripe (or the configured rail). We do not store raw tax IDs."

---

## Optional Trust Enhancers (Safe)

These add credibility without crossing the line:

- **Daily ledger hash** - Prove no tampering
- **Stripe webhook signature verification** - Prove authenticity
- **Export fingerprints** - Hash of every CSV/PDF generated
- **Read-only attestation snapshots** - Point-in-time proofs

These add trust, not obligation.

---

## The Sentence (Use Everywhere)

For docs, audits, investor decks, legal reviews:

> **Soledgic is a platform finance system that records transactions and can initiate payouts via external processors. It does not custody funds, and compliance remains with the payment rail.**

---

## Code Review Checklist

Before merging any PR, verify:

- [ ] Does this feature record events or make decisions?
- [ ] Does this block/delay/condition any payout?
- [ ] Does this store SSN, EIN, or tax forms?
- [ ] Does this create a "pending" state not from Stripe?
- [ ] Does this enforce any threshold or requirement?

If any answer is YES → reject or refactor.

---

## Summary

| Soledgic IS | Soledgic IS NOT |
|------------|----------------|
| Evidence layer | Decision layer |
| Audit trail | Compliance enforcer |
| Record keeper | Fund custodian |
| Report generator | Tax filer |
| Reconciliation tool | Payment processor |

Stay in the left column. Forever.
