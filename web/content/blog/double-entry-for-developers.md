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

Your marketplace sells a $100 item. You take 20%, creator gets 80%.

```
Journal Entry:
  Debit:  Cash                 $100  (Asset ↑)
  Credit: Platform Revenue     $20   (Revenue ↑)
  Credit: Creator Balance      $80   (Liability ↑)

Debits: $100
Credits: $20 + $80 = $100 ✓ Balanced
```

## Why This Matters

### Automatic Error Detection

If debits ≠ credits, something is wrong. You know immediately.

### Audit Trail

Every balance is the sum of transactions. You can always explain any number.

### Reports Are Free

Balance Sheet and P&L emerge naturally from the data structure.

---

## How Soledgic Handles This For You

You don't need to implement double-entry yourself. Soledgic does it automatically.

### For Your Engineers

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// You call this
await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'creator_123',
  amount: 10000, // $100 in cents
})

// Soledgic creates balanced journal entries automatically:
// Debit:  Cash                 $100
// Credit: Platform Revenue     $20
// Credit: Creator Balance      $80

// Verify books are balanced
const trialBalance = await soledgic.getTrialBalance()
// { accounts: [...], totals: { debits: 125000, credits: 125000, balanced: true } }
```

### The Soledgic Dashboard

Your finance team doesn't need to understand journal entries. The dashboard shows it all:

**Dashboard → Reports → Trial Balance**
The ultimate proof your books are correct:
- Every account with debit and credit columns
- Totals at the bottom
- Green "✓ Ledger is balanced" when debits = credits
- Red warning if something's wrong (but Soledgic prevents this)

**Dashboard → Reports → Profit & Loss**
Select a date range. See:
- Revenue (broken down by type)
- Expenses (broken down by category)
- Net Income

Export to PDF for your accountant.

**Dashboard → Reports → Creator Earnings**
What each creator:
- Earned (total sales)
- Was paid (payouts)
- Is owed (current balance)

**Dashboard → Settings → Close Month**
When you're ready to lock a period:
1. Click "Close Month"
2. Soledgic verifies everything balances
3. Period is locked - no more changes allowed
4. Frozen statements generated for auditors

This is real accounting compliance. Not a spreadsheet.

**Accountants figured this out 500 years ago. Soledgic brings it to your API and dashboard.**

[Start free →](https://soledgic.com)
