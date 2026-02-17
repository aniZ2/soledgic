# Booklyverse + Soledgic Integration

## Installation

```bash
cd /path/to/booklyverse
npm install /Users/osifo/Desktop/soledgic/sdk/typescript
# Or when published: npm install @soledgic/sdk
```

## Setup

Create `lib/soledgic.ts`:

```typescript
import Soledgic from '@soledgic/sdk'

export const soledgic = new Soledgic(process.env.SOLEDGIC_API_KEY!)
```

Add to `.env`:
```
SOLEDGIC_API_KEY=sk_live_booklyverse_xxx
```

## Integration Points

### 1. Payment Processor Webhook (After Payment Success)

In your Payment Processor webhook handler:

```typescript
// app/api/webhooks/processor/route.ts
import { soledgic } from '@/lib/soledgic'

export async function POST(req: Request) {
  const event = processor.webhooks.constructEvent(...)

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object

    // Record the sale in Soledgic
    const sale = await soledgic.recordSale({
      referenceId: pi.id,                           // Payment Processor payment ID
      creatorId: pi.metadata.author_id,             // Your author ID
      amount: pi.amount_received,                   // Amount in cents
      processingFee: Math.round(pi.amount * 0.029 + 30), // Payment Processor fee
      productId: pi.metadata.book_id,
      productName: pi.metadata.book_title,
    })

    console.log('Sale recorded:', sale.breakdown)
    // { creatorAmount: 23.99, platformAmount: 5.99, withheldAmount: 2.40 }
  }

  return new Response('OK')
}
```

### 2. Author Payout (After Connected Accounts Transfer)

```typescript
// app/api/payouts/process/route.ts
import { soledgic } from '@/lib/soledgic'
import Payment Processor from 'processor'

export async function POST(req: Request) {
  const { authorId, amount } = await req.json()

  // 1. Check available balance first
  const balance = await soledgic.getCreatorBalance(authorId)
  
  if (balance.available_balance < amount / 100) {
    return Response.json({ error: 'Insufficient balance' }, { status: 400 })
  }

  // 2. Execute Connected Accounts transfer
  const transfer = await processor.transfers.create({
    amount,
    currency: 'usd',
    destination: author.processor_account_id,
  })

  // 3. Record in Soledgic
  const payout = await soledgic.processPayout({
    referenceId: transfer.id,
    creatorId: authorId,
    amount,
    payoutMethod: 'processor_connect',
  })

  return Response.json({ 
    success: true, 
    newBalance: payout.newBalance 
  })
}
```

### 3. Author Dashboard (Show Balance)

```typescript
// app/dashboard/earnings/page.tsx
import { soledgic } from '@/lib/soledgic'

export default async function EarningsPage({ params }) {
  const authorId = params.authorId
  
  const balance = await soledgic.getCreatorBalance(authorId)
  
  return (
    <div>
      <h1>Your Earnings</h1>
      <div className="stats">
        <div>
          <label>Available</label>
          <span>${balance.available_balance.toFixed(2)}</span>
        </div>
        <div>
          <label>Held (14-day buffer)</label>
          <span>${balance.held_amount.toFixed(2)}</span>
        </div>
        <div>
          <label>Total Earned</label>
          <span>${balance.ledger_balance.toFixed(2)}</span>
        </div>
      </div>
      
      {balance.holds.map(hold => (
        <div key={hold.reason}>
          ${hold.amount} held until {hold.release_date}
        </div>
      ))}
    </div>
  )
}
```

### 4. Admin Reports

```typescript
// app/admin/reports/page.tsx
import { soledgic } from '@/lib/soledgic'

export default async function ReportsPage() {
  const [pnl, creators, summary] = await Promise.all([
    soledgic.getProfitLoss('2025-01-01', '2025-12-31'),
    soledgic.getCreatorEarnings('2025-01-01', '2025-12-31'),
    soledgic.getSummary(),
  ])

  return (
    <div>
      <h1>Financial Reports</h1>
      
      <section>
        <h2>Profit & Loss</h2>
        <p>Revenue: ${pnl.revenue.total}</p>
        <p>Expenses: ${pnl.expenses.total}</p>
        <p>Net Income: ${pnl.net_income}</p>
      </section>

      <section>
        <h2>Creator Payouts</h2>
        <table>
          {creators.creators.map(c => (
            <tr key={c.creator_id}>
              <td>{c.name}</td>
              <td>${c.total_earned}</td>
              <td>${c.total_paid}</td>
              <td>${c.balance}</td>
            </tr>
          ))}
        </table>
      </section>

      <section>
        <h2>Balance Sheet</h2>
        <p>Assets: ${summary.totalAssets}</p>
        <p>Liabilities: ${summary.totalLiabilities}</p>
        <p>Net Worth: ${summary.netWorth}</p>
      </section>
    </div>
  )
}
```

### 5. 1099 Tax Export

```typescript
// app/admin/tax/page.tsx
import { soledgic } from '@/lib/soledgic'

export default async function TaxPage() {
  const report = await soledgic.get1099Summary(2025)

  return (
    <div>
      <h1>1099 Summary - {report.tax_year}</h1>
      <p>{report.summary.requiring_1099} authors need 1099s</p>
      
      <table>
        <thead>
          <tr>
            <th>Author</th>
            <th>Total Paid</th>
            <th>1099 Required</th>
          </tr>
        </thead>
        <tbody>
          {report.payees.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>${p.total_paid}</td>
              <td>{p.requires_1099 ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

## Key Points

1. **Every sale goes through Payment Processor first** - Soledgic records, not processes
2. **Payouts happen in Connected Accounts** - Soledgic tracks the accounting
3. **80/20 split is automatic** - Configure tiers in Soledgic dashboard
4. **14-day refund buffer** - Already configured in Booklyverse ledger
5. **Real-time balances** - Authors see accurate available amounts
