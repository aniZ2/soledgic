# Soledgic - Complete System Reference

> Migration note (March 12, 2026): the canonical public treasury API is now resource-first: `/v1/participants`, `/v1/wallets`, `/v1/transfers`, `/v1/holds`, `/v1/checkout-sessions`, `/v1/payouts`, and `/v1/refunds`. If older command-style examples appear below, treat them as historical or lower-level references, not the supported public contract. See `docs/RESOURCE_MODEL_MIGRATION.md`.

> Operator note: shared identity, ecosystem management, and fixture-cleanup tooling live in the dashboard control plane and are documented separately in `docs/OPERATOR_CONTROL_PLANE.md`.

> **Soledgic is a platform finance system that records transactions and can initiate payouts via external processors. It does not custody funds, and compliance remains with the payment rail.**

---

## What Soledgic Is

**Soledgic** is a B2B double-entry accounting API for creator platforms. It provides:

- **Immutable transaction history** - No edits, only reversals
- **Automatic revenue splits** - 80/20 (or custom) creator/platform splits
- **Multi-tenant architecture** - Each platform gets an isolated ledger
- **Audit-ready exports** - CSV/JSON reports for accountants
- **Payment Processor reconciliation** - Match ledger to payment processor

---

## What Soledgic Does NOT Do

| Does NOT | Why |
|----------|-----|
| Custody funds | Requires money transmitter obligations |
| Replace payment rails | Payment Processor or other rails execute settlement |
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
- **URL**: `https://api.soledgic.com`

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
| `reconciliation_records` | Payment Processor vs ledger matching |
| `report_exports` | Audit trail of generated reports |
| `processor_account_links` | Map creators to Payment Processor accounts |

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
https://api.soledgic.com/v1
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
  "reference_id": "processor_pi_xxx",
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

#### 2. Get Participant Balance
**GET** `/participants/{participant_id}`

Returns a participant's current balance.

Response:
```json
{
  "success": true,
  "participant": {
    "id": "author_123",
    "available_balance": 11.99,
    "held_amount": 0,
    "ledger_balance": 11.99,
    "tier": "starter"
  }
}
```

---

#### 3. List Participant Balances
**GET** `/participants`

Returns all participant balances.

Response:
```json
{
  "success": true,
  "participants": [
    {"id": "author_123", "available_balance": 11.99, "held_amount": 0, "ledger_balance": 11.99, "tier": "starter"}
  ]
}
```

---

#### 4. Create Payout
**POST** `/payouts`

Records a payout event from Payment Processor (does NOT initiate payouts).

```json
{
  "participant_id": "author_123",
  "amount": 1199,
  "reference_id": "payout_001",
  "payout_method": "processor"
}
```

**⚠️ Key constraints:**
- `reference_id` is required and must be stable across retries
- payout execution still happens through `execute-payout`

Creates these ledger entries (only for completed):
```
DEBIT  Creator        +$11.99  (reduce liability)
CREDIT Cash           -$11.99  (money out)
```

---

#### 5. Create Refund
**POST** `/refunds`

Records a refund with configurable who-pays policy.

```json
{
  "sale_reference": "processor_pi_xxx",
  "reason": "Customer requested refund",
  "refund_from": "both"
}
```

`refund_from` options:
- `both` - Proportional (creator and platform both lose their share)
- `platform_only` - Platform absorbs full refund (creator keeps earnings)
- `creator_only` - Creator absorbs full refund

#### 5b. List Refunds
**GET** `/refunds?sale_reference=processor_pi_xxx`

Returns recent refunds, with optional filtering by original sale reference.

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

Located in `/sdk/typescript/src/`

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({
  apiKey: 'your_api_key',
  baseUrl: 'https://api.soledgic.com/v1'
})

// Create a checkout session
const checkout = await soledgic.createCheckoutSession({
  participantId: 'author_123',
  amount: 1999,
  productName: 'Book purchase',
  successUrl: 'https://example.com/success',
})

// List creator earnings wallets
const wallets = await soledgic.listWallets({
  ownerId: 'author_123',
  walletType: 'creator_earnings'
})

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
├── apps/
│   └── web/                      # Product shell, docs, gateway, dashboard
├── sdk/
│   └── typescript/               # Public TypeScript SDK
├── supabase/
│   ├── migrations/
│   │   └── 00000000000000_v1_baseline.sql   # Full schema baseline
│   └── functions/
│       ├── participants/         # Participant treasury resources
│       ├── wallets/              # Wallet resources
│       ├── holds/                # Held-funds lifecycle
│       ├── checkout-sessions/    # Commerce checkout flows
│       ├── payouts/              # Payout resources
│       ├── refunds/              # Refund resources
│       ├── reverse-transaction/  # Immutable reversals
│       └── export-report/        # CSV/JSON exports
├── api/                          # TypeScript SDK
│   ├── src/
│   │   ├── index.ts
│   │   ├── client.ts
│   │   └── types.ts
│   └── examples/
│       └── client-integration.ts
├── docs/
│   ├── API.md                    # API reference
│   └── ARCHITECTURE_PRINCIPLES.md  # ⚠️ The rules
└── README.md
```

---

## Architecture Boundary

```
┌─────────────────────────────────────────────────────────────┐
│                    PAYMENT PROCESSOR                         │
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
│  • Reconciles with Payment Processor                          │
│  • NEVER decides, blocks, or holds                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Test Commands

```bash
# Record a sale
curl -X POST "https://api.soledgic.com/v1/record-sale" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-api-key: <LEDGER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"reference_id": "test_002", "creator_id": "author_123", "amount": 999}'

# Get participant balance
curl "https://api.soledgic.com/v1/participants/author_123" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-api-key: <LEDGER_API_KEY>"

# Export transactions
curl -X POST "https://api.soledgic.com/v1/export-report" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-api-key: <LEDGER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"report_type": "transaction_detail", "format": "json"}'
```

---

## Outbound Webhook Events

Soledgic sends webhook events to registered customer endpoints. Each request includes:
- `X-Soledgic-Signature: t=<unix>,v1=<hex>` — HMAC-SHA256 of `<timestamp>.<raw_body>`, keyed by the endpoint's webhook secret
- `X-Soledgic-Event: <event_type>` — event type header

| Event | When | Typical client action |
|-------|------|-----------------------|
| `checkout.completed` | Payment succeeds, ledger entry created | Fulfill purchase, grant access |
| `refund.created` | Refund recorded in ledger | Revoke access, update records |
| `sale.refunded` | Processor confirms refund completed | Same as `refund.created` |
| `payout.created` | Payout ledger entry created | Update creator dashboard |
| `payout.executed` | Processor confirms payout sent to bank | Notify creator |
| `payout.failed` | Processor reports payout failure | Alert ops / notify creator |
| `test` | "Send test webhook" clicked in dashboard | Verify endpoint connectivity |

---

## Next Steps

1. **Build admin dashboard** - UI for viewing balances and exports
2. **Add Payment Processor reconciliation** - Auto-match Payment Processor payouts to ledger
3. **Production hardening** - Rate limiting, monitoring, backups

---

## The One Rule

> **Soledgic never custodies funds. It can initiate payouts via external processors and records outcomes reported by those rails.**

Recording ≠ deciding. Keep that line bright red.
