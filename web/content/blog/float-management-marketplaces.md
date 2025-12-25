# Float Management for Marketplace Founders

*How to track restricted cash and know your real cash position*

---

Your marketplace just processed $500,000 this month. You feel rich.

Then you check your bank account: $500,000.

Then you remember: $400,000 of that belongs to your sellers.

You're not rich. You're holding other people's money.

---

## What Is Float?

Float is money that's in your account but isn't yours.

When a customer pays $100 for something on your marketplace:

- $80 goes to the seller (eventually)
- $20 is your platform fee
- But right now, all $100 is in your Stripe account

That $80 is float. It's a liability. You owe it to someone.

## Why Float Is Dangerous

Float feels like money. It shows up in your bank account. You can technically spend it.

Founders have gone to jail for spending float. It's called misappropriation of funds.

Even if you're not criminal about it, float causes problems:

**Cash Flow Illusion**

Your bank says $500k. You think you can hire two engineers. But $400k is owed to sellers. You actually have $100k.

**Reconciliation Nightmares**

"How much of this $500k is actually ours?" If you can't answer this instantly, you have a problem.

**Audit Failures**

Auditors will ask: "Show me your restricted cash." If you can't separate your money from seller money, you fail.

## The Float Formula

```
Real Cash = Bank Balance - Total Creator Balances
```

Run this calculation daily. If the number ever goes negative, you've spent money that wasn't yours.

---

## How Soledgic Tracks Float

### For Your Engineers

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// Record a sale - liability tracked automatically
await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'seller_123',
  amount: 10000,
})

// Get financial summary
const summary = await soledgic.getSummary()
// {
//   total_assets: 50000,
//   total_liabilities: 40000,  ← What you owe creators
//   total_revenue: 15000,
//   net_worth: 10000           ← What's actually yours
// }
```

### The Soledgic Dashboard

Your finance team sees float in real-time:

**Dashboard → Home (Summary View)**
The first thing you see when you log in:
- Total Assets
- Total Liabilities (what you owe creators)
- Net Worth (your actual money)
- Revenue and expenses

One glance tells you your real cash position.

**Dashboard → Directory**
See every creator's balance. Filter by balance amount to find who you owe the most. Sort by tier to see your biggest earners.

**Dashboard → Reports → Creator Earnings**
Full breakdown:
- What each creator earned
- What they've been paid out
- What you still owe them

Export to CSV for detailed analysis.

**Dashboard → Reports → Trial Balance**
Assets, liabilities, equity all listed. Verify the accounting equation holds:

```
Assets = Liabilities + Equity
```

If it doesn't balance, Soledgic shows a warning.

**Dashboard → Outflow**
Track every payout you've recorded. See pending vs. completed. Know exactly how much has left your account vs. how much is still owed.

No spreadsheets. No manual calculations. Real-time visibility into your cash position.

**Know your float. Know your real money.**

[Start free →](https://soledgic.com)
