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
});
```

Simple. Clean. Ships fast.

## Why It's an Anti-Pattern

### Problem 1: No Audit Trail

The balance column only stores the current state. When you overwrite it, the previous state is gone.

```typescript
// "Why is my balance $247.83?"
const user = await prisma.user.findUnique({ where: { id: 'abc' } });
console.log(user.balance); // 247.83

// How did it get there? 🤷
// No way to know without a transaction log
```

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

## The Right Way: Transaction Log + Computed Balance

Instead of storing the balance, store the transactions. Calculate the balance when needed.

```typescript
// ❌ Don't do this
user.balance += amount;

// ✅ Do this instead
await prisma.transaction.create({
  data: {
    userId,
    amount,
    type: 'credit',
    reference: stripePaymentId,
    createdAt: new Date(),
  }
});

// Balance is computed
const balance = await prisma.transaction.aggregate({
  where: { userId },
  _sum: { amount: true }
});
```

Now you have:
- Full audit trail
- Every change recorded
- Timestamps for everything
- References to source systems

## But I Already Have a Balance Column

If you've already shipped this pattern, you're accumulating risk. Every day without an audit trail is a day you might lose money and not know why.

---

## How Soledgic Eliminates This Problem

Soledgic is built on double-entry accounting. There is no balance column to corrupt.

Every operation creates immutable transaction records:

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// Record a sale - creates immutable journal entries
await soledgic.recordSale({
  amount: 10000,
  creatorId: 'creator_123',
  platformFeePercent: 20,
  reference: 'stripe_pi_xxx',
});
```

The creator's balance is always computed from the transaction history.

When someone asks "why is my balance $247.83?":

```typescript
// Full audit trail
const transactions = await soledgic.getTransactions({
  creatorId: 'creator_123',
});

// Returns every transaction that affected this balance
// With timestamps, amounts, and references
transactions.forEach(tx => {
  console.log(`${tx.createdAt}: ${tx.type} $${tx.amount} - ${tx.description}`);
});
```

Full audit trail. No lost money. No 2 AM debugging sessions.

**The balance column is a lie. The transaction log is the truth.**

[Start free →](https://soledgic.com)
