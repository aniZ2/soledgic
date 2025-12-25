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

```typescript
const realCash = bankBalance - totalSellerBalances;

// If this number goes negative, you've spent money that wasn't yours
```

Run this calculation daily.

## Float Timing Creates Complexity

| Event | Your Cash | Your Liability |
|-------|-----------|----------------|
| Customer pays $100 | +$100 | +$80 (owe seller) |
| Stripe takes $3 fee | -$3 | — |
| You pay seller $80 | -$80 | -$80 |
| Net position | +$17 | $0 |

Your revenue is $17. But for a few days, you were holding $100. Your books need to show that liability accurately.

---

## How Soledgic Tracks Float

Soledgic automatically separates your money from seller money:

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// Record a sale - Soledgic tracks the liability automatically
await soledgic.recordSale({
  amount: 10000,
  creatorId: 'seller_123',
  platformFeePercent: 20,
});

// See what you owe all sellers
const { totalOwed } = await soledgic.getTotalBalances();
// totalOwed: 400000 (in cents)

// See aged liabilities - who's been waiting longest?
const aging = await soledgic.getAPAging();
// {
//   current: 200000,      // 0-7 days
//   days8to14: 150000,
//   days15to30: 40000,
//   over30: 10000         // Red flag - why haven't these been paid?
// }
```

Your Balance Sheet shows the separation clearly:

```typescript
const balanceSheet = await soledgic.getBalanceSheet();
// {
//   assets: {
//     cash: 500000,              // What's in the bank
//   },
//   liabilities: {
//     sellerBalances: 400000,    // What you owe
//   },
//   equity: {
//     retainedEarnings: 100000,  // What's actually yours
//   }
// }
```

One API call. Real cash position. No spreadsheets.

**Know your float. Know your real money.**

[Start free →](https://soledgic.com)
