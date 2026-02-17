# Soledgic

Double-entry accounting API for any business. Works for marketplaces (revenue splits) and standard businesses (income/expense tracking).

## Installation

```bash
npm install @soledgic/sdk
```

## Quick Start

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic('sk_live_your_api_key')

// === MARKETPLACE MODE ===

// Create a hosted checkout session
const checkout = await ledger.createCheckout({
  amount: 2999, // $29.99 in cents
  creatorId: 'author_123',
  productName: 'Book purchase',
  customerEmail: 'reader@example.com',
})
// → { checkoutUrl, paymentId, provider, ... }

// Record a sale with automatic split
const sale = await ledger.recordSale({
  referenceId: 'order_123',
  creatorId: 'author_123',
  amount: 2999,  // $29.99 in cents
  processingFee: 117,
})
// → { creatorAmount: 23.06, platformAmount: 5.76, withheld: 2.31 }

// Pay a creator
const payout = await ledger.processPayout({
  referenceId: 'payout_001',
  creatorId: 'author_123',
  amount: 2000,
})
// → { previousBalance: 20.75, newBalance: 0.75 }

// === STANDARD MODE ===

// Record income
await ledger.recordIncome({
  referenceId: 'inv_001',
  amount: 500000,  // $5000
  description: 'Consulting - Project Alpha',
  category: 'services',
})

// Record expense
await ledger.recordExpense({
  referenceId: 'exp_001',
  amount: 15000,  // $150
  description: 'Office supplies',
  category: 'office',
  paidFrom: 'credit_card',
})

// === REPORTS ===

const pnl = await ledger.getProfitLoss('2024-01-01', '2024-12-31')
const balance = await ledger.getTrialBalance()
const summary = await ledger.get1099Summary(2024)
```

## API Reference

### Marketplace Functions

| Method | Description |
|--------|-------------|
| `createCheckout(req)` | Create hosted checkout payment |
| `recordSale(req)` | Record sale with automatic split |
| `processPayout(req)` | Pay a creator |
| `listTiers()` | Get all tiers |
| `getEffectiveSplit(creatorId)` | Get creator's current split |
| `setCreatorSplit(creatorId, percent)` | Set custom split |
| `clearCreatorSplit(creatorId)` | Remove custom split |
| `autoPromoteCreators()` | Promote based on earnings |

### Standard Functions

| Method | Description |
|--------|-------------|
| `recordIncome(req)` | Record business income |
| `recordExpense(req)` | Record business expense |

### Balances

| Method | Description |
|--------|-------------|
| `getAllBalances()` | All account balances |
| `getCreatorBalances()` | Creator balances with holds |
| `getCreatorBalance(id)` | Single creator detail |
| `getSummary()` | Assets, liabilities, P&L |

### Reports

| Method | Description |
|--------|-------------|
| `getProfitLoss(start, end)` | Income statement |
| `getTrialBalance(asOf)` | Account balances |
| `get1099Summary(year)` | Contractor payments |
| `getCreatorEarnings(start, end)` | Creator report |
| `getTransactions(start, end, creatorId?)` | Transaction history |

## Error Handling

```typescript
import { Soledgic, SoledgicError } from '@soledgic/sdk'

try {
  await ledger.processPayout({ ... })
} catch (error) {
  if (error instanceof SoledgicError) {
    console.log(error.message)  // "Insufficient balance..."
    console.log(error.status)   // 400
  }
}
```

## Features

- **Dual Mode**: Marketplace (splits) or Standard (simple income/expense)
- **Auto Splits**: 5-tier priority system (request → creator → product → tier → default)
- **Withholding**: Tax reserves, refund buffers with auto-release
- **Full Audit Trail**: Every action logged
- **CPA-Ready Reports**: P&L, Trial Balance, 1099
