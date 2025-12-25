# How to Pass Due Diligence Without an Accounting Team

*Preparing audit-ready financials for your Series A*

---

You're raising your Series A. The term sheet looks good. Then the VC says:

"We'll need to run due diligence. Please send over your financial statements."

You have a Stripe dashboard and a Google Sheet.

This is going to be a problem.

---

## What Investors Actually Ask For

During financial due diligence, you'll be asked for:

1. **Balance Sheet** - What you own, what you owe, what's left
2. **Profit & Loss Statement** - Revenue minus expenses over time
3. **Cash Flow Statement** - Cash in, cash out
4. **Accounts Receivable Aging** - Who owes you money
5. **Accounts Payable Aging** - Who you owe money
6. **Revenue Recognition Documentation** - How you count revenue

If you can't produce these, the deal slows down. If they don't look right, the deal dies.

## Why Stripe Isn't Enough

The first thing founders do is export Stripe data.

The auditor will say: "This is payment processing data, not financial statements."

Stripe shows charges processed. It doesn't show assets vs. liabilities, revenue vs. deferred revenue, or your actual profit.

## What Auditors Look For

### Red Flags 🚩

- **No audit trail**: "How did this balance get here?" "I don't know."
- **Cash doesn't reconcile**: Books don't match bank.
- **Revenue includes money you owe others**: Seller funds counted as revenue.
- **Round numbers everywhere**: Real accounting has cents.

### Green Flags ✅

- **Clean reconciliations**: Books match bank, documented.
- **Proper liability tracking**: You know what you owe sellers.
- **Aged receivables**: You track how old outstanding invoices are.
- **Audit trail**: You can explain any number.

## The Due Diligence Checklist

Before you go into due diligence, verify you can produce:

- [ ] Balance Sheet (as of last month end)
- [ ] P&L Statement (last 12 months, monthly)
- [ ] AR Aging Report
- [ ] AP Aging Report
- [ ] Bank reconciliation (last 3 months)

If you can't produce any of these in under an hour, you have a problem.

---

## How Soledgic Makes You Audit-Ready

Soledgic generates every report investors ask for:

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// Balance Sheet
const balanceSheet = await soledgic.getBalanceSheet();
// {
//   assets: { cash: 150000, accountsReceivable: 25000 },
//   liabilities: { accountsPayable: 10000, creatorBalances: 80000 },
//   equity: { retainedEarnings: 85000 }
// }

// P&L for the year
const pnl = await soledgic.getProfitLoss({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});
// { revenue: 450000, expenses: 365000, netIncome: 85000 }

// AR Aging - who owes you?
const arAging = await soledgic.getARAging();
// { current: 15000, days30: 5000, days60: 3000, days90plus: 2000 }

// AP Aging - who do you owe?
const apAging = await soledgic.getAPAging();
// { current: 60000, days30: 15000, days60: 5000, days90plus: 0 }

// Trial Balance - proves books are balanced
const trialBalance = await soledgic.getTrialBalance();
// { totalDebits: 1250000, totalCredits: 1250000, balanced: true }
```

Every transaction has an audit trail:

```typescript
// "Why is this creator's balance $247.83?"
const transactions = await soledgic.getTransactions({
  creatorId: 'creator_123',
});

// Returns every transaction with timestamps, amounts, and references
// Full audit trail for any balance
```

Your investors get clean financials. Your deal closes faster.

**Clean books signal operational excellence.**

[Start free →](https://soledgic.com)
