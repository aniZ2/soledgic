# Soledgic Architecture Overview

> Updated March 13, 2026: the public integration surface is the resource-first `/v1` API. Shared identity and ecosystems exist, but they are operator control-plane features documented in `docs/OPERATOR_CONTROL_PLANE.md`, not public API-key endpoints.

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
│                    (Client platforms)                         │
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
organizations              # Platform/operator container
├── id, name, slug, owner_id, ecosystem_id
│
├── ledgers                # Ledger boundary for one platform context
│   ├── id, business_name, ledger_mode, settings
│   └── API key hash + accounting configuration
│
├── accounts               # Chart of accounts per ledger
│   ├── id, account_type, entity_id
│   └── Types: cash, platform_revenue, creator_balance, user_wallet, processing_fees
│
├── transactions           # Every money movement
│   ├── id, transaction_type, amount, status, reference_id
│   └── Types: sale, refund, payout, expense, adjustment
│
├── entries                # Double-entry line items
│   ├── transaction_id, account_id, entry_type, amount
│   └── Sum(debits) always equals Sum(credits)
│
├── checkout_sessions      # Hosted + direct checkout orchestration
│   ├── participant_id, amount, status, payment_id, reference_id
│   └── Includes `charged_pending_ledger` recovery state
│
├── held_funds             # Holds, reserves, dispute buffers
│   └── held_amount, released_amount, status
│
├── webhook_endpoints      # Outbound webhook subscriptions
├── webhook_deliveries     # Delivery attempts, retries, replay state
│
├── participant_identity_links  # Shared user identity above ledger-scoped actors
├── shared_tax_profiles         # Shared W-9 style profile data (limited fields)
├── shared_payout_profiles      # Shared payout preferences
│
├── ecosystems             # Multi-platform grouping layer above organizations
├── ecosystem_memberships  # Ecosystem access and ownership
│
├── reconciliation_snapshots    # Frozen reconciliation state
├── processor_transactions      # Processor-side state for reconciliation
├── bank_feed_transactions      # Bank-side state for reconciliation
│
└── tax_documents          # Tax document generation/export state
```

---

## Public API Surface

| Resource | Purpose |
|----------|---------|
| `/v1/participants` | Ledger-scoped sellers/creators/participants |
| `/v1/wallets` | Scoped wallet objects (`consumer_credit`, `creator_earnings`, etc.) |
| `/v1/transfers` | Wallet-to-wallet transfers inside a ledger |
| `/v1/holds` | Hold creation, inspection, and release |
| `/v1/checkout-sessions` | Checkout orchestration |
| `/v1/payouts` | Payout creation for payout-eligible balances |
| `/v1/refunds` | Refund creation and refund feed reads |
| `/v1/reconciliations` | Unmatched items, matches, snapshots, auto-match |
| `/v1/fraud` | Fraud evaluation and policy management |
| `/v1/compliance` | Monitoring and access/compliance summaries |
| `/v1/tax` | Tax calculations and document lifecycle |

Operator-only routes such as `/api/identity/*` and `/api/ecosystems/*` are intentionally excluded from the public API contract.

---

## Key Design Decisions

### 1. Resource-First Public Contract

External developers integrate against resource nouns, not ledger commands:

```text
/v1/participants
/v1/wallets
/v1/checkout-sessions
/v1/payouts
/v1/refunds
```

The ledger and RPC layer stays underneath that product surface.

### 2. Hosted Checkout, Processor-Hosted Card Collection

Checkout sessions are public Soledgic objects, but the hosted card collection step currently redirects the buyer to the processor's hosted onboarding/payment form. See `apps/web/src/app/api/checkout/[id]/setup/route.ts`.

Why this matters:
- launch-friendly and low integration effort
- less customizable than a fully Soledgic-owned card form
- acceptable for first-customer rollout, but a product limitation worth stating plainly

### 3. Charge Captured, Ledger Write Failed Recovery

If a processor charge succeeds but the ledger write fails, the checkout session moves to `charged_pending_ledger` instead of being silently lost.

Recovery path:
- capture succeeds
- `record_sale_atomic` fails
- session is marked `charged_pending_ledger`
- `reconcile-checkout-ledger` retries booking
- duplicate booking is treated as already-reconciled
- webhook is queued only after the session is atomically claimed and completed

This is one of the most important operational failure paths in the system.

### 4. Deduplication via Hashing

Every imported bank transaction gets:
```
SHA-256(date + amount + description + reference + row_index)
```

Same transaction imported twice → automatically skipped.

### 5. Period Locking

Once a month is closed:
- Trial balance snapshot is frozen
- Hash of all transactions is computed
- No edits allowed without reversing entries

### 6. Payment Processor Payout ↔ Bank Matching

Problem: Payment Processor payout and bank deposit are the same money, but appear as two records.

Solution: Auto-match by amount + date + description. Bank transaction marked `is_processor_payout = true`. No duplicate ledger entry.

### 7. Multi-Tenant by Ledger, Multi-Platform by Ecosystem

Each `ledger_id` is completely isolated:
- Own accounts
- Own transactions
- Own creators
- Own API key

Above that, ecosystems group multiple organizations/platforms for shared identity and operator visibility without merging balances.

---

## Security Model

| Layer | Mechanism |
|-------|-----------|
| API Access | API key per ledger |
| Row-Level Security | Postgres RLS by ledger_id |
| Webhook Verification | HMAC signature validation or token auth fallback |
| Audit Trail | All changes logged to audit_log |
| Shared Tax Profile Storage | Limited W-9 style profile data only (for example legal name, tax ID type, tax ID last4, address); no full TIN storage in the current shared profile model |

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
SUPABASE_ANON_KEY=
ENVIRONMENT=production

# Payment Processor
PROCESSOR_BASE_URL=
PROCESSOR_USERNAME=
PROCESSOR_PASSWORD=
PROCESSOR_MERCHANT_ID=
PROCESSOR_API_VERSION=
PROCESSOR_VERSION_HEADER=
PROCESSOR_ONBOARDING_FORM_ID=
PROCESSOR_CHECKOUT_ONBOARDING_FORM_ID=
PROCESSOR_WEBHOOK_SIGNING_KEY=    # Preferred inbound verification
PROCESSOR_WEBHOOK_TOKEN=          # Fallback inbound verification

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
  baseUrl: 'https://api.soledgic.com/v1',
  apiVersion: '2026-03-01',
})

// Create a hosted checkout session
await soledgic.createCheckoutSession({
  amount: 2999,
  participantId: 'creator_123',
  productName: 'Premium ebook',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
})
```

---

## Status: Feature-Complete For A First Customer

| Feature | Status |
|---------|--------|
| Core Ledger Engine | ✅ |
| Public `/v1` Resource API | ✅ |
| Hosted Checkout Sessions | ✅ |
| Charge → Ledger Reconciliation Recovery | ✅ |
| Shared Identity + Ecosystem Layer | ✅ |
| Payment Processor Integration | ✅ |
| Bank Reconciliation | ✅ |
| Payout ↔ Bank Matching | ✅ |
| Health Checks | ✅ |
| Tax Documents | ✅ |
| PDF Reports | ✅ |
| Billing System | ✅ |
| Dashboard UI | ✅ |

**Soledgic is feature-complete for a first customer.**

Important launch caveat:
- hosted checkout currently delegates card collection to the processor-hosted form rather than a fully Soledgic-owned card UI
