# Soledgic Architecture Overview

## What Soledgic Is

**Programmable accounting infrastructure for creator platforms and marketplaces.**

If money moves through your platform, Soledgic can:
- **Account for it** (double-entry ledger)
- **Verify it** (triple-entry proof via external sources)
- **Reconcile it** (match Payment Processor + bank + internal records)
- **Audit it** (full history, period locking, frozen statements)
- **Tax it** (1099 generation for creators)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           YOUR PLATFORM                                  │
│                    (Booklyverse, Patreon, etc.)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ API calls
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             SOLEDGIC                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Ledger     │  │  Webhooks   │  │  Reports    │  │  Billing    │    │
│  │  Engine     │  │  Delivery   │  │  & Tax      │  │  System     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                    │                                     │
│                            ┌───────┴───────┐                            │
│                            │   Supabase    │                            │
│                            │  (Postgres)   │                            │
│                            └───────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
         │                           │                           │
         │ webhooks                  │ import                    │ sync
         ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ PAYMENT PROCESSOR│        │      BANK       │        │   BANK FEEDS    │
│   (payments)    │        │   (CSV/OFX)     │        │ (integrations)  │
└─────────────────┘        └─────────────────┘        └─────────────────┘
```

---

## Database Schema (Core Tables)

```
ledgers                    # One per business/slug
├── id, business_name, mode, settings
│
├── accounts              # Chart of accounts per ledger
│   ├── id, account_type, entity_id (for creators)
│   └── Types: cash, bank, revenue, platform_revenue, creator_balance, processing_fees
│
├── transactions          # Every money movement
│   ├── id, transaction_type, amount, status
│   └── Types: sale, refund, payout, expense, adjustment
│
├── entries               # Double-entry line items
│   ├── transaction_id, account_id, entry_type (debit/credit), amount
│   └── Sum(debits) always equals Sum(credits)
│
├── processor_events         # Raw Payment Processor webhooks
│   └── processor_event_id, event_type, raw_data, status
│
├── processor_transactions   # Processed Payment Processor activity
│   └── processor_id, processor_type, amount, match_status, bank_transaction_id
│
├── bank_feed_transactions    # Bank feed transactions
│   └── amount, date, description, match_status, processor_payout_id
│
├── payouts               # Creator payouts
│   └── creator_id, amount, status, payout_method
│
├── tax_documents         # 1099 forms
│   └── recipient_id, gross_amount, tax_year, status
│
└── health_check_results  # Daily integrity checks
    └── status, checks (jsonb), passed/warnings/failed counts
```

---

## API Endpoints (Edge Functions)

| Endpoint | Purpose |
|----------|---------|
| `/record-sale` | Record a sale with optional creator split |
| `/record-expense` | Record a business expense |
| `/record-refund` | Process a refund |
| `/create-payout` | Initiate creator payout |
| `/processor-webhook` | Process Payment Processor events (money movement) |
| `/billing-webhook` | Process billing events (subscriptions) |
| `/processor` | Payment Processor transaction management |
| `/import-transactions` | Bank CSV/OFX import |
| `/bank-feed-*` | Bank Feed bank connection management |
| `/generate-pdf` | PDF report generation |
| `/tax-documents` | 1099 generation and management |
| `/health-check` | Ledger integrity verification |
| `/billing` | Subscription management |

---

## Key Design Decisions

### 1. Webhook Separation

Two Payment Processor webhook endpoints:
- **`/processor-webhook`** - Money movement (charges, payouts, disputes)
  - Creates ledger entries
  - Touches `transactions`, `entries`, `accounts`
- **`/billing-webhook`** - Billing (subscriptions, invoices)
  - Syncs state only
  - Never touches ledger

Why: Billing events (subscription updated) are not accounting events. Mixing them causes confusion.

### 2. Deduplication via Hashing

Every imported bank transaction gets:
```
SHA-256(date + amount + description + reference + row_index)
```

Same transaction imported twice → automatically skipped.

### 3. Period Locking

Once a month is closed:
- Trial balance snapshot is frozen
- Hash of all transactions is computed
- No edits allowed without reversing entries

### 4. Payment Processor Payout ↔ Bank Matching

Problem: Payment Processor payout and bank deposit are the same money, but appear as two records.

Solution: Auto-match by amount + date + description. Bank transaction marked `is_processor_payout = true`. No duplicate ledger entry.

### 5. Multi-Tenant by Ledger

Each `ledger_id` is completely isolated:
- Own accounts
- Own transactions
- Own creators
- Own API key

One Soledgic instance can serve many businesses.

---

## Security Model

| Layer | Mechanism |
|-------|-----------|
| API Access | API key per ledger |
| Row-Level Security | Postgres RLS by ledger_id |
| Webhook Verification | Payment Processor signature validation |
| Audit Trail | All changes logged to audit_log |
| TIN Storage | Should be encrypted (flag for production) |

---

## What Makes This "Triple-Entry"

```
Entry #1: Payment Processor's Record
└── Immutable. You can't edit Payment Processor's database.
└── Stored: processor_events.raw_data

Entry #2: Your Ledger
└── Your accounting truth.
└── Stored: transactions + entries

Entry #3: Bank Statement
└── External verification.
└── Stored: bank_feed_transactions
```

If any entry is tampered with, the others expose the discrepancy. Health checks run daily to catch drift.

---

## Deployment

```bash
# Database
supabase db push --include-all

# Edge Functions (all)
supabase functions deploy

# Specific functions
supabase functions deploy processor-webhook --no-verify-jwt
supabase functions deploy billing-webhook --no-verify-jwt
supabase functions deploy health-check --no-verify-jwt
```

---

## Environment Variables

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Payment Processor
PROCESSOR_SECRET_KEY=
PROCESSOR_WEBHOOK_SECRET=         # For /processor-webhook
PROCESSOR_BILLING_WEBHOOK_SECRET= # For /billing-webhook

# Bank Feed (optional)
BANK_FEED_CLIENT_ID=
BANK_FEED_SECRET=
BANK_FEED_ENV=sandbox|development|production

# Email (optional)
RESEND_API_KEY=
FROM_EMAIL=

# Cron (for health checks)
CRON_SECRET=
```

---

## SDK Installation

```bash
npm install @soledgic/sdk
```

```typescript
import Soledgic from '@soledgic/sdk'

const soledgic = new Soledgic({
  apiKey: 'sk_live_...',
  baseUrl: 'https://your-project.supabase.co/functions/v1'
})

// Record a sale
await soledgic.recordSale({
  amount: 2999,
  creatorId: 'creator_123',
  description: 'Premium ebook'
})
```

---

## Status: Production Ready

| Feature | Status |
|---------|--------|
| Core Ledger Engine | ✅ |
| Payment Processor Integration | ✅ |
| Bank Reconciliation | ✅ |
| Payout ↔ Bank Matching | ✅ |
| Health Checks | ✅ |
| Tax Documents | ✅ |
| PDF Reports | ✅ |
| Billing System | ✅ |
| Dashboard UI | ✅ |

**Soledgic is feature-complete for launch.**
