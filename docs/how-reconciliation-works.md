# How Reconciliation Works in Soledgic

## What Is Reconciliation?

Reconciliation answers one question: **Does our internal ledger match external reality?**

- Payment Processor says you have $10,000 → Does your Cash account say $10,000?
- Bank shows a $5,000 deposit → Is it recorded in your ledger?
- You recorded 50 sales → Did Payment Processor process 50 charges?

---

## The Three Data Sources

| Source | What It Contains | How It Gets In |
|--------|------------------|----------------|
| **Payment Processor** | Charges, refunds, payouts, disputes | Webhooks (automatic) |
| **Bank** | Deposits, withdrawals, transfers | File import (CSV, OFX, QFX, CAMT.053, BAI2, MT940) |
| **Ledger** | Your accounting entries | API calls or webhook processing |

---

## Triple-Entry Verification

Every transaction in Soledgic has up to three records:

```
┌─────────────────────────────────────────────────────────────┐
│ ENTRY #1: Payment Processor's Record (Immutable)            │
│ You cannot edit this. Payment Processor controls it.        │
│ Stored in: processor_events.raw_data                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ENTRY #2: Your Ledger (Internal)                            │
│ Created from Payment Processor webhook or API call.         │
│ Stored in: transactions + entries tables                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ENTRY #3: Bank Statement (External)                         │
│ Your bank's record of the same money.                       │
│ Stored in: bank_transactions                                │
└─────────────────────────────────────────────────────────────┘
```

**Why this matters:** If someone edits Entry #2 manually, Entries #1 and #3 will expose the discrepancy.

---

## Payment Processor Reconciliation

### Automatic (Webhooks)

When Payment Processor events arrive, Soledgic:
1. Stores raw event in `processor_events`
2. Creates ledger entries in `transactions` + `entries`
3. Links them in `processor_transactions` with `match_status: 'auto_matched'`

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
| `auto_matched` | Webhook created both Payment Processor record and ledger entry |
| `matched` | Manually linked to existing ledger transaction |
| `unmatched` | No corresponding ledger entry found |
| `excluded` | Intentionally ignored (e.g., test transaction) |
| `reviewed` | Reviewed by human, no action needed |

---

## Bank Reconciliation

### Supported File Formats

Soledgic's universal ingestion layer accepts bank exports in any of these formats:

| Format | Description | Typical Source |
|--------|-------------|----------------|
| **CSV** | Comma-separated values | Any bank (Chase, BofA, Wells Fargo, Mercury, Relay, etc.) |
| **OFX/QFX** | Open Financial Exchange | US bank download (Quicken format) |
| **CAMT.053** | ISO 20022 XML bank statement | European/international banks, SWIFT |
| **BAI2** | Cash management reporting | US commercial/business banks |
| **MT940** | SWIFT bank statement | International banks |

All formats are auto-detected — just upload the file and Soledgic identifies the format automatically.

### How Import Works

```
Bank export file (any format)
         │
    Auto-detect format
         │
    Format-specific parser
         │
    Normalized transactions
    { date, amount, description, reference }
         │
    Deduplication check
         │
    bank_transactions table
         │
    Auto-match engine
```

### Deduplication

Every imported transaction gets a fingerprint:

```
if FITID exists (OFX/QFX)
    reference = FITID (bank's unique transaction ID)

fingerprint = SHA256(date + amount + description + reference + account_name + row_index)
stored as: provider_transaction_id = "import_<fingerprint>"
```

Same transaction imported twice? Second import is skipped. Overlapping statement date ranges are safe.

### Bank Template Matching (CSV only)

For CSV files, Soledgic auto-detects the bank from column headers:

| Bank | Key Headers |
|------|-------------|
| Chase | `Posting Date`, `Description`, `Amount` |
| Bank of America | `Date`, `Description`, `Amount` |
| Wells Fargo | Positional (no headers) |
| Mercury | `Date`, `Description`, `Amount` |
| Relay | `Date`, `Description`, `Amount`, `Account Name`, `Reference` |

Unknown CSV formats fall back to a generic mapper or manual column mapping.

---

## The Payout ↔ Bank Deposit Problem

**The risk:** When Payment Processor sends money to your bank, you might record it twice:
1. Once from Payment Processor `payout.paid` webhook
2. Again when you import bank statement

**The solution:** Auto-matching by amount + date + description

```
Payment Processor payout: $5,000 on Jan 15
Bank deposit: $5,000 on Jan 17, description "PROCESSOR TRANSFER"
                    ↓
            AUTO-MATCHED
                    ↓
Bank transaction marked: is_processor_payout = true
No duplicate ledger entry created
```

### Matching Rules

Auto-matching uses `auto_match_bank_aggregator_transaction(txn_id)`, a rule-based function driven by the `auto_match_rules` table:

| Criteria | Rule |
|----------|------|
| Amount | Exact match (±$0.01) |
| Date | Within 3 days of Payment Processor's `arrival_date` |
| Description | Prefers processor keywords in description |

---

## Health Checks

Daily automated checks verify:

| Check | What It Verifies |
|-------|------------------|
| Ledger Balance | Total debits = Total credits |
| Transaction Balance | Each transaction balances internally |
| Payment Processor Balance Sync | Cash account ≈ Payment Processor available balance |
| Bank Reconciliation Backlog | No old unmatched bank transactions |
| Payment Processor Reconciliation Backlog | No old unmatched Payment Processor transactions |
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
│  [Bank] [Payment Processor]                                 │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Matched     │  │ Unmatched   │  │ Excluded    │         │
│  │     142     │  │      3      │  │      7      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  Unmatched Transactions                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Jan 15  PROCESSOR TRANSFER   $5,000   [Match ▾]     │   │
│  │ Jan 12  ACH DEPOSIT          $1,234   [Match ▾]     │   │
│  │ Jan 10  WIRE FROM CLIENT     $8,500   [Match ▾]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## API Quick Reference

```typescript
// Parse and preview a bank export file (any format)
await soledgic.parseImportFile({
  format: 'auto',  // auto-detects: csv, ofx, qfx, camt053, bai2, mt940
  data: base64EncodedFile
})

// Import parsed transactions
await soledgic.importTransactions({
  transactions: parsedTransactions
})

// Run auto-matching for Payment Processor payouts
await soledgic.matchPayoutsToBank()
// { matched: 5, unmatched_payouts: 2, unmatched_deposits: 1 }

// View reconciliation status
await soledgic.getPayoutReconciliation()

// Run health check
await soledgic.runHealthCheck()
// { status: 'healthy', passed: 10, warnings: 0, failed: 0 }
```

---

## Key Rules

1. **Never manually edit ledger entries** - Create reversing entries instead
2. **Match before importing** - Run payout matching after bank imports
3. **Review unmatched weekly** - Don't let backlog grow
4. **Trust external sources** - Payment Processor and bank records are your source of truth
5. **Health checks catch drift** - Run them daily (automated via cron)
