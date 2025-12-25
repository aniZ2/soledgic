# Soledgic Architecture Principles

## The One Rule That Cannot Be Broken

> **Soledgic never blocks, authorizes, delays, or conditions payouts. It only records facts reported by external processors.**

Recording ≠ deciding. Keep that line bright red.

---

## What Soledgic Is

Soledgic is an internal accounting and audit ledger that records transactional events reported by third-party payment processors. It does not custody funds, perform payouts, collect tax identification information, or issue tax documents.

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

---

## Prohibited Actions 🚫

| Action | Why It's Dangerous |
|--------|-------------------|
| Block payout until X | You become part of money flow decisions |
| Hold funds internally | Implies custody |
| Release payout when admin approves | Authorization = liability |
| Maintain "user wallet balance" | Custody territory |
| Track "pending earnings" not in Stripe | Simulating what processor hasn't done |
| Require tax info before recording | Recording ≠ compliance enforcement |
| Enforce payout thresholds | That's Stripe's job |

**If Stripe hasn't done it, Soledgic shouldn't simulate it.**

---

## The Boundary That Matters

```
┌─────────────────────────────────────────────────────────────┐
│                         STRIPE                               │
│  • Moves money                                               │
│  • Collects tax info (W-9)                                   │
│  • Issues 1099s                                              │
│  • Enforces payout thresholds                                │
│  • KYC/AML compliance                                        │
│  • Blocks/approves payouts                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Events (webhooks)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        SOLEDGIC                              │
│  • Records what happened                                     │
│  • Maintains audit trail                                     │
│  • Generates reports                                         │
│  • Reconciles with Stripe                                    │
│  • Proves history                                            │
│  • NEVER decides, blocks, or holds                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Architecture Protects You

1. **No custody** → No money transmitter license needed
2. **No tax collection** → No PII breach risk
3. **No payout control** → No compliance obligations
4. **Pure recording** → Clean audit trail without liability

If an auditor asks:
> "Who controls payouts?"

Your answer:
> "Stripe. We record what they report."

If a regulator asks:
> "Where is tax information stored?"

Your answer:
> "With Stripe, our payment processor and merchant of record."

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

> **Soledgic is an internal accounting and audit ledger that records transactional events reported by third-party payment processors. It does not custody funds, perform payouts, collect tax identification information, or issue tax documents.**

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
