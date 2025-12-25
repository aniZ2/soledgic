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

1. **Profit & Loss Statement** - Revenue minus expenses over time
2. **Trial Balance** - Proof your books are balanced
3. **Creator/Contractor Earnings** - Who you've paid and how much
4. **1099 Summary** - Tax compliance for payments over $600

If you can't produce these, the deal slows down. If they don't look right, the deal dies.

## Why Stripe Isn't Enough

The first thing founders do is export Stripe data.

The auditor will say: "This is payment processing data, not financial statements."

Stripe shows charges processed. It doesn't show assets vs. liabilities, revenue vs. deferred revenue, or your actual profit.

## What Auditors Look For

### Red Flags 🚩

- **No audit trail**: "How did this balance get here?" "I don't know."
- **Cash doesn't reconcile**: Books don't match bank.
- **Revenue includes money you owe others**: Creator funds counted as revenue.
- **No period locking**: Books can be changed retroactively.

### Green Flags ✅

- **Clean reconciliations**: Books match bank, documented.
- **Proper liability tracking**: You know what you owe creators.
- **Frozen periods**: Past months are locked and can't be modified.
- **Audit trail**: You can explain any number.

---

## How Soledgic Makes You Audit-Ready

### For Your Engineers

Pull any report programmatically:

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({ apiKey: process.env.SOLEDGIC_API_KEY })

// P&L for the year
const pnl = await soledgic.getProfitLoss('2024-01-01', '2024-12-31')

// Trial Balance
const trialBalance = await soledgic.getTrialBalance()

// Creator earnings
const earnings = await soledgic.getCreatorEarnings('2024-01-01', '2024-12-31')

// 1099 summary
const tax = await soledgic.get1099Summary(2024)

// Generate PDFs
const pnlPdf = await soledgic.getProfitLossPDF('2024-01-01', '2024-12-31')
```

### The Soledgic Dashboard

At 11 PM before the investor call, you don't need engineering. Open the dashboard:

**Dashboard → Reports → Profit & Loss**
1. Select date range (e.g., 2024-01-01 to 2024-12-31)
2. View revenue breakdown by category
3. View expenses breakdown
4. See net income
5. Click **PDF** or **CSV** to export

**Dashboard → Reports → Trial Balance**
- Every account with debit/credit balances
- Totals prove books balance
- "✓ Ledger is balanced" indicator
- Export for auditors

**Dashboard → Reports → Creator Earnings**
- Every creator listed
- What they earned
- What they were paid
- Current balance owed
- Tier information

**Dashboard → Reports → 1099 Summary**
- Tax year selector
- Who needs a 1099 (paid ≥ $600)
- W-9 status for each payee
- Export for tax filing

**Dashboard → Settings → Close Month**
Critical for audit compliance:
1. Click "Close Month"
2. Select the month to close
3. Soledgic runs balance check
4. Period locks - no changes allowed
5. Frozen statements generated

This shows auditors you have proper controls. Past periods can't be modified.

**Dashboard → Audit**
Every action logged:
- Who accessed what
- When
- From which IP
- What they did

Full audit trail for compliance.

### What You Send to Investors

1. Log into Soledgic dashboard
2. Go to Reports
3. Export P&L as PDF
4. Export Trial Balance as PDF
5. Attach to email

Total time: 5 minutes.

**Clean books signal operational excellence.**

[Start free →](https://soledgic.com)
