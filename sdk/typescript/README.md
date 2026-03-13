# Soledgic

Financial infrastructure for digital platforms. Treasury-grade ledger API with custodial wallets, automatic revenue splits, preflight authorization, and full accounting compliance.

## Installation

```bash
npm install @soledgic/sdk
```

## Quick Start

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic({
  apiKey: 'sk_live_your_api_key',
  baseUrl: 'https://your-project.supabase.co/functions/v1',
  apiVersion: '2026-03-01',
})

// === MARKETPLACE MODE ===

// Hosted checkout session (buyer enters card on hosted page)
const session = await ledger.createCheckout({
  amount: 2999, // $29.99 in cents
  creatorId: 'author_123',
  productName: 'Book purchase',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
})
// → { checkoutUrl, sessionId, mode: 'session', ... }

// Direct charge (when you already have the buyer's payment instrument)
const checkout = await ledger.createCheckout({
  amount: 2999,
  creatorId: 'author_123',
  paymentMethodId: 'PIxxxxxxx',
  idempotencyKey: 'order_123',
})
// → { paymentId, provider, status, ... }

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

`createCheckout` supports two modes: **session** (omit `paymentMethodId`, provide `successUrl`) or **direct** (provide `paymentMethodId` + `idempotencyKey`).

### Standard Functions

| Method | Description |
|--------|-------------|
| `recordIncome(req)` | Record business income |
| `recordExpense(req)` | Record business expense |

### Wallets

| Method | Description |
|--------|-------------|
| `getWalletBalance(userId)` | Get wallet balance (0 if none) |
| `walletDeposit(req)` | Deposit funds into user wallet |
| `walletWithdraw(req)` | Withdraw funds from user wallet |
| `walletTransfer(req)` | Transfer between user wallets |
| `getWalletHistory(userId, opts?)` | Paginated transaction history |

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
