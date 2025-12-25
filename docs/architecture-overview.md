# Soledgic Architecture Overview

## What Soledgic Is

**Programmable accounting infrastructure for creator platforms and marketplaces.**

If money moves through your platform, Soledgic can:
- **Account for it** (double-entry ledger)
- **Verify it** (triple-entry proof via external sources)
- **Reconcile it** (match Stripe + bank + internal records)
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
│     STRIPE      │        │      BANK       │        │     PLAID       │
│   (payments)    │        │   (CSV/OFX)     │        │  (bank feeds)   │
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
├── stripe_events         # Raw Stripe webhooks
│   └── stripe_event_id, event_type, raw_data, status
│
├── stripe_transactions   # Processed Stripe activity
│   └── stripe_id, stripe_type, amount, match_status, bank_transaction_id
│
├── plaid_transactions    # Bank feed transactions
│   └── amount, date, description, match_status, stripe_payout_id
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
| `/stripe-webhook` | Process Stripe events (money movement) |
| `/stripe-billing-webhook` | Process billing events (subscriptions) |
| `/stripe` | Stripe transaction management |
| `/import-transactions` | Bank CSV/OFX import |
| `/plaid-*` | Plaid bank connection management |
| `/generate-pdf` | PDF report generation |
| `/tax-documents` | 1099 generation and management |
| `/health-check` | Ledger integrity verification |
| `/billing` | Subscription management |

---

## Key Design Decisions

### 1. Webhook Separation

Two Stripe webhook endpoints:
- **`/stripe-webhook`** - Money movement (charges, payouts, disputes)
  - Creates ledger entries
  - Touches `transactions`, `entries`, `accounts`
- **`/stripe-billing-webhook`** - Billing (subscriptions, invoices)
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

### 4. Stripe Payout ↔ Bank Matching

Problem: Stripe payout and bank deposit are the same money, but appear as two records.

Solution: Auto-match by amount + date + description. Bank transaction marked `is_stripe_payout = true`. No duplicate ledger entry.

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
| Webhook Verification | Stripe signature validation |
| Audit Trail | All changes logged to audit_log |
| TIN Storage | Should be encrypted (flag for production) |

---

## What Makes This "Triple-Entry"

```
Entry #1: Stripe's Record
└── Immutable. You can't edit Stripe's database.
└── Stored: stripe_events.raw_data

Entry #2: Your Ledger
└── Your accounting truth.
└── Stored: transactions + entries

Entry #3: Bank Statement
└── External verification.
└── Stored: plaid_transactions
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
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy stripe-billing-webhook --no-verify-jwt
supabase functions deploy health-check --no-verify-jwt
```

---

## Environment Variables

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=         # For /stripe-webhook
STRIPE_BILLING_WEBHOOK_SECRET= # For /stripe-billing-webhook

# Plaid (optional)
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox|development|production

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
| Stripe Integration | ✅ |
| Bank Reconciliation | ✅ |
| Payout ↔ Bank Matching | ✅ |
| Health Checks | ✅ |
| Tax Documents | ✅ |
| PDF Reports | ✅ |
| Billing System | ✅ |
| Dashboard UI | ✅ |

**Soledgic is feature-complete for launch.**
