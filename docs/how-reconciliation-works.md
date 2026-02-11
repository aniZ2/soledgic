# How Reconciliation Works in Soledgic

## What Is Reconciliation?

Reconciliation answers one question: **Does our internal ledger match external reality?**

- Stripe says you have $10,000 → Does your Cash account say $10,000?
- Bank shows a $5,000 deposit → Is it recorded in your ledger?
- You recorded 50 sales → Did Stripe process 50 charges?

---

## The Three Data Sources

| Source | What It Contains | How It Gets In |
|--------|------------------|----------------|
| **Stripe** | Charges, refunds, payouts, disputes | Webhooks (automatic) |
| **Bank** | Deposits, withdrawals, transfers | CSV import or Plaid (manual/automatic) |
| **Ledger** | Your accounting entries | API calls or webhook processing |

---

## Triple-Entry Verification

Every transaction in Soledgic has up to three records:

```
┌─────────────────────────────────────────────────────────────┐
│ ENTRY #1: Stripe's Record (Immutable)                       │
│ You cannot edit this. Stripe controls it.                   │
│ Stored in: stripe_events.raw_data                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ENTRY #2: Your Ledger (Internal)                            │
│ Created from Stripe webhook or API call.                    │
│ Stored in: transactions + entries tables                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ENTRY #3: Bank Statement (External)                         │
│ Your bank's record of the same money.                       │
│ Stored in: plaid_transactions                               │
└─────────────────────────────────────────────────────────────┘
```

**Why this matters:** If someone edits Entry #2 manually, Entries #1 and #3 will expose the discrepancy.

---

## Stripe Reconciliation

### Automatic (Webhooks)

When Stripe events arrive, Soledgic:
1. Stores raw event in `stripe_events`
2. Creates ledger entries in `transactions` + `entries`
3. Links them in `stripe_transactions` with `match_status: 'auto_matched'`

### What Gets Tracked

| Event | Ledger Action |
|-------|---------------|
| `charge.succeeded` | Debit Cash, Credit Revenue/Creator |
| `charge.refunded` | Reverse the original entry |
| `payout.paid` | Debit Bank, Credit Cash |
| `charge.dispute.created` | Move to Disputes Pending |
| `charge.dispute.closed` | Resolve (won = return, lost = expense) |

### Match Statuses

| Status | Meaning |
|--------|---------|
| `auto_matched` | Webhook created both Stripe record and ledger entry |
| `matched` | Manually linked to existing ledger transaction |
| `unmatched` | No corresponding ledger entry found |
| `excluded` | Intentionally ignored (e.g., test transaction) |
| `reviewed` | Reviewed by human, no action needed |

---

## Bank Reconciliation

### Import Methods

1. **Plaid** (automatic) - Connect bank account, transactions sync daily
2. **CSV Import** (manual) - Upload bank export file

### Supported Banks

Chase, Bank of America, Wells Fargo, Citi, Mercury, Relay, or any bank with CSV export.

### Deduplication

Every imported transaction gets a SHA-256 hash:
```
hash = SHA256(date + amount + description + reference + row_index)
```

Same transaction imported twice? Second import is skipped.

---

## The Payout ↔ Bank Deposit Problem

**The risk:** When Stripe sends money to your bank, you might record it twice:
1. Once from Stripe `payout.paid` webhook
2. Again when you import bank statement

**The solution:** Auto-matching by amount + date + description

```
Stripe payout: $5,000 on Jan 15
Bank deposit: $5,000 on Jan 17, description "STRIPE TRANSFER"
                    ↓
            AUTO-MATCHED
                    ↓
Bank transaction marked: is_stripe_payout = true
No duplicate ledger entry created
```

### Matching Rules

| Criteria | Rule |
|----------|------|
| Amount | Exact match (±$0.01) |
| Date | Within 3 days of Stripe's `arrival_date` |
| Description | Prefers "STRIPE" in description |

### Manual Linking

For edge cases:
```typescript
await soledgic.linkPayoutToBank(
  'stripe_txn_abc123',  // Stripe payout record
  'bank_txn_xyz789'     // Bank deposit record
)
```

---

## Health Checks

Daily automated checks verify:

| Check | What It Verifies |
|-------|------------------|
| Ledger Balance | Total debits = Total credits |
| Transaction Balance | Each transaction balances internally |
| Stripe Balance Sync | Cash account ≈ Stripe available balance |
| Bank Reconciliation Backlog | No old unmatched bank transactions |
| Stripe Reconciliation Backlog | No old unmatched Stripe transactions |
| Webhook Delivery | Outgoing webhooks succeeding |
| Pending Payouts | No payouts stuck for >7 days |
| Creator Balance Integrity | No impossible negative balances |

**Status levels:**
- `healthy` - All checks passed
- `warning` - Some checks need attention
- `critical` - Immediate action required (email alert sent)

---

## The Reconciliation Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  RECONCILIATION                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Bank] [Stripe]                                            │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Matched     │  │ Unmatched   │  │ Excluded    │         │
│  │     142     │  │      3      │  │      7      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Unmatched Transactions                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Jan 15  STRIPE TRANSFER      $5,000   [Match ▾]     │   │
│  │ Jan 12  ACH DEPOSIT          $1,234   [Match ▾]     │   │
│  │ Jan 10  WIRE FROM CLIENT     $8,500   [Match ▾]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## API Quick Reference

```typescript
// Run auto-matching for Stripe payouts
await soledgic.matchPayoutsToBank()
// { matched: 5, unmatched_payouts: 2, unmatched_deposits: 1 }

// View reconciliation status
await soledgic.getPayoutReconciliation()

// Run health check
await soledgic.runHealthCheck()
// { status: 'healthy', passed: 10, warnings: 0, failed: 0 }

// Import bank transactions
await soledgic.importTransactions({
  format: 'csv',
  data: base64EncodedFile
})
```

---

## Key Rules

1. **Never manually edit ledger entries** - Create reversing entries instead
2. **Match before importing** - Run payout matching after bank imports
3. **Review unmatched weekly** - Don't let backlog grow
4. **Trust external sources** - Stripe and bank records are your source of truth
5. **Health checks catch drift** - Run them daily (automated via cron)
