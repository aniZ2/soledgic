# Concurrency in Financial Systems

*How to prevent race conditions in payment and balance updates*

---

Your app works perfectly in development. Single user, single request at a time, everything adds up.

Then you launch. Traffic hits. Two requests arrive at the same millisecond.

Now a user is missing $50 and you don't know why.

---

## The Classic Race Condition

Here's the most common bug in financial software:

```typescript
// ❌ The dangerous pattern
async function addToBalance(userId: string, amount: number) {
  const user = await db.query('SELECT balance FROM users WHERE id = $1', [userId]);
  const newBalance = user.balance + amount;
  await db.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
}

// Two concurrent calls:
// Request A: reads balance = $100
// Request B: reads balance = $100
// Request A: writes $150
// Request B: writes $130 (overwrites A!)
// Final: $130 (should be $180)
```

You just lost $50. At scale, this happens constantly.

## Why It's Hard to Catch

Race conditions are non-deterministic:

- Most of the time, requests don't collide
- When they do, you lose money silently
- No error is thrown
- You only notice during reconciliation (if ever)

This bug can exist in production for months.

## The Insufficient Funds Race

Even worse than losing money: giving away money that doesn't exist.

```typescript
// ❌ Another dangerous pattern
async function withdraw(userId: string, amount: number) {
  const user = await db.query('SELECT balance FROM users WHERE id = $1', [userId]);
  
  if (user.balance >= amount) {
    await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
    return { success: true };
  }
  return { success: false, error: 'Insufficient funds' };
}

// Two concurrent $80 withdrawals from $100 balance:
// Request A: $100 >= $80? Yes ✓
// Request B: $100 >= $80? Yes ✓
// Request A: balance = $20
// Request B: balance = -$60 😱
```

Now you're owed $60 you'll never recover.

## Why Simple Fixes Don't Work

**Atomic increment?** Works for simple adds, but not for "check then debit."

**Mutex locks?** Don't scale across multiple servers.

**Optimistic locking?** Requires retry logic everywhere.

**Serializable transactions?** Massive performance hit.

The correct solution is architectural: use a proper ledger where balance is computed, not stored.

---

## How Soledgic Handles Concurrency

Soledgic uses double-entry accounting with database-level transaction integrity. Balances are computed from immutable transaction records, not stored in a mutable column.

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// ✅ Concurrent requests are safe
await Promise.all([
  soledgic.recordPayment({ creatorId: 'abc', amount: 5000 }),
  soledgic.recordPayment({ creatorId: 'abc', amount: 3000 }),
]);

// Both create separate transaction records
// Balance is computed: $50 + $30 = $80
// No race condition possible
```

For withdrawals with balance checks:

```typescript
// ✅ Atomic balance check + debit
const result = await soledgic.recordPayout({
  creatorId: 'abc',
  amount: 8000,
});

if (!result.success) {
  console.log(result.error); // "Insufficient funds: balance is $50"
}

// Soledgic checks computed balance atomically
// No double-spend possible
```

The system handles:
- Concurrent balance updates ✓
- Atomic insufficient funds checks ✓
- No lost transactions ✓
- Full audit trail ✓

You don't need to think about locking, retries, or race conditions. Soledgic handles it.

**The race condition that costs you money is the one you haven't found yet. Or you could just use infrastructure that prevents it.**

[Start free →](https://soledgic.com)
