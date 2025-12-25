# Double-Entry Accounting for Developers

*The 500-year-old algorithm every fintech engineer needs to understand*

---

You're a developer. You've built APIs, databases, distributed systems. But accounting? That's for the finance people.

Then you build a marketplace. And suddenly you're debugging why your numbers don't add up.

Turns out, accountants solved this problem in 1494. It's called double-entry bookkeeping.

---

## The Core Concept

Every transaction has two sides. Money doesn't appear or disappear—it moves.

When a customer pays you $100:
- Your cash goes UP by $100 (you received it)
- Something else changes by $100 (revenue, or liability if you owe it to someone)

**Every transaction affects at least two accounts, and the total debits must equal total credits.**

## Debits and Credits (The Simple Version)

Forget what you think these words mean. In accounting:

| Account Type | Increases With |
|--------------|----------------|
| Assets (cash, receivables) | Debit |
| Liabilities (payables, balances owed) | Credit |
| Revenue | Credit |
| Expenses | Debit |

The equation that must always balance:

```
Assets = Liabilities + Equity
```

## Example: Recording a Marketplace Sale

Your marketplace sells a $100 item. You take 20%, seller gets 80%.

```typescript
// What happens internally (conceptually)
const journalEntry = {
  entries: [
    { account: 'cash', type: 'debit', amount: 100 },           // Asset ↑
    { account: 'revenue', type: 'credit', amount: 20 },        // Revenue ↑
    { account: 'seller_balance', type: 'credit', amount: 80 }, // Liability ↑
  ]
};

// Debits: $100
// Credits: $20 + $80 = $100 ✓ Balanced
```

## Example: Paying Out a Seller

The seller withdraws their $80.

```typescript
const journalEntry = {
  entries: [
    { account: 'seller_balance', type: 'debit', amount: 80 },  // Liability ↓
    { account: 'cash', type: 'credit', amount: 80 },           // Asset ↓
  ]
};

// Debits: $80
// Credits: $80 ✓ Balanced
```

## Why This Matters

### Automatic Error Detection

If debits ≠ credits, something is wrong. You know immediately.

### Audit Trail

Every balance is the sum of transactions. You can always explain any number.

### Reports Are Free

- **Balance Sheet** = Sum of Asset, Liability, Equity accounts
- **P&L** = Sum of Revenue and Expense accounts

No custom queries. The reports emerge from the data structure.

---

## How Soledgic Handles This For You

You don't need to implement double-entry yourself. Soledgic does it automatically.

```typescript
import { Soledgic } from '@soledgic/sdk';

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY });

// You call this
await soledgic.recordSale({
  amount: 10000,        // $100.00 in cents
  creatorId: 'creator_123',
  platformFeePercent: 20,
});

// Soledgic creates balanced journal entries automatically:
// Debit:  Cash                 $100
// Credit: Revenue              $20
// Credit: Creator Balance      $80
```

Then get reports:

```typescript
const balanceSheet = await soledgic.getBalanceSheet();
// { assets: { cash: 10000 }, liabilities: { creatorBalances: 8000 }, ... }

const pnl = await soledgic.getProfitLoss({ 
  startDate: '2024-01-01', 
  endDate: '2024-12-31' 
});
// { revenue: 450000, expenses: 365000, netIncome: 85000 }

const trialBalance = await soledgic.getTrialBalance();
// { totalDebits: 1250000, totalCredits: 1250000, balanced: true }
```

You get the benefits of double-entry accounting without implementing it yourself.

**Accountants figured this out 500 years ago. Soledgic brings it to your API.**

[Start free →](https://soledgic.com)
