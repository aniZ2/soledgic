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

Soledgic sits between Stripe and your accounting. Your backend records sales, Soledgic handles the double-entry accounting.

### For Your Engineers

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// In your Stripe webhook handler
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  
  if (event.type === 'payment_intent.succeeded') {
    const payment = event.data.object
    
    await soledgic.recordSale({
      referenceId: payment.id,
      creatorId: payment.metadata.creator_id,
      amount: payment.amount, // in cents
      processingFee: payment.application_fee_amount,
    })
  }
  
  res.json({ received: true })
})
```

### The Soledgic Dashboard

Your finance team doesn't need to write code. They open the dashboard:

**Dashboard → Inflow**
See all sales as they come in. Filter by date, creator, or product. Every transaction shows the split: gross amount, processing fee, creator share, platform revenue.

**Dashboard → Directory**
Look up any creator. See their current balance, transaction history, tier, and custom split percentage. Answer "how much do we owe Jane?" in 5 seconds.

**Dashboard → Reports → Profit & Loss**
Real P&L statement. Revenue minus expenses. Net income. Filter by any date range. Export to PDF or CSV for your accountant.

**Dashboard → Reports → Trial Balance**
Proof your books balance. Total debits = total credits. Green checkmark means you're good. Red warning means something's wrong.

**Dashboard → Reconciliation**
Match Soledgic transactions to your Stripe transactions. Identify discrepancies. Mark items as reviewed. Full reconciliation workflow.

No spreadsheets. No "ask engineering to pull a report." Real-time financial data.

**Stripe handles payments. Soledgic handles accounting.**

[Start free →](https://soledgic.com)
