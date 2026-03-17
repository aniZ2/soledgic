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

## Tiered Auto-Matching Engine

Auto-matching runs automatically on every import. It uses three passes from strict to fuzzy:

### Pass 1 — Exact Reference Match (99% confidence)

```
amount == amount
date == date
reference == reference (FITID, processor ID, etc.)
```

Deterministic. Catches payments with clear reference IDs.

### Pass 2 — Amount + Date Window (85% confidence)

```
amount == amount
date ± 3 days
not already matched
```

Catches most cases where the bank settles a day or two after the charge.

### Pass 3 — Fuzzy Description Match (70% confidence)

```
amount == amount
date ± 7 days
description ILIKE match (first 15-20 chars)
not already matched
```

Catches cases where description text partially overlaps (e.g. bank writes "STRIPE PAYOUT 1042" and ledger has "payout_batch_1042").

Each pass skips already-matched transactions. Confidence scores are stored in `bank_matches` for audit.

---

## The Payout ↔ Bank Deposit Problem

**The problem:** Stripe deposits $5,000 into your bank. That's not one transaction — it's 50+ charges minus refunds minus fees. No single ledger transaction matches $5,000.

**The solution:** Payout batch reconstruction.

```
Stripe payout: $5,000 on Jan 17
                    ↓
    reconstruct_payout_batch()
                    ↓
    Finds charges from Jan 3-17:
      $120 + $85 + $200 + ... = $5,230 (gross)
      - $30 refund
      - $200 fees
      = $5,000 (net)
                    ↓
    Matches to bank deposit: $5,000 on Jan 18
                    ↓
    payout_batch created, bank_transaction matched
```

### How It Works

The `reconstruct_payout_batch()` function:
1. Finds unlinked charges in the 14 days before the payout arrival date
2. Finds refunds in the same window
3. Computes: `fee = gross - refunds - net_amount`
4. Creates a `payout_batch` with `payout_batch_items`
5. Tries to match the net amount to an unmatched bank deposit (±$0.01, ±3 days)
6. Creates `transaction_links` edges (charge → payout batch)

---

## Transaction Graph

Every financial event is connected. Soledgic tracks these relationships in a directed graph:

```
Sale $100 (pi_abc)
  ├── Fee $2.90 (deducted)         link_type: fee
  ├── Refund $30 (re_xyz)          link_type: refund
  ├── Platform split $5            link_type: split
  └── Payout batch #42             link_type: payout_item
        └── Bank deposit $5,000    (matched via batch reconstruction)
```

### Link Types

| Type | Meaning | Example |
|------|---------|---------|
| `refund` | Refund → original sale | `re_xyz → pi_abc` |
| `fee` | Fee deduction → parent charge | `fee_001 → pi_abc` |
| `payout_item` | Charge → payout batch | `pi_abc → batch_42` |
| `dispute` | Dispute → original charge | `dp_001 → pi_abc` |
| `split` | Platform fee split → sale | `split_001 → pi_abc` |
| `reversal` | Reversal → reversed transaction | `rev_001 → txn_original` |

### Graph Traversal

`get_transaction_graph(transaction_id, ledger_id, max_depth)` recursively finds all connected transactions:

```sql
SELECT * FROM get_transaction_graph('txn_sale_001', 'ledger_001', 3);
-- Returns: sale → refund, sale → fee, sale → payout_batch → bank_deposit
```

### Auto-Linking

`autoLinkTransaction()` is called when refunds, reversals, or fee splits are created. Edges are populated automatically — no manual wiring needed.

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
// Returns: { format, row_count, preview, opening_balance, closing_balance }

// Import with balance verification + auto-matching
await soledgic.importTransactions({
  transactions: parsedTransactions,
  opening_balance: 10000,
  closing_balance: 9750.50,
  auto_match: true,  // runs tiered matching automatically
})
// Returns: { session_id, imported, matched, unmatched, balance: { verified, discrepancy } }

// View import history
await soledgic.getImportSessions()
// Returns: [{ file_name, format, row_count, matched_count, balance_verified, ... }]

// Reconstruct a payout batch from processor payout
await soledgic.reconstructPayoutBatch({
  processor_payout_id: 'po_abc123',
  arrival_date: '2026-03-15',
  net_amount: 5000.00,
})
// Returns: { batch_id, item_count, gross, fees, refunds, net, bank_matched }

// Traverse the transaction graph
await soledgic.getTransactionGraph(transactionId)
// Returns: [{ related_id, link_type, direction, depth }]

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
