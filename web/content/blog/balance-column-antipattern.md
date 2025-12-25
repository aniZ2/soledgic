# The Balance Column Anti-Pattern

*How to design a scalable transaction database without losing money*

---

It's 2 AM. Your Slack is blowing up.

"My balance shows $0 but I had $500 yesterday."

You check the database. The balance column says 0. You check Stripe. The payments are there. Something happened, but you don't know what.

There's no audit trail. The balance column has been overwritten. The evidence is gone.

---

## How It Starts

Every developer does this:

```typescript
// The "simple" solution
await prisma.user.update({
  where: { id: userId },
  data: { balance: { increment: amount } }
})
```

Simple. Clean. Ships fast.

## Why It's an Anti-Pattern

### Problem 1: No Audit Trail

The balance column only stores the current state. When you overwrite it, the previous state is gone.

### Problem 2: Race Conditions

Two requests hit at the same millisecond. Both read $100. One writes $150. One writes $130.

Final balance: $130 (should be $180). You just lost $50.

### Problem 3: Reconciliation is Impossible

Your database says users have $45,000 in total balances. Your bank has $42,000.

Where's the $3,000? Without a transaction log, you'll never know.

### Problem 4: Disputes Are Unwinnable

A seller says: "You owe me $500. My records show I made five $100 sales."

You say: "Your balance is $0."

They say: "Prove it."

You can't.

---

## How Soledgic Eliminates This Problem

Soledgic is built on double-entry accounting. There is no balance column to corrupt. Balance is always computed from the transaction history.

### For Your Engineers

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// Record a sale - creates immutable journal entries
const sale = await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'creator_123',
  amount: 10000,
  productName: 'Premium Course',
})

// Get full transaction history for a creator
const transactions = await soledgic.getTransactions(
  '2024-01-01', 
  '2024-12-31', 
  'creator_123'
)
```

### The Soledgic Dashboard

When a creator asks "why is my balance $247.83?", your support team doesn't need engineering:

**Dashboard → Directory → Search Creator**
Type the creator's name or ID. Click to view their profile.

**Creator Profile → Transaction History**
See every transaction that affected their balance:
- Date and time
- Transaction type (sale, payout, refund, adjustment)
- Amount and running balance
- Reference ID (links to Stripe)

**Creator Profile → Balance Breakdown**
- Ledger Balance: Total earned minus payouts
- Held Amount: Funds in hold period
- Available Balance: What they can withdraw

**Dashboard → Audit**
For compliance, see who viewed what, when. Every action logged with:
- Timestamp
- User/API key
- IP address
- Action taken
- Entity affected

**Dashboard → Reconciliation**
Match your ledger to external systems:
- Link Soledgic transactions to Stripe transactions
- Identify unmatched items
- Mark as reviewed
- Full reconciliation workflow

No SQL queries. No engineering tickets. Full audit trail in seconds.

**The balance column is a lie. The transaction log is the truth.**

[Start free →](https://soledgic.com)
