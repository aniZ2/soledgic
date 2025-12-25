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
})
```

Done. Ship it.

## When It Breaks

### Month 1: Refunds

Customer wants a refund. You subtract from the creator's balance. But wait—they already withdrew. Now their balance is negative.

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

---

## How Soledgic Saves You 6 Months

### For Your Engineers

Integrate in an afternoon:

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// Record a sale - handles the split automatically
const sale = await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'creator_123',
  amount: 10000, // cents
  processingFee: 300,
})

// Handle a refund with full reversal
await soledgic.reverseTransaction({
  transactionId: sale.transactionId,
  reason: 'Customer requested refund',
})

// Get creator balance (with held funds separated)
const balance = await soledgic.getCreatorBalance('creator_123')
```

### The Soledgic Dashboard

Your finance team gets a full dashboard without any engineering work:

**Dashboard → Inflow**
Every sale, automatically categorized. See gross amount, processing fees, creator share, and platform revenue at a glance. Filter by date range or creator.

**Dashboard → Outflow**
Track payouts you've recorded. See payout history by creator. Verify what's been paid vs. what's still owed.

**Dashboard → Directory**
Look up any creator. See their full transaction history, current balance, holds, and tier. No SQL queries. No engineering tickets.

**Dashboard → Reports**
- **Profit & Loss**: Revenue minus expenses, net income
- **Trial Balance**: Verify debits = credits
- **Creator Earnings**: What each creator earned and was paid
- **1099 Summary**: Tax compliance for payments over $600

**Dashboard → Reconciliation**
Match your ledger transactions to Stripe. Identify discrepancies. Mark items reviewed. Full audit workflow.

**Dashboard → Audit**
Every action logged. Who did what, when. IP addresses tracked. Full audit trail for compliance.

No more "can you pull this report?" Slack messages. Finance logs in and gets what they need.

**$49/month vs $75,000 in engineering time. Easy math.**

[Start free →](https://soledgic.com)
