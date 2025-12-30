# Soledgic

**Double-entry accounting API for any business.**

Soledgic is financial infrastructure that handles revenue splits, creator payouts, expense tracking, and tax compliance. Works for marketplaces (Booklyverse), SaaS platforms (Vantage Registry), and any business that needs clean books.

## Table of Contents

- [Architecture](#architecture)
- [Two Modes](#two-modes)
- [Quick Start](#quick-start)
- [API Endpoints](#api-endpoints)
- [Authorizing Instruments](#authorizing-instruments)
- [Shadow Ledger (Ghost Entries)](#shadow-ledger-ghost-entries)
- [Breach Alerts](#breach-alerts)
- [Features](#features)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Integrations](#integrations)
- [Web Dashboard](#web-dashboard)
- [SDK](#sdk)
- [Security](#security)
- [Documentation](#documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [License](#license)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR APP                                │
│                  (Booklyverse, Vantage, etc.)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API Calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SOLEDGIC API                             │
│                   (50+ Edge Functions)                          │
├─────────────────────────────────────────────────────────────────┤
│  Sales & Income    │ Payouts & Bills   │ Reports & Tax          │
│  ─────────────     │ ─────────────     │ ─────────────          │
│  record-sale       │ process-payout    │ profit-loss            │
│  record-income     │ execute-payout    │ balance-sheet          │
│  record-refund     │ pay-bill          │ trial-balance          │
│  record-expense    │ receive-payment   │ generate-report        │
│  invoices          │ manage-contractors│ generate-tax-summary   │
├─────────────────────────────────────────────────────────────────┤
│  Banking           │ Management        │ Integrations           │
│  ─────────────     │ ─────────────     │ ─────────────          │
│  reconcile         │ create-ledger     │ stripe                 │
│  import-bank-stmt  │ list-ledgers      │ stripe-webhook         │
│  manage-bank-accts │ manage-splits     │ plaid                  │
│  import-txns       │ manage-budgets    │ webhooks               │
├─────────────────────────────────────────────────────────────────┤
│  Authorization     │ Shadow Ledger     │ Alerts               │
│  ─────────────     │ ─────────────     │ ─────────────        │
│  register-         │ project-intent    │ configure-alerts     │
│    instrument      │ (snap-to match)   │ send-breach-alert    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────┤
│  ledgers              │ Multi-tenant ledger isolation           │
│  accounts             │ Chart of accounts per ledger            │
│  transactions         │ Immutable transaction headers           │
│  entries              │ Double-entry journal lines              │
│  invoices             │ AR/AP invoice management                │
│  payouts              │ Creator/contractor payout tracking      │
│  authorizing_         │ Ledger-native financial authorization   │
│    instruments        │   (contracts as proof, not CLM)         │
│  projected_           │ Shadow Ledger: ghost entries for        │
│    transactions       │   future obligation projection          │
│  alert_configurations │ Slack/email/webhook alert settings      │
│  alert_history        │ Sent alert audit trail                  │
│  bank_accounts        │ Connected bank account tracking         │
│  bank_lines           │ Imported bank statement lines           │
│  reconciliations      │ Bank reconciliation records             │
│  audit_log            │ Full audit trail (immutable)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Two Modes

### Marketplace Mode
For platforms with revenue splits (Booklyverse, Gumroad, etc.)

```bash
# Record a sale with automatic revenue split
curl -X POST "$URL/record-sale" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "reference_id": "pi_xxx",
    "creator_id": "author_123",
    "amount": 2999,
    "processing_fee": 117
  }'

# Response:
# { "creator_amount": 23.06, "platform_amount": 5.76, "withheld": 2.31 }
```

### Standard Mode
For traditional businesses (Vantage Registry, consulting, etc.)

```bash
# Record income
curl -X POST "$URL/record-income" \
  -H "x-api-key: sk_xxx" \
  -d '{"reference_id": "inv_001", "amount": 500000, "description": "Consulting"}'

# Record expense
curl -X POST "$URL/record-expense" \
  -H "x-api-key: sk_xxx" \
  -d '{"reference_id": "exp_001", "amount": 15000, "description": "Office supplies"}'
```

---

## Quick Start

### 1. Install SDK

```bash
npm install @soledgic/sdk
```

### 2. Initialize

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic('sk_live_xxx')
```

### 3. Record Transactions

```typescript
// Marketplace: Record sale with split
const sale = await ledger.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'author_123',
  amount: 2999,
  processingFee: 117,
})

// Standard: Record income
await ledger.recordIncome({
  referenceId: 'inv_001',
  amount: 500000,
  description: 'Consulting - Project Alpha',
})

// Get reports
const pnl = await ledger.getProfitLoss('2024-01-01', '2024-12-31')
const balance = await ledger.getTrialBalance()
```

---

## API Endpoints

### Core Transactions

| Endpoint | Mode | Description |
|----------|------|-------------|
| `POST /record-sale` | Marketplace | Record sale with automatic revenue split |
| `POST /record-income` | Standard | Record business income |
| `POST /record-expense` | Both | Record business expense |
| `POST /record-refund` | Marketplace | Process refund with split reversal |
| `POST /record-adjustment` | Both | Manual ledger adjustment |
| `POST /record-transfer` | Both | Transfer between accounts |
| `POST /record-opening-balance` | Both | Set opening balances |
| `POST /reverse-transaction` | Both | Immutable reversal of any transaction |

### Payouts & Payments

| Endpoint | Description |
|----------|-------------|
| `POST /process-payout` | Initiate creator/contractor payout |
| `POST /execute-payout` | Execute pending payout |
| `POST /check-payout-eligibility` | Check if payout can proceed |
| `POST /pay-bill` | Pay an accounts payable bill |
| `POST /receive-payment` | Record payment received |

### Invoicing (AR/AP)

| Endpoint | Description |
|----------|-------------|
| `POST /invoices` | Create, send, void, or list invoices |
| `POST /record-bill` | Record accounts payable bill |

### Banking & Reconciliation

| Endpoint | Description |
|----------|-------------|
| `POST /reconcile` | Match bank lines to transactions |
| `POST /import-bank-statement` | Import bank statement (CSV/OFX) |
| `POST /import-transactions` | Bulk import transactions |
| `POST /manage-bank-accounts` | CRUD for connected bank accounts |
| `POST /plaid` | Plaid Link integration |

### Reports & Tax

| Endpoint | Description |
|----------|-------------|
| `POST /profit-loss` | Income statement (P&L) |
| `POST /balance-sheet` | Balance sheet report |
| `POST /trial-balance` | Trial balance report |
| `POST /ap-aging` | Accounts payable aging |
| `POST /ar-aging` | Accounts receivable aging |
| `POST /generate-report` | Generic report generator |
| `POST /generate-tax-summary` | 1099 tax summary |
| `POST /tax-documents` | Generate/retrieve tax documents |
| `POST /submit-tax-info` | Submit W-9/tax info |
| `POST /export-report` | Export reports (CSV/PDF) |
| `POST /generate-pdf` | Generate PDF statements |

### Period Management

| Endpoint | Description |
|----------|-------------|
| `POST /close-period` | Close accounting period |
| `POST /frozen-statements` | Get frozen period statements |
| `POST /get-runway` | Cash runway projection |

### Ledger Management

| Endpoint | Description |
|----------|-------------|
| `POST /create-ledger` | Create new ledger |
| `POST /list-ledgers` | List all ledgers |
| `POST /get-balance` | Single account balance |
| `POST /get-balances` | All account balances |
| `POST /get-transactions` | Transaction history |
| `POST /manage-splits` | Configure split tiers/rates |
| `POST /manage-budgets` | Budget management |
| `POST /manage-recurring` | Recurring transactions |
| `POST /manage-contractors` | Contractor management |

### Integrations

| Endpoint | Description |
|----------|-------------|
| `POST /stripe` | Stripe Connect integration |
| `POST /stripe-webhook` | Stripe webhook handler |
| `POST /stripe-billing-webhook` | Stripe billing webhook |
| `POST /plaid` | Plaid bank connection |
| `POST /webhooks` | Outbound webhook configuration |
| `POST /process-webhooks` | Process webhook queue |

### Authorizing Instruments

| Endpoint | Description |
|----------|-------------|
| `POST /register-instrument` | Register financial authorization (PO, contract terms) |

### Shadow Ledger (Projections)

| Endpoint | Description |
|----------|-------------|
| `POST /project-intent` | Project future obligations from instrument cadence |

### Breach Alerts

| Endpoint | Description |
|----------|-------------|
| `POST /configure-alerts` | CRUD for Slack/email/webhook alert configurations |
| `POST /send-breach-alert` | Send breach risk notification to configured channels |

### Operations

| Endpoint | Description |
|----------|-------------|
| `POST /health-check` | System health status |
| `POST /security-alerts` | Security event notifications |
| `POST /send-statements` | Email statements to creators |
| `POST /upload-receipt` | Upload receipt attachments |
| `POST /billing` | Internal billing/usage tracking |

---

## Authorizing Instruments

**Authorizing Instruments** are ledger-native financial authorization records. They are NOT contracts in the CLM sense - they exist solely to:
- Explain WHY money moved
- Validate whether a transaction was authorized
- Support reconciliation-by-proof

### Key Principles

- **Ledger-first**: Instruments are subordinate to the ledger
- **Immutable**: Cannot be edited after creation (invalidate + replace only)
- **No money movement**: Instruments never create entries or affect balances
- **Validation only**: Compare transactions against authorized terms

### Register an Instrument

```bash
curl -X POST "$URL/register-instrument" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "external_ref": "PO-2024-001",
    "extracted_terms": {
      "amount": 500000,
      "currency": "USD",
      "cadence": "monthly",
      "counterparty_name": "Acme Corp"
    }
  }'

# Response:
# { "instrument_id": "uuid", "fingerprint": "sha256...", "external_ref": "PO-2024-001" }
```

### Validate Transaction Against Instrument

```bash
curl -X POST "$URL/record-expense" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "reference_id": "exp_001",
    "amount": 500000,
    "description": "Monthly SaaS subscription",
    "vendor_name": "Acme Corp",
    "authorizing_instrument_id": "uuid-of-instrument"
  }'

# Response includes validation:
# { "authorization": { "verified": true, "instrument_id": "...", "external_ref": "PO-2024-001" } }
```

### Extracted Terms Schema

| Field | Type | Description |
|-------|------|-------------|
| `amount` | integer | Amount in cents |
| `currency` | string | ISO currency code (USD, EUR, etc.) |
| `cadence` | string | Payment frequency: `one_time`, `weekly`, `monthly`, `quarterly`, `annual` |
| `counterparty_name` | string | Vendor/supplier name for matching |

---

## Shadow Ledger (Ghost Entries)

The **Shadow Ledger** projects future financial obligations based on authorizing instruments. Ghost entries are deterministic projections that:

- **NEVER** affect the `entries` table
- **NEVER** affect account balances
- **NEVER** appear in reports (P&L, Balance Sheet, Trial Balance)

They exist only for:
- Expressing future intent
- Snap-to matching when real transactions arrive
- Balance breach prediction (current cash vs obligations)

### Project Future Obligations

```bash
curl -X POST "$URL/project-intent" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "authorizing_instrument_id": "uuid-of-instrument",
    "until_date": "2025-12-31",
    "horizon_count": 12
  }'

# Response:
# {
#   "projections_created": 12,
#   "cadence": "monthly",
#   "projected_dates": ["2025-01-15", "2025-02-15", ...]
# }
```

### Snap-to Matching

When a real transaction is recorded (`record-expense`, `record-bill`), the system automatically:

1. Searches for pending projections within ±3 days
2. Matches on: amount, currency, ledger
3. If match found:
   - Links transaction to projection (`projection_id`)
   - Marks projection as `fulfilled`
   - Sets `metadata.projection_verified = true`

```json
// Response from record-expense with snap-to match
{
  "success": true,
  "transaction_id": "uuid",
  "projection": {
    "matched": true,
    "projection_id": "uuid",
    "expected_date": "2025-01-15"
  }
}
```

### Balance Breach Prediction

The `/get-runway` endpoint now includes shadow obligations:

```json
{
  "actuals": {
    "current_state": { "cash_balance": 50000.00 },
    "runway": { "months": 8 }
  },
  "obligations": {
    "pending_total": 75000.00,
    "pending_count": 15,
    "items": [{ "expected_date": "2025-01-15", "amount": 5000 }]
  },
  "breach_risk": {
    "at_risk": true,
    "shortfall": 25000.00,
    "coverage_ratio": 0.67
  }
}
```

### Projection Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting real transaction match |
| `fulfilled` | Matched to real transaction |
| `expired` | Instrument was invalidated |

### Instrument Invalidation

When an instrument is invalidated, all linked pending projections are automatically expired:

```sql
-- Trigger automatically sets:
UPDATE projected_transactions
SET status = 'expired'
WHERE authorizing_instrument_id = 'uuid'
  AND status = 'pending';
```

---

## Breach Alerts

When `project-intent` creates projections that result in a **breach risk** (pending obligations exceed cash balance), the system can automatically notify you via Slack, email, or webhook.

### Configure Slack Alerts

```bash
curl -X POST "$URL/configure-alerts" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "action": "create",
    "alert_type": "breach_risk",
    "channel": "slack",
    "config": {
      "webhook_url": "https://hooks.slack.com/services/T.../B.../xxx"
    },
    "thresholds": {
      "coverage_ratio_below": 0.5,
      "shortfall_above": 10000
    }
  }'

# Response:
# { "success": true, "data": { "id": "uuid", "alert_type": "breach_risk", "channel": "slack" } }
```

### Alert Thresholds

| Threshold | Default | Description |
|-----------|---------|-------------|
| `coverage_ratio_below` | 0.5 | Trigger when cash / obligations < 50% |
| `shortfall_above` | 0 | Trigger when shortfall exceeds amount |

### Automatic Triggering

Alerts fire automatically when:
1. `project-intent` creates new projections
2. The resulting `breach_risk.at_risk = true`
3. An active alert configuration exists for the ledger

### Slack Message Format

Alerts use Slack Block Kit with severity levels:

| Coverage Ratio | Severity | Color |
|----------------|----------|-------|
| < 25% | CRITICAL | Red |
| 25-50% | WARNING | Orange |
| > 50% | NOTICE | Blue |

Example Slack notification:
```
🚨 Cash Breach Risk Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━
Ledger: Acme Corp
Severity: CRITICAL

Current Cash:        $50,000
Pending Obligations: $150,000
Projected Shortfall: $100,000
Coverage Ratio:      33%

📋 Triggered by new projections from: PO-2024-001 (12 new obligations)
```

### Test Alert Configuration

```bash
curl -X POST "$URL/configure-alerts" \
  -H "x-api-key: sk_xxx" \
  -d '{"action": "test", "config_id": "uuid"}'

# Sends a test message to verify webhook connectivity
```

### List Alert Configurations

```bash
curl -X POST "$URL/configure-alerts" \
  -H "x-api-key: sk_xxx" \
  -d '{"action": "list"}'
```

### Alert Types

| Type | Description |
|------|-------------|
| `breach_risk` | Cash balance insufficient for pending obligations |
| `projection_created` | New projections added (future) |
| `instrument_invalidated` | Authorizing instrument invalidated (future) |

### Configure Email Alerts

```bash
curl -X POST "$URL/configure-alerts" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "action": "create",
    "alert_type": "breach_risk",
    "channel": "email",
    "config": {
      "recipients": ["cfo@company.com", "finance@company.com"]
    },
    "thresholds": {
      "coverage_ratio_below": 0.5,
      "shortfall_above": 10000
    }
  }'
```

Email alerts include:
- HTML-formatted message with severity color-coding
- Current cash, pending obligations, shortfall, coverage ratio
- Link to dashboard
- Triggered via Resend (requires `RESEND_API_KEY` secret)

### Alert Channels

| Channel | Status | Configuration |
|---------|--------|---------------|
| `slack` | Supported | `webhook_url` required |
| `email` | Supported | `recipients` array (max 10) |
| `webhook` | Planned | Uses existing webhook endpoints |

---

## Features

### Core Accounting
- **Double-Entry**: Every transaction creates balanced debit/credit entries
- **Immutable Ledger**: Corrections via reversal transactions, never edits
- **Multi-Currency**: Support for multiple currencies per ledger
- **Chart of Accounts**: Flexible account types (asset, liability, revenue, expense)

### Revenue Splits (Marketplace Mode)
- **5-Tier Split Priority**: Request → Creator → Product → Tier → Default
- **Auto-Promote**: Creators advance tiers based on earnings thresholds
- **Withholding**: Tax reserves (1099), refund buffers, custom holds
- **Processing Fee Pass-through**: Stripe/PayPal fees handled correctly

### Invoicing & AR/AP
- **Invoice Lifecycle**: Draft → Sent → Paid → Voided
- **Partial Payments**: Track payments against invoice balances
- **Aging Reports**: AR/AP aging for collections management
- **Payment Terms**: Net 30, Net 60, custom terms

### Bank Reconciliation
- **Import Formats**: CSV, OFX, QFX bank statements
- **Auto-Matching**: Fuzzy match bank lines to transactions
- **Reconciliation Status**: Unmatched, matched, reconciled
- **Period Closing**: Lock reconciled periods

### Tax & Compliance
- **1099 Generation**: Automatic contractor payment tracking
- **W-9 Collection**: Tax info submission workflow
- **Tax Withholding**: Configurable withholding rules
- **Audit Trail**: Every action logged with user, timestamp, IP

### Multi-Tenant
- **Ledger Isolation**: Complete data separation per API key
- **Row-Level Security**: PostgreSQL RLS on all tables
- **Organization Hierarchy**: Org → Ledgers → Accounts

### Authorizing Instruments (Phase 1)
- **Ledger-Native Authorization**: Financial proof without CLM complexity
- **Immutable Records**: Invalidate + replace only, never edit
- **Transaction Validation**: Compare transactions against authorized terms
- **Fingerprint Deduplication**: SHA-256 hash prevents duplicate instruments
- **Audit Integration**: Full trail of instrument registration and validation

### Shadow Ledger (Phase 2)
- **Ghost Entries**: Deterministic future projections that never affect balances
- **Cadence-Based Projection**: Weekly, monthly, quarterly, annual schedules
- **Snap-to Matching**: Automatic linking when real transactions arrive
- **Balance Breach Prediction**: Current assets vs pending obligations
- **Automatic Expiration**: Invalidating instruments expires pending projections

### Breach Alerts (Phase 3)
- **Slack Notifications**: Rich Block Kit messages with severity levels
- **Configurable Thresholds**: coverage_ratio_below, shortfall_above
- **Automatic Triggering**: Fires when project-intent detects breach risk
- **Alert History**: Full audit trail of sent notifications
- **Test Mode**: Verify webhook connectivity before production use

---

## Project Structure

```
soledgic/
├── supabase/
│   ├── functions/           # 50+ Edge Functions
│   │   ├── _shared/         # Shared utilities
│   │   ├── record-sale/     # Core sale recording
│   │   ├── record-income/   # Income recording
│   │   ├── record-expense/  # Expense recording (+ instrument validation)
│   │   ├── record-bill/     # Bill recording (+ instrument validation)
│   │   ├── process-payout/  # Payout initiation
│   │   ├── invoices/        # Invoice management
│   │   ├── reconcile/       # Bank reconciliation
│   │   ├── profit-loss/     # P&L report
│   │   ├── balance-sheet/   # Balance sheet
│   │   ├── get-runway/      # Cash runway (+ shadow obligations)
│   │   ├── register-instrument/  # Authorizing instrument registration
│   │   ├── project-intent/  # Shadow Ledger projections
│   │   ├── configure-alerts/# Alert configuration CRUD
│   │   ├── send-breach-alert/ # Slack/email alert sender
│   │   ├── stripe/          # Stripe integration
│   │   ├── plaid/           # Plaid integration
│   │   └── ...              # 35+ more functions
│   └── migrations/          # 130+ database migrations
│
├── sdk/
│   └── typescript/          # TypeScript SDK
│       ├── src/
│       │   ├── index.ts     # Main SDK class
│       │   ├── client.ts    # HTTP client
│       │   └── types.ts     # TypeScript types
│       └── README.md
│
├── api/                     # API client library
│   ├── src/
│   │   ├── index.ts
│   │   ├── client.ts
│   │   └── types.ts
│   └── examples/
│       └── booklyverse-integration.ts
│
├── web/                     # Marketing site + Dashboard (Next.js)
│   ├── src/app/
│   │   ├── (auth)/          # Login, signup, invite
│   │   ├── (dashboard)/     # Main dashboard
│   │   │   ├── ledgers/     # Ledger management
│   │   │   ├── contractors/ # Contractor management
│   │   │   ├── billing/     # Billing settings
│   │   │   └── settings/    # Account settings
│   │   ├── (marketing)/     # Marketing pages
│   │   │   └── docs/        # API documentation site
│   │   ├── dashboard/       # Dashboard pages
│   │   └── api/             # Next.js API routes
│   ├── content/blog/        # Blog content (MDX)
│   └── public/
│
├── apps/web/                # Alternative web app structure
│   └── src/
│       ├── app/             # App router pages
│       ├── components/      # React components
│       └── lib/             # Utilities
│           ├── supabase/    # Supabase client
│           ├── csrf.ts      # CSRF protection
│           └── rate-limit.ts# Rate limiting
│
├── tests/
│   ├── stress/              # Stress/load tests
│   │   ├── volume.test.ts
│   │   ├── invoicing.test.ts
│   │   ├── bills-ap.test.ts
│   │   ├── bank-reconciliation.test.ts
│   │   └── period-close.test.ts
│   ├── global-setup.ts
│   └── test-client.ts
│
├── docs/                    # Documentation
│   ├── API.md               # API reference
│   ├── ACCOUNTING_RULES.md  # Accounting principles
│   ├── ARCHITECTURE_PRINCIPLES.md
│   ├── how-money-flows.md
│   ├── how-reconciliation-works.md
│   ├── how-taxes-are-prepared.md
│   ├── booklyverse-integration.md
│   ├── technical-whitepaper.md
│   ├── CUSTOMER_ONBOARDING.md
│   ├── AUDITOR_DEMO_SCRIPT.md
│   ├── # Security
│   ├── SECURITY_BASELINE_V1.md
│   ├── SECURITY_AUDIT_REPORT.md
│   ├── SECURITY_HARDENING.md
│   ├── SECURITY_RUNBOOK.md
│   ├── SOC2_READINESS_MEMO.md
│   ├── DDOS_RESPONSE_PLAYBOOK.md
│   ├── TABLETOP_EXERCISE_API_KEY_COMPROMISE.md
│   ├── # Policies
│   ├── policies/
│   │   ├── BUSINESS_CONTINUITY_PLAN.md
│   │   ├── INFORMATION_SECURITY_POLICY.md
│   │   └── VENDOR_SECURITY_ASSESSMENTS.md
│   └── legal/
│       ├── terms-of-service.md
│       ├── privacy-policy.md
│       └── data-processing-addendum.md
│
├── scripts/
│   └── diagnose_ledger.sql  # Diagnostic queries
│
├── SECURITY.md              # Security policy
├── TODO.md                  # Project status & roadmap
├── vitest.config.ts         # Test configuration
└── vitest.stress.config.ts  # Stress test configuration
```

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `ledgers` | Multi-tenant ledger isolation (1 per customer) |
| `accounts` | Chart of accounts (asset, liability, revenue, expense) |
| `transactions` | Immutable transaction headers |
| `entries` | Double-entry journal lines (debit/credit) |

### Business Tables

| Table | Description |
|-------|-------------|
| `invoices` | Accounts receivable invoices |
| `invoice_payments` | Payments applied to invoices |
| `bills` | Accounts payable bills |
| `payouts` | Creator/contractor payouts |
| `contractors` | Contractor profiles with tax info |

### Split Configuration

| Table | Description |
|-------|-------------|
| `creator_tiers` | Tiered split percentages by earnings |
| `creator_splits` | Per-creator split overrides |
| `product_splits` | Per-product split configuration |
| `withholding_rules` | Tax/refund withholding config |
| `held_funds` | Funds held in reserve |

### Banking

| Table | Description |
|-------|-------------|
| `bank_accounts` | Connected bank accounts |
| `bank_lines` | Imported bank statement lines |
| `reconciliations` | Bank reconciliation records |
| `plaid_items` | Plaid connection tokens (encrypted) |

### Authorizing Instruments & Shadow Ledger

| Table | Description |
|-------|-------------|
| `authorizing_instruments` | Ledger-native financial authorization (immutable) |
| `projected_transactions` | Shadow Ledger: ghost entries for future projections |

### Breach Alerts

| Table | Description |
|-------|-------------|
| `alert_configurations` | Slack/email/webhook alert settings per ledger |
| `alert_history` | Audit trail of all sent alerts |

### Security & Audit

| Table | Description |
|-------|-------------|
| `audit_log` | Immutable audit trail |
| `api_keys` | Hashed API keys |
| `rate_limits` | Rate limit tracking |
| `security_events` | Security event log |

### Organizations

| Table | Description |
|-------|-------------|
| `organizations` | Organization/company records |
| `organization_members` | User membership |
| `users` | User accounts |
| `invitations` | Pending invitations |

---

## Integrations

### Stripe
- **Stripe Connect**: Payout to connected accounts
- **Webhook Handler**: Payment events (succeeded, failed, refunded)
- **Billing**: Subscription management for Soledgic itself

### Plaid
- **Bank Connection**: Link bank accounts via Plaid Link
- **Transaction Sync**: Import transactions automatically
- **Balance Sync**: Real-time balance updates

### Webhooks (Outbound)
Configure webhooks to receive real-time notifications:
- `sale.recorded`
- `payout.initiated`
- `payout.completed`
- `refund.processed`
- `invoice.sent`
- `invoice.paid`
- `balance.threshold`

---

## Web Dashboard

The web dashboard (`/web`) provides:

### Marketing Site
- Landing page with feature overview
- Pricing page
- Documentation site with full API reference
- Blog with accounting best practices

### Dashboard Features
- **Ledger Management**: Create, configure, switch ledgers
- **Transaction View**: Browse all transactions with filtering
- **Reports**: P&L, Balance Sheet, Trial Balance
- **Reconciliation**: Bank statement matching interface
- **Contractors**: Manage contractors and 1099s
- **Settings**: API keys, webhooks, billing

### Documentation Site
Interactive API documentation at `/docs`:
- Quickstart guide
- Authentication
- API reference for all endpoints
- Guides: Marketplace, Revenue Splits, Reconciliation, Tax Exports

---

## SDK

### TypeScript SDK

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic('sk_live_xxx')

// Marketplace operations
await ledger.recordSale({ ... })
await ledger.processPayout({ ... })
await ledger.getEffectiveSplit(creatorId)

// Standard operations
await ledger.recordIncome({ ... })
await ledger.recordExpense({ ... })

// Reports
await ledger.getProfitLoss(startDate, endDate)
await ledger.getTrialBalance()
await ledger.get1099Summary(year)

// Balances
await ledger.getAllBalances()
await ledger.getCreatorBalance(creatorId)

// Authorizing Instruments
const instrument = await ledger.registerInstrument({
  externalRef: 'PO-2024-001',
  extractedTerms: {
    amount: 500000,
    currency: 'USD',
    cadence: 'monthly',
    counterpartyName: 'Acme Corp'
  }
})

// Record expense with authorization validation
await ledger.recordExpense({
  referenceId: 'exp_001',
  amount: 500000,
  vendorName: 'Acme Corp',
  authorizingInstrumentId: instrument.instrumentId
})

// Shadow Ledger: Project future obligations
await ledger.projectIntent({
  authorizingInstrumentId: instrument.instrumentId,
  untilDate: '2025-12-31',
  horizonCount: 12
})

// Get runway with shadow obligations
const runway = await ledger.getRunway()
// runway.obligations.pending_total
// runway.breach_risk.at_risk

// Breach Alerts: Configure Slack notifications
await ledger.createAlert({
  alertType: 'breach_risk',
  channel: 'slack',
  config: {
    webhookUrl: 'https://hooks.slack.com/services/T.../B.../xxx'
  },
  thresholds: {
    coverageRatioBelow: 0.5,  // Alert when coverage < 50%
    shortfallAbove: 10000     // Alert when shortfall > $10k
  }
})

// Breach Alerts: Configure email notifications
await ledger.createAlert({
  alertType: 'breach_risk',
  channel: 'email',
  config: {
    recipients: ['cfo@company.com', 'finance@company.com']
  },
  thresholds: {
    coverageRatioBelow: 0.5
  }
})

// List configured alerts
const alerts = await ledger.listAlerts()

// Test alert (sends test message to Slack)
await ledger.testAlert(alertId)

// Update thresholds
await ledger.updateAlert({
  configId: alertId,
  thresholds: { coverageRatioBelow: 0.3 }
})

// Delete alert configuration
await ledger.deleteAlert(alertId)
```

See `sdk/typescript/README.md` for full API reference.

---

## Security

### Defense in Depth (7 Layers)

```
Layer 1: DDoS Protection (Cloudflare/CDN)
Layer 2: Rate Limiting (Redis + Database fallback)
Layer 3: Authentication (Supabase Auth + API Keys)
Layer 4: Authorization (Row-Level Security)
Layer 5: Input Validation (Type checking + sanitization)
Layer 6: Audit Logging (Immutable audit trail)
Layer 7: Encryption (TLS + at-rest encryption)
```

### Key Security Features
- **API Keys**: SHA-256 hashed, never stored in plaintext
- **Row-Level Security**: All tables protected by RLS policies
- **Audit Trail**: Immutable log of all operations
- **Secret Storage**: Supabase Vault for sensitive tokens
- **Security Headers**: CSP, HSTS, X-Frame-Options, etc.

### Compliance
- **SOC 2**: Type II audit ready (92% compliant)
- **GDPR**: Data processing agreements available
- **PCI DSS**: Stripe handles card data (Level 1 certified)

See `SECURITY.md` and `docs/SECURITY_*.md` for details.

---

## Documentation

| Document | Description |
|----------|-------------|
| `docs/API.md` | API endpoint reference |
| `docs/ACCOUNTING_RULES.md` | Double-entry accounting principles |
| `docs/ARCHITECTURE_PRINCIPLES.md` | System design decisions |
| `docs/how-money-flows.md` | Transaction flow diagrams |
| `docs/how-reconciliation-works.md` | Bank reconciliation guide |
| `docs/how-taxes-are-prepared.md` | 1099 generation process |
| `docs/booklyverse-integration.md` | Example integration |
| `docs/technical-whitepaper.md` | Technical deep-dive |
| `docs/CUSTOMER_ONBOARDING.md` | Onboarding checklist |
| `docs/AUDITOR_DEMO_SCRIPT.md` | Demo script for auditors |

### Security Documentation
| Document | Description |
|----------|-------------|
| `docs/SECURITY_BASELINE_V1.md` | Security baseline |
| `docs/SECURITY_AUDIT_REPORT.md` | Audit findings |
| `docs/SECURITY_HARDENING.md` | Hardening guide |
| `docs/SOC2_READINESS_MEMO.md` | SOC 2 preparation |
| `docs/DDOS_RESPONSE_PLAYBOOK.md` | Incident response |

### Legal
| Document | Description |
|----------|-------------|
| `docs/legal/terms-of-service.md` | Terms of Service |
| `docs/legal/privacy-policy.md` | Privacy Policy |
| `docs/legal/data-processing-addendum.md` | DPA for GDPR |

---

## Testing

### Run Tests

```bash
# Unit/integration tests
npm test

# Stress tests
npm run test:stress
```

### Stress Test Suite
- `volume.test.ts` - High-volume transaction processing
- `invoicing.test.ts` - Invoice lifecycle stress
- `bills-ap.test.ts` - Accounts payable load
- `bank-reconciliation.test.ts` - Reconciliation performance
- `period-close.test.ts` - Period closing under load

---

## Deployment

### Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy record-sale
```

### Apply Migrations

```bash
supabase db push
```

### Environment Variables

```bash
# Required secrets
supabase secrets set STRIPE_SECRET_KEY=sk_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set PLAID_CLIENT_ID=xxx
supabase secrets set PLAID_SECRET=xxx
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set ENVIRONMENT=production
```

### Cron Jobs (pg_cron)

```sql
-- Enable pg_cron in Supabase Dashboard
SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_rate_limits()');
SELECT cron.schedule('cleanup-audit-log', '0 3 * * *', 'SELECT cleanup_audit_log(90)');
```

---

## License

MIT
