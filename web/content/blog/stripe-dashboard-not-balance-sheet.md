# Why Your Stripe Dashboard Isn't a Balance Sheet

*How to get audit-ready financial reports for your marketplace*

---

You just closed your first $100k month. Stripe's dashboard shows the number. You screenshot it, post it to Twitter, and feel like you've made it.

Then your accountant asks for your Balance Sheet.

You send them the Stripe screenshot.

They sigh.

---

## What Stripe Actually Tracks

Stripe is a payment processor. It tracks:

- Money in (charges)
- Money out (payouts, refunds)
- Fees taken

That's it. Stripe is a cash register, not an accounting system.

## What a Balance Sheet Requires

A Balance Sheet answers: "What do we own, what do we owe, and what's left over?"

**Assets:**
- Cash (in bank, not just Stripe)
- Accounts Receivable (money owed to you)
- Prepaid expenses

**Liabilities:**
- Accounts Payable (money you owe)
- Creator balances (money you're holding for others)
- Deferred revenue (prepaid subscriptions)

**Equity:**
- Your actual profit after everything

Stripe knows none of this.

## The Dangerous Gap

Here's what happens when you treat Stripe as your books:

**Stripe says:** $100,000 processed this month

**Reality:**
- $80,000 is owed to creators (liability)
- $15,000 is your platform fee (revenue)
- $5,000 is Stripe's cut (expense)
- $3,000 is still pending payout (not in your bank yet)

Your actual revenue is $15,000. Stripe's $100,000 number is meaningless for accounting purposes.

## When This Breaks

**Scenario 1: Tax Time**

The IRS wants to know your revenue. You say "$100k." Your accountant says "no, that's gross merchandise volume." You actually made $15k.

**Scenario 2: Fundraising**

Investor asks for financial statements. You show Stripe. They ask for a Balance Sheet. You don't have one. Due diligence fails.

**Scenario 3: Creator Dispute**

A creator says you owe them $5,000. You check Stripe. You see transactions, but you can't prove what you actually owe them.

---

## How Soledgic Fixes This

Soledgic sits between Stripe and your accounting. When a sale happens:

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// In your Stripe webhook handler
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  
  if (event.type === 'payment_intent.succeeded') {
    const payment = event.data.object;
    
    // Record in Soledgic - automatically creates balanced journal entries
    await soledgic.recordSale({
      amount: payment.amount,
      creatorId: payment.metadata.creator_id,
      platformFeePercent: 20,
      reference: payment.id,
    });
  }
  
  res.json({ received: true });
});
```

Soledgic automatically:
- Records your platform fee as revenue
- Records the creator's share as a liability
- Updates the creator's balance
- Creates the audit trail

Then when you need reports:

```typescript
// Balance Sheet - what you own, owe, and have left
const balanceSheet = await soledgic.getBalanceSheet();

// P&L - revenue minus expenses
const pnl = await soledgic.getProfitLoss({ 
  startDate: '2024-01-01', 
  endDate: '2024-12-31' 
});

// What you owe each creator
const balances = await soledgic.getBalances();
```

Your accountant gets real financial statements. Your investors get audit-ready data.

**Stripe handles payments. Soledgic handles accounting.**

[Start free →](https://soledgic.com)
