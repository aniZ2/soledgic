# Soledgic - Complete System Reference

> **Soledgic is a platform finance system that records transactions and can initiate payouts via external processors. It does not custody funds, and compliance remains with the payment rail.**

---

## What Soledgic Is

**Soledgic** is a B2B double-entry accounting API for creator platforms. It provides:

- **Immutable transaction history** - No edits, only reversals
- **Automatic revenue splits** - 80/20 (or custom) creator/platform splits
- **Multi-tenant architecture** - Each platform gets an isolated ledger
- **Audit-ready exports** - CSV/JSON reports for accountants
- **Stripe reconciliation** - Match ledger to payment processor

---

## What Soledgic Does NOT Do

| Does NOT | Why |
|----------|-----|
| Custody funds | Requires money transmitter obligations |
| Replace payment rails | Stripe or other rails execute settlement |
| Store raw tax IDs | High-risk PII should remain with processor |
| Bypass compliance | KYC/KYB and tax identity stay with rail |
| Claim outcomes not executed | We only record completed processor events |

**Recording ≠ deciding.** Soledgic is an evidence layer, not a compliance authority.

---

## Live Infrastructure

### Supabase Project
- **Project**: Soledgic
- **Region**: West US (Oregon)
- **Ref**: `<redacted>`
- **URL**: `https://YOUR_PROJECT.supabase.co`

### Example Ledger (Test Customer)
- **Ledger ID**: `<redacted>`
- **API Key**: `<redacted>`
- **Anon Key**: `<redacted>`

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `ledgers` | Multi-tenant platforms (one per customer) |
| `accounts` | Chart of accounts (cash, revenue, creator balances) |
| `transactions` | Immutable transaction headers |
| `entries` | Double-entry debit/credit lines |
| `payouts` | Payout event records |
| `audit_log` | Every API call logged |
| `webhook_events` | Outbound webhook tracking |

### Reporting Tables

| Table | Purpose |
|-------|---------|
| `creator_payout_summaries` | Annual aggregates per creator |
| `reconciliation_records` | Stripe vs ledger matching |
| `report_exports` | Audit trail of generated reports |
| `stripe_account_links` | Map creators to Stripe accounts |

### Account Types

When a ledger is created, these accounts are auto-created:

| Account Type | Purpose |
|--------------|---------|
| `cash` | Money in the bank (debit balance) |
| `platform_revenue` | Platform's cut (credit balance) |
| `creator_balance` | What you owe creators (credit/liability) |
| `creator_pool` | Aggregate creator liability |
| `processing_fees` | Payment processor fees |
| `tax_reserve` | Tax withholding reserve |
| `refund_reserve` | Reserved for potential refunds |

---

## API Endpoints

### Base URL
```
https://YOUR_PROJECT.supabase.co/functions/v1
```

### Authentication
Every request needs:
```
Authorization: Bearer {ANON_KEY}
x-api-key: {LEDGER_API_KEY}
Content-Type: application/json
```

### Endpoints

#### 1. Record Sale
**POST** `/record-sale`

Records a sale with automatic revenue split.

```json
{
  "reference_id": "stripe_pi_xxx",
  "creator_id": "author_123",
  "amount": 1999,
  "platform_fee_percent": 20
}
```

Response:
```json
{
  "success": true,
  "transaction_id": "uuid",
  "breakdown": {
    "total": 19.99,
    "creator_amount": 15.99,
    "platform_amount": 4.00
  }
}
```

Creates these ledger entries:
```
DEBIT  Cash           +$19.99  (money in)
CREDIT Creator        -$15.99  (liability to creator)
CREDIT Platform Rev   -$4.00   (your revenue)
```

---

#### 2. Get Balance
**GET** `/get-balance?creator_id=xxx`

Returns creator's current balance.

Response:
```json
{
  "success": true,
  "balance": {
    "creator_id": "author_123",
    "available": 11.99,
    "pending": 0,
    "total_earned": 11.99,
    "total_paid_out": 0,
    "currency": "USD"
  }
}
```

---

#### 3. Get All Balances
**GET** `/get-balance?include_platform=true`

Returns all creator balances + platform summary.

Response:
```json
{
  "success": true,
  "balances": [
    {"creator_id": "author_123", "available": 11.99, "pending": 0, "currency": "USD"}
  ],
  "platform_summary": {
    "total_revenue": 3.00,
    "total_owed_creators": 11.99,
    "total_paid_out": 0,
    "cash_balance": 14.99
  }
}
```

---

#### 4. Record Payout
**POST** `/process-payout`

Records a payout event from Stripe (does NOT initiate payouts).

```json
{
  "creator_id": "author_123",
  "amount": 1199,
  "payment_method": "stripe",
  "payment_reference": "tr_xxx",
  "status": "completed"
}
```

**⚠️ Key constraints:**
- `payment_reference` is **required** (must come from processor)
- `status` must be `completed` or `failed` (no pending states)

Creates these ledger entries (only for completed):
```
DEBIT  Creator        +$11.99  (reduce liability)
CREDIT Cash           -$11.99  (money out)
```

---

#### 5. Record Refund
**POST** `/record-refund`

Records a refund with configurable who-pays policy.

```json
{
  "original_sale_reference": "stripe_pi_xxx",
  "reason": "Customer requested refund",
  "refund_from": "both"
}
```

`refund_from` options:
- `both` - Proportional (creator and platform both lose their share)
- `platform_only` - Platform absorbs full refund (creator keeps earnings)
- `creator_only` - Creator absorbs full refund

---

#### 6. Reverse Transaction
**POST** `/reverse-transaction`

Creates a reversal entry (immutable ledger pattern - no edits).

```json
{
  "transaction_id": "uuid",
  "reason": "Duplicate entry correction"
}
```

---

#### 7. Get Transactions
**GET** `/get-transactions`

Query transaction history with filters.

Parameters:
- `creator_id` - Filter by creator
- `type` - sale, payout, refund, reversal
- `status` - completed, failed, reversed
- `start_date` / `end_date`
- `page` / `per_page`

---

#### 8. Export Report
**POST** `/export-report`

Generate CSV or JSON exports for accountants.

```json
{
  "report_type": "transaction_detail",
  "format": "csv",
  "start_date": "2025-01-01",
  "end_date": "2025-12-31"
}
```

Report types:
- `transaction_detail` - All transactions with entries
- `creator_earnings` - Current balances by creator
- `platform_revenue` - Sales with splits
- `payout_summary` - All payouts
- `reconciliation` - Reconciliation records
- `audit_log` - API call history

---

## Double-Entry Accounting

Every transaction creates balanced entries where **debits = credits**.

### Sale Example ($19.99, 80/20 split)
```
DEBIT  Cash / Bank        +$19.99  ← Money comes in
CREDIT Creator Balance    -$15.99  ← We owe creator (liability)
CREDIT Platform Revenue   -$4.00   ← Our revenue
                          -------
                          $0.00    ← Balanced
```

### Payout Example ($15.99 to creator)
```
DEBIT  Creator Balance    +$15.99  ← Reduce what we owe
CREDIT Cash / Bank        -$15.99  ← Money goes out
                          -------
                          $0.00    ← Balanced
```

### Refund Example ($19.99 refund, proportional)
```
CREDIT Cash / Bank        -$19.99  ← Money goes out
DEBIT  Creator Balance    +$15.99  ← Reduce liability
DEBIT  Platform Revenue   +$4.00   ← Reduce revenue
                          -------
                          $0.00    ← Balanced
```

---

## TypeScript SDK

Located in `/api/src/`

```typescript
import { soledgic } from '@soledgic/sdk'

const soledgic = new soledgic({
  apiKey: 'your_api_key',
  baseUrl: 'https://xxx.supabase.co/functions/v1'
})

// Record a sale
const sale = await soledgic.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'author_123',
  amount: 1999
})

// Get balance
const balance = await soledgic.getCreatorBalance('author_123')

// Export report
const report = await soledgic.exportReport({
  reportType: 'transaction_detail',
  format: 'json'
})
```

---

## File Structure

```
soledgic/
├── supabase/
│   ├── migrations/
│   │   ├── 20251218_initial_schema.sql      # Core tables
│   │   └── 20251219_reporting_reconciliation.sql  # Reporting tables
│   └── functions/
│       ├── record-sale/          # Record sales with split
│       ├── get-balance/          # Query balances
│       ├── get-transactions/     # Query history
│       ├── process-payout/       # Record payout events
│       ├── record-refund/        # Record refunds
│       ├── reverse-transaction/  # Immutable reversals
│       └── export-report/        # CSV/JSON exports
├── api/                          # TypeScript SDK
│   ├── src/
│   │   ├── index.ts
│   │   ├── client.ts
│   │   └── types.ts
│   └── examples/
│       └── booklyverse-integration.ts
├── docs/
│   ├── API.md                    # API reference
│   └── ARCHITECTURE_PRINCIPLES.md  # ⚠️ The rules
└── README.md
```

---

## Architecture Boundary

```
┌─────────────────────────────────────────────────────────────┐
│                         STRIPE                               │
│  • Moves money                                               │
│  • Collects W-9 / tax info                                   │
│  • Issues 1099s                                              │
│  • Enforces payout thresholds                                │
│  • KYC/AML compliance                                        │
│  • Blocks/approves payouts                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Webhooks / Events
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        SOLEDGIC                              │
│  • Records what happened                                     │
│  • Maintains audit trail                                     │
│  • Calculates revenue splits                                 │
│  • Generates reports                                         │
│  • Reconciles with Stripe                                    │
│  • NEVER decides, blocks, or holds                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Test Commands

```bash
# Record a sale
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/record-sale" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-api-key: <LEDGER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"reference_id": "test_002", "creator_id": "author_123", "amount": 999}'

# Get balance
curl "https://YOUR_PROJECT.supabase.co/functions/v1/get-balance?creator_id=author_123" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-api-key: <LEDGER_API_KEY>"

# Export transactions
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/export-report" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-api-key: <LEDGER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"report_type": "transaction_detail", "format": "json"}'
```

---

## Next Steps

1. **Integrate with Booklyverse** - Call soledgic from Stripe webhooks
2. **Build admin dashboard** - UI for viewing balances and exports
3. **Add Stripe reconciliation** - Auto-match Stripe payouts to ledger
4. **Production hardening** - Rate limiting, monitoring, backups

---

## The One Rule

> **Soledgic never custodies funds. It can initiate payouts via external processors and records outcomes reported by those rails.**

Recording ≠ deciding. Keep that line bright red.
