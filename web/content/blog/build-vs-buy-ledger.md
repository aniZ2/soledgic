# The Hidden Cost of Building Your Own Ledger

*Build vs buy: calculating the real engineering cost of DIY accounting*

---

Every technical founder has the same thought:

"Accounting? That's just addition and subtraction. I'll build it myself."

Six months later, you're debugging why a creator's balance is negative $47.32 and nobody knows how it got there.

---

## The Seductive Simplicity

It starts simple:

```typescript
// Day 1: "This is easy"
await prisma.user.update({
  where: { id: creatorId },
  data: { balance: { increment: saleAmount } }
});
```

Done. Ship it.

## When It Breaks

### Month 1: Refunds

Customer wants a refund. You subtract from the creator's balance. But wait—they already withdrew. Now their balance is negative.

```typescript
// "Uh oh"
await prisma.user.update({
  where: { id: creatorId },
  data: { balance: { decrement: refundAmount } }
});
// balance is now -$47.32
// Is that allowed? Who eats the loss?
```

You add a `pendingBalance` column.

### Month 2: Disputes

Stripe sends a chargeback notification. You need to reverse the transaction. But which transaction? You only have a balance, not a history.

You add a `transactions` table.

### Month 3: Partial Payments

A creator owes you $50 from a clawback. They make a sale for $30. Do you take the full $30?

You add a `holds` column. And a `clawbackBalance` column.

### Month 4: Reconciliation

Your database says you owe creators $45,000. Your bank has $42,000. Where's the $3,000?

You spend a week writing queries trying to reconcile.

### Month 6: The Rewrite

You realize you need double-entry accounting. A proper ledger.

You start over.

---

## The Real Cost

Let's be honest about what "building it yourself" actually costs:

| Item | Cost |
|------|------|
| Initial build | 2-4 weeks engineering time |
| First refactor (transactions table) | 1-2 weeks |
| Second refactor (proper ledger) | 4-8 weeks |
| Reconciliation debugging | 1-2 weeks/quarter |
| Edge case fixes | Ongoing forever |
| **Total Year 1** | **3-6 months engineering time** |

At $150k/year fully-loaded engineer cost, that's **$37,500 - $75,000** in engineering time.

For a ledger.

## The Ego Trap

The real reason founders build their own ledger isn't cost. It's ego.

"I'm a good engineer. I can build this."

Yes, you can. But should you?

You could also build your own database. Your own auth system. Your own payment processor. You don't, because those are solved problems.

Ledgers are solved problems too.

---

## How Soledgic Saves You 6 Months

Instead of building, integrate in an afternoon:

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// Record a sale
await soledgic.recordSale({
  amount: 10000,
  creatorId: 'creator_123',
  platformFeePercent: 20,
});

// Handle a refund
await soledgic.recordRefund({
  originalTransactionId: 'txn_xxx',
  amount: 10000,
});

// Get creator balance
const { balance } = await soledgic.getBalance({ creatorId: 'creator_123' });
```

Soledgic handles:
- Double-entry transactions ✓
- Audit trails ✓
- Concurrent balance updates ✓
- Refunds, disputes, partial payments ✓
- Reconciliation reports ✓
- Balance Sheet, P&L, Trial Balance ✓

Your engineers ship product. We handle the ledger.

**$49/month vs $75,000 in engineering time. Easy math.**

[Start free →](https://soledgic.com)
