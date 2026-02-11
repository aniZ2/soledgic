# @soledgic/sdk

TypeScript SDK for Soledgic - Double-Entry Accounting for Creator Platforms.

## Installation

```bash
npm install @soledgic/sdk
# or
yarn add @soledgic/sdk
# or
pnpm add @soledgic/sdk
```

## Quick Start

```typescript
import { Soledgic } from '@soledgic/sdk'

const soledgic = new Soledgic({
  apiKey: 'your_api_key',
  baseUrl: 'https://your-project.supabase.co/functions/v1'
})

// Record a sale with automatic 80/20 split
const sale = await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'author_123',
  amount: 1999, // $19.99 in cents
})

console.log(sale.breakdown)
// { total: 19.99, creatorAmount: 15.99, platformAmount: 4.00 }
```

## API Reference

### Initialize Client

```typescript
import { Soledgic } from '@soledgic/sdk'

const soledgic = new Soledgic({
  apiKey: 'your_api_key',           // Required
  baseUrl: 'https://...',           // Your Supabase functions URL
  timeout: 30000,                   // Request timeout (ms)
})
```

### Record a Sale

```typescript
const sale = await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',     // Your external sale ID
  creatorId: 'author_123',          // Creator receiving funds
  amount: 1999,                     // Amount in cents
  currency: 'USD',                  // Optional, default: USD
  platformFeePercent: 20,           // Optional, override default
  description: 'Book purchase',     // Optional
  metadata: { bookId: 'abc' }       // Optional
})

// Response
{
  success: true,
  transactionId: 'uuid',
  breakdown: {
    total: 19.99,
    creatorAmount: 15.99,
    platformAmount: 4.00
  }
}
```

### Get Creator Balance

```typescript
const balance = await soledgic.getCreatorBalance('author_123')

// Response
{
  success: true,
  balance: {
    creatorId: 'author_123',
    available: 150.00,      // Can be paid out
    pending: 25.00,         // In processing
    totalEarned: 500.00,    // Lifetime earnings
    totalPaidOut: 325.00,   // Lifetime payouts
    currency: 'USD'
  }
}
```

### Get All Balances

```typescript
const { balances, platformSummary } = await soledgic.getAllBalances({
  includePlatform: true
})

// Response
{
  success: true,
  balances: [
    { creatorId: '123', available: 150.00, pending: 0, currency: 'USD' },
    { creatorId: '456', available: 75.50, pending: 0, currency: 'USD' }
  ],
  platformSummary: {
    totalRevenue: 500.00,
    totalOwedCreators: 225.50,
    totalPaidOut: 1000.00,
    cashBalance: 2500.00
  }
}
```

### Process Payout

```typescript
const payout = await soledgic.processPayout({
  creatorId: 'author_123',
  paymentMethod: 'finix',           // 'finix' | 'stripe' | 'bank_transfer' | 'manual'
  amount: 10000,                    // Optional, in cents (default: full balance)
  paymentReference: 'tr_xxx',       // Your external payment ID
})

// Response
{
  success: true,
  payoutId: 'uuid',
  transactionId: 'uuid',
  amount: 100.00,
  status: 'pending'
}
```

### Record Refund

```typescript
const refund = await soledgic.recordRefund({
  originalSaleReference: 'stripe_pi_xxx',
  reason: 'Customer requested refund',
  amount: 999,                      // Optional, partial refund in cents
  refundFrom: 'both',               // 'both' | 'platform_only' | 'creator_only'
  externalRefundId: 're_xxx'        // Your refund ID
})

// Response
{
  success: true,
  transactionId: 'uuid',
  refundedAmount: 9.99,
  breakdown: {
    fromCreator: 7.99,
    fromPlatform: 2.00
  }
}
```

### Reverse Transaction

For corrections (immutable ledger pattern - creates offsetting entries):

```typescript
const reversal = await soledgic.reverseTransaction({
  transactionId: 'uuid-xxx',
  reason: 'Duplicate entry correction',
  partialAmount: 500                // Optional, partial reversal in cents
})

// Response
{
  success: true,
  reversalId: 'uuid',
  originalTransactionId: 'uuid-xxx',
  reversedAmount: 5.00
}
```

### Get Transactions

```typescript
const { transactions, pagination } = await soledgic.getTransactions({
  creatorId: 'author_123',          // Optional filter
  type: 'sale',                     // Optional: sale, payout, refund, reversal
  status: 'completed',              // Optional: pending, completed, failed, reversed
  startDate: '2025-01-01',          // Optional
  endDate: '2025-12-31',            // Optional
  page: 1,
  perPage: 50,
  includeEntries: true              // Include debit/credit details
})

// Response
{
  success: true,
  transactions: [{
    id: 'uuid',
    transactionType: 'sale',
    referenceId: 'stripe_pi_xxx',
    amount: 19.99,
    status: 'completed',
    createdAt: '2025-12-18T10:00:00Z',
    entries: [
      { entryType: 'debit', amount: 19.99, account: { name: 'Cash' } },
      { entryType: 'credit', amount: 15.99, account: { name: 'Creator 123' } },
      { entryType: 'credit', amount: 4.00, account: { name: 'Platform Revenue' } }
    ]
  }],
  pagination: {
    total: 150,
    page: 1,
    perPage: 50,
    totalPages: 3
  }
}
```

## Error Handling

```typescript
import { Soledgic, SoledgicError, ValidationError, NotFoundError } from '@soledgic/sdk'

try {
  await soledgic.recordSale({ ... })
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Invalid request:', error.message)
  } else if (error instanceof NotFoundError) {
    console.log('Not found:', error.message)
  } else if (error instanceof SoledgicError) {
    console.log(`Error ${error.statusCode}:`, error.message)
  }
}
```

### Error Types

| Error | Status | Description |
|-------|--------|-------------|
| `ValidationError` | 400 | Invalid request parameters |
| `AuthenticationError` | 401 | Invalid API key |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Duplicate or already processed |
| `SoledgicError` | * | Base error class |

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  RecordSaleRequest,
  RecordSaleResponse,
  CreatorBalance,
  Transaction,
  // ... etc
} from '@soledgic/sdk'
```

## License

MIT
