# How Money Flows in Soledgic

## The Core Principle

Every dollar that moves through your platform creates balanced ledger entries. Money in = Money out. Always.

---

## The Three Money Events

### 1. Sale (Money In)

When a customer pays:

```
Customer pays $100 via Stripe
├── Stripe takes $3.20 fee
├── Creator gets 80% of net ($77.44)
└── Platform keeps 20% of net ($19.36)
```

**Ledger entries created:**

| Account | Debit | Credit |
|---------|-------|--------|
| Cash (Stripe Balance) | $100.00 | |
| Processing Fees | $3.20 | |
| Creator Balance | | $77.44 |
| Platform Revenue | | $19.36 |
| **Total** | **$103.20** | **$103.20** |

> Note: Debits = Credits. Always balanced.

### 2. Payout (Money Out to Creator)

When you pay a creator:

```
Creator requests $500 payout
├── Deduct from their balance
└── Transfer to their bank
```

**Ledger entries:**

| Account | Debit | Credit |
|---------|-------|--------|
| Creator Balance | $500.00 | |
| Cash | | $500.00 |

### 3. Stripe Payout (Money Out to Your Bank)

When Stripe deposits to your bank:

```
Stripe sends $10,000 to your bank
├── Leaves Stripe balance
└── Arrives in bank account
```

**Ledger entries:**

| Account | Debit | Credit |
|---------|-------|--------|
| Bank Account | $10,000 | |
| Cash (Stripe Balance) | | $10,000 |

---

## Account Types

| Type | Normal Balance | Purpose |
|------|----------------|---------|
| `cash` | Debit | Money held in Stripe |
| `bank` | Debit | Money in your bank |
| `revenue` | Credit | Your earnings (standard mode) |
| `platform_revenue` | Credit | Your cut (marketplace mode) |
| `creator_balance` | Credit | What you owe creators |
| `processing_fees` | Debit | Stripe/payment fees |
| `disputes_pending` | Debit | Money held for disputes |

---

## Standard vs Marketplace Mode

**Standard Mode** (consulting, SaaS):
- All revenue goes to one account
- No creator splits
- Simple: Cash in → Revenue

**Marketplace Mode** (creator platforms):
- Revenue splits automatically
- Each creator has their own balance account
- Complex: Cash in → Split → Creator Balance + Platform Revenue

Set via `ledger.mode`:
```typescript
await soledgic.createLedger({
  businessName: 'Booklyverse',
  mode: 'marketplace',
  defaultSplitPercent: 80 // Creator gets 80%
})
```

---

## The Money Flow Diagram

```
                    CUSTOMER
                        │
                        │ pays $100
                        ▼
                ┌───────────────┐
                │    STRIPE     │
                │  (processor)  │
                └───────┬───────┘
                        │
                        │ webhook: charge.succeeded
                        ▼
                ┌───────────────┐
                │   SOLEDGIC    │
                │   (ledger)    │
                └───────┬───────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │  Cash   │    │ Creator │    │Platform │
   │ $96.80  │    │ Balance │    │ Revenue │
   │         │    │ $77.44  │    │ $19.36  │
   └─────────┘    └────┬────┘    └─────────┘
                       │
                       │ payout request
                       ▼
                ┌───────────────┐
                │   CREATOR'S   │
                │     BANK      │
                └───────────────┘
```

---

## Key Rules

1. **Every transaction balances** - Debits always equal credits
2. **Nothing is deleted** - Corrections create reversing entries
3. **External proof exists** - Every entry links to Stripe webhook or bank record
4. **Creator balances are liabilities** - You owe this money until paid out

---

## API Quick Reference

```typescript
// Record a sale with split
await soledgic.recordSale({
  amount: 10000, // $100.00 in cents
  creatorId: 'creator_123',
  description: 'Ebook purchase'
})

// Pay a creator
await soledgic.createPayout({
  creatorId: 'creator_123',
  amount: 50000 // $500.00
})

// Check creator balance
const balance = await soledgic.getCreatorBalance('creator_123')
// { available: 77.44, pending: 0, lifetime: 1542.88 }
```
