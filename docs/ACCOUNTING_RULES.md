# Soledgic Accounting Rules

These rules are explicit and enforced. They protect the integrity of the ledger.

---

## 1. Transaction Finality & Period Locking

### Accounting Periods
- Periods can be `monthly`, `quarterly`, or `annual`
- Each period has a status: `open` → `closing` → `closed` → `locked`

### The Rule
> **Once a period is closed, transactions in that period may not be created or reversed directly. Only correcting entries in an open period are allowed.**

### What This Means
- If December 2025 is closed, you cannot insert a transaction dated December 15, 2025
- Instead, create a correcting entry dated January 2026 (the current open period)
- The correction must reference the original transaction and include a reason

### Why This Matters
- Auditors expect closed periods to be immutable
- Prevents accidental (or intentional) historical manipulation
- Required for proper revenue recognition
- Investor diligence will check for this

---

## 2. Idempotency Contract

### The Rule
> **Every write endpoint must support idempotency. If `reference_id` (or `idempotency_key`) already exists for this ledger, Soledgic returns the existing record without mutation.**

### Explicit Behavior
```
POST /record-sale {reference_id: "processor_pi_123", ...}
→ First call: Creates transaction, returns {success: true, transaction_id: "abc"}

POST /record-sale {reference_id: "processor_pi_123", ...}
→ Second call: Returns {success: false, error: "Duplicate reference_id", transaction_id: "abc"}
```

### Idempotency Keys
- Stored in `idempotency_keys` table
- Include request hash for verification
- Expire after 24 hours (configurable)
- Scoped per ledger (same key can exist in different ledgers)

### Why This Matters
- Payment Processor webhooks retry on failure
- Network issues cause duplicate requests
- Distributed systems need this guarantee
- Prevents double-charging customers

---

## 3. Correction Semantics

### Allowed Correction Types

| Type | When to Use | Creates |
|------|-------------|---------|
| `reversal` | Full undo of a transaction | Opposite entries |
| `adjustment` | Partial correction | New entries with difference |
| `replacement` | Void and recreate | Reversal + new transaction |
| `reclassification` | Move between accounts | Transfer entries |

### Required Fields for Corrections

Every correction transaction must include:
- `correction_type` - One of the types above
- `correction_reason_code` - Standard codes:
  - `duplicate_entry`
  - `incorrect_amount`
  - `incorrect_account`
  - `incorrect_period`
  - `customer_dispute`
  - `fraud_correction`
  - `system_error`
  - `other`
- `correction_reason_detail` - Human-readable explanation
- `reverses` - UUID of original transaction (for reversals)

### The Chain
```
Original Transaction (id: abc)
    ↓
Reversal Transaction (id: def, reverses: abc)
    ↓
Original Transaction updated (reversed_by: def, status: 'reversed')
```

### Why This Matters
- Proves intentional correction, not tampering
- Audit trail shows what happened and why
- Accountants can trace every change
- Demonstrates proper accounting hygiene

---

## 4. Trial Balance & Integrity

### The Equation
> **Assets = Liabilities + Equity**

Or in our simplified model:
> **Debits = Credits**

### The Heartbeat Endpoint

`GET /trial-balance` answers:
- Does this ledger balance?
- What are all account balances right now?
- How many transactions/entries exist?
- When was the last activity?

### Response Structure
```json
{
  "success": true,
  "totals": {
    "total_debits": 1499.00,
    "total_credits": 1499.00,
    "difference": 0.00,
    "is_balanced": true
  },
  "integrity": {
    "is_balanced": true,
    "account_count": 7,
    "transaction_count": 15,
    "entry_count": 45,
    "last_transaction_at": "2025-12-19T04:45:56Z"
  }
}
```

### Snapshots
Request with `?snapshot=true` to create a permanent, hashed record:
- Stores all balances as JSON
- Creates SHA256 hash for tamper detection
- Links to previous snapshot (chain integrity)
- Used for period close and audits

### When to Check
- After every batch of transactions
- Before closing a period
- During reconciliation
- When something seems wrong
- For investor/auditor reporting

---

## 5. Double-Entry Enforcement

### The Rule
> **Every transaction must have entries where total debits equal total credits.**

### How It's Enforced
1. Trigger updates account balances on entry insert
2. Running balance stored on each entry
3. Trial balance can be checked at any time
4. Period close captures verified snapshot

### If Imbalanced
An imbalanced ledger indicates:
- Bug in the code (entries not created correctly)
- Direct database manipulation (bad)
- Data corruption (very bad)

Response: Investigate immediately. Do not close the period.

---

## Summary of Rules

| Rule | Enforcement |
|------|-------------|
| Closed periods are immutable | Trigger blocks inserts in closed periods |
| Idempotency guaranteed | Duplicate reference_id returns existing record |
| Corrections require metadata | Schema requires type, reason code, reference |
| Ledger must balance | Trial balance endpoint, period close verification |
| Entries are immutable | No UPDATE on entries table, only INSERT |
| Transactions are immutable | No UPDATE except for reversal linking |

---

## Code Checklist

Before any PR:
- [ ] Does this respect period locking?
- [ ] Is idempotency handled for retries?
- [ ] Do corrections include reason codes?
- [ ] Are entries balanced (debits = credits)?
- [ ] Is there an audit log entry?
