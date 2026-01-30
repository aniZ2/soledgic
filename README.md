# Soledgic

**Treasury infrastructure for marketplaces.** Accept payments, manage revenue splits, and pay out sellers and creators — with built-in fraud protection and full double-entry accounting.

A product of [Osifo Holdings L.L.C.](https://osifoholdings.com)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Authorizing Instruments](#authorizing-instruments)
- [Shadow Ledger](#shadow-ledger)
- [Preflight Authorization](#preflight-authorization)
- [Breach Alerts](#breach-alerts)
- [Web Dashboard](#web-dashboard)
- [SDK](#sdk)
- [Database Schema](#database-schema)
- [Integrations](#integrations)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Documentation](#documentation)
- [License](#license)

---

## Overview

Soledgic is payment and accounting infrastructure for marketplaces, creator platforms, and any business that splits revenue between multiple parties. It handles:

- **Payment processing** — accept cards and other methods with PCI compliance and fraud detection
- **Settlement & escrow** — hold funds during chargeback protection periods before releasing
- **Revenue splits** — automatically calculate platform fees and seller/creator payouts
- **Payouts** — pay sellers, vendors, and creators on schedule (daily, weekly, on-demand)
- **Double-entry accounting** — every transaction recorded with proper debits and credits
- **Tax compliance** — 1099 generation, W-9 collection, withholding rules

### Two Modes

**Marketplace Mode** — for platforms with revenue splits (e.g., book marketplaces, creator platforms, B2B vendors):

```bash
curl -X POST "$URL/record-sale" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "reference_id": "pi_xxx",
    "creator_id": "author_123",
    "amount": 2999,
    "processing_fee": 117
  }'

# { "creator_amount": 23.06, "platform_amount": 5.76, "withheld": 2.31 }
```

**Standard Mode** — for traditional businesses (consulting, SaaS, services):

```bash
curl -X POST "$URL/record-income" \
  -H "x-api-key: sk_xxx" \
  -d '{"reference_id": "inv_001", "amount": 500000, "description": "Consulting"}'
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR PLATFORM                           │
│                (Marketplace, Creator Platform, SaaS)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API Calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SOLEDGIC API                              │
│                    (65+ Edge Functions)                           │
├─────────────────────────────────────────────────────────────────┤
│  Payments & Sales  │ Payouts & Bills    │ Reports & Tax          │
│  ───────────────── │ ────────────────── │ ─────────────          │
│  record-sale       │ process-payout     │ profit-loss            │
│  record-income     │ execute-payout     │ balance-sheet          │
│  record-refund     │ pay-bill           │ trial-balance          │
│  record-expense    │ receive-payment    │ generate-tax-summary   │
│  create-checkout   │ release-funds      │ ap-aging / ar-aging    │
├─────────────────────────────────────────────────────────────────┤
│  Banking           │ Management         │ Integrations           │
│  ──────────────    │ ──────────────     │ ─────────────          │
│  reconcile         │ create-ledger      │ stripe / stripe-webhook│
│  import-bank-stmt  │ manage-splits      │ plaid                  │
│  manage-bank-accts │ manage-budgets     │ connected-accounts     │
│  import-txns       │ manage-contractors │ webhooks               │
├─────────────────────────────────────────────────────────────────┤
│  Authorization     │ Shadow Ledger      │ Alerts                 │
│  ──────────────    │ ──────────────     │ ─────────────          │
│  register-         │ project-intent     │ configure-alerts       │
│    instrument      │ (snap-to match)    │ send-breach-alert      │
│  preflight-auth    │                    │ risk-evaluation        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                        │
│  Row-Level Security · Immutable Audit Log · 140+ Migrations     │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Backend**: Supabase Edge Functions (Deno/TypeScript) + PostgreSQL
- **Frontend**: Next.js 14 (App Router) + TailwindCSS
- **Payments**: Stripe Connect
- **Banking**: Plaid
- **Auth**: Supabase Auth + SHA-256 hashed API keys
- **Testing**: Vitest (unit, integration, stress)
- **CI/CD**: GitHub Actions (security scanning, CodeQL, secret detection)

---

## How It Works

1. **Customer pays** — payment is processed with PCI compliance and fraud detection
2. **Funds settle** — payments clear with a settlement period for chargeback protection
3. **Revenue splits** — platform fees and seller amounts calculated automatically
4. **Payouts go out** — funds paid to sellers/creators on your schedule

---

## Quick Start

### Install the SDK

```bash
npm install @soledgic/sdk
```

### Initialize

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic('sk_live_xxx')
```

### Record Transactions

```typescript
// Marketplace: record sale with automatic split
const sale = await ledger.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'author_123',
  amount: 2999,
  processingFee: 117,
})

// Standard: record income
await ledger.recordIncome({
  referenceId: 'inv_001',
  amount: 500000,
  description: 'Consulting - Project Alpha',
})

// Record expense
await ledger.recordExpense({
  referenceId: 'exp_001',
  amount: 15000,
  description: 'Office supplies',
})

// Reports
const pnl = await ledger.getProfitLoss('2025-01-01', '2025-12-31')
const balance = await ledger.getTrialBalance()
```

### Local Development

```bash
# Start Supabase locally
npm run supabase:start

# Serve edge functions
npm run functions:serve

# Run the web dashboard
cd web && npm run dev

# Run tests
npm test
```

---

## API Reference

### Core Transactions

| Endpoint | Mode | Description |
|----------|------|-------------|
| `POST /record-sale` | Marketplace | Record sale with automatic revenue split |
| `POST /record-income` | Standard | Record business income |
| `POST /record-expense` | Both | Record business expense |
| `POST /record-refund` | Marketplace | Process refund with split reversal |
| `POST /record-bill` | Both | Record accounts payable bill |
| `POST /record-adjustment` | Both | Manual ledger adjustment |
| `POST /record-transfer` | Both | Transfer between accounts |
| `POST /record-opening-balance` | Both | Set opening balances |
| `POST /reverse-transaction` | Both | Immutable reversal of any transaction |

### Payouts & Payments

| Endpoint | Description |
|----------|-------------|
| `POST /process-payout` | Initiate creator/contractor payout |
| `POST /execute-payout` | Execute pending payout |
| `POST /check-payout-eligibility` | Verify payout can proceed |
| `POST /pay-bill` | Pay an accounts payable bill |
| `POST /receive-payment` | Record payment received |
| `POST /release-funds` | Release held/escrowed funds |
| `POST /create-checkout` | Create checkout session |

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
| `POST /profit-loss` | Income statement (P&L) with monthly breakdown |
| `POST /balance-sheet` | Balance sheet by account type |
| `POST /trial-balance` | Trial balance verification |
| `POST /ap-aging` | Accounts payable aging |
| `POST /ar-aging` | Accounts receivable aging |
| `POST /generate-report` | Generic report generator |
| `POST /generate-tax-summary` | 1099 tax summary |
| `POST /tax-documents` | Generate/retrieve tax documents |
| `POST /submit-tax-info` | Submit W-9/tax info |
| `POST /export-report` | Export reports (CSV/PDF) |
| `POST /generate-pdf` | Generate PDF statements |
| `POST /get-runway` | Cash runway projection (includes shadow obligations) |

### Period Management

| Endpoint | Description |
|----------|-------------|
| `POST /close-period` | Close accounting period |
| `POST /frozen-statements` | Get frozen period statements |
| `POST /manage-recurring` | Recurring transaction management |

### Ledger Management

| Endpoint | Description |
|----------|-------------|
| `POST /create-ledger` | Create new ledger |
| `POST /list-ledgers` | List all ledgers |
| `POST /get-balance` | Single account balance |
| `POST /get-balances` | All account balances |
| `POST /get-transactions` | Transaction history with filtering |
| `POST /manage-splits` | Configure split tiers/rates |
| `POST /manage-budgets` | Budget management |
| `POST /manage-contractors` | Contractor management |

### Authorization & Risk

| Endpoint | Description |
|----------|-------------|
| `POST /register-instrument` | Register financial authorization (PO, contract terms) |
| `POST /project-intent` | Project future obligations (Shadow Ledger) |
| `POST /preflight-authorization` | Pre-execution policy evaluation |
| `POST /configure-risk-policy` | Configure risk policies |
| `POST /risk-evaluation` | Risk evaluation engine |

### Alerts

| Endpoint | Description |
|----------|-------------|
| `POST /configure-alerts` | CRUD for Slack/email/webhook alert configurations |
| `POST /send-breach-alert` | Send breach risk notification |

### Integrations

| Endpoint | Description |
|----------|-------------|
| `POST /stripe` | Stripe Connect integration |
| `POST /stripe-webhook` | Stripe payment event handler |
| `POST /stripe-billing-webhook` | Stripe subscription event handler |
| `POST /connected-accounts` | Manage connected payment accounts |
| `POST /plaid` | Plaid bank connection |
| `POST /webhooks` | Outbound webhook configuration |
| `POST /process-webhooks` | Process webhook queue |

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

Authorizing Instruments are ledger-native financial authorization records. They are NOT contracts — they exist solely to explain **why** money moved, validate whether a transaction was authorized, and support reconciliation-by-proof.

### Key Principles

- **Ledger-first**: Instruments are subordinate to the ledger
- **Immutable**: Cannot be edited (invalidate + replace only)
- **No money movement**: Never create entries or affect balances
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
```

### Validate Against Instrument

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

# Response includes: { "authorization": { "verified": true, "instrument_id": "...", "external_ref": "PO-2024-001" } }
```

### Extracted Terms

| Field | Type | Description |
|-------|------|-------------|
| `amount` | integer | Amount in cents |
| `currency` | string | ISO currency code |
| `cadence` | string | `one_time`, `weekly`, `monthly`, `quarterly`, `annual` |
| `counterparty_name` | string | Vendor/supplier name for matching |

---

## Shadow Ledger

The Shadow Ledger projects future financial obligations based on authorizing instruments. Ghost entries are deterministic projections that **never** affect the entries table, account balances, or reports.

They exist for:
- Expressing future intent
- Snap-to matching when real transactions arrive
- Balance breach prediction (current cash vs obligations)

### Project Future Obligations

```bash
curl -X POST "$URL/project-intent" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "authorizing_instrument_id": "uuid-of-instrument",
    "until_date": "2026-12-31",
    "horizon_count": 12
  }'
```

### Snap-to Matching

When a real transaction is recorded, the system automatically:
1. Searches for pending projections within ±3 days
2. Matches on amount, currency, and ledger
3. Links the transaction to the projection and marks it `fulfilled`

### Balance Breach Prediction

The `/get-runway` endpoint includes shadow obligations:

```json
{
  "actuals": { "current_state": { "cash_balance": 50000.00 }, "runway": { "months": 8 } },
  "obligations": { "pending_total": 75000.00, "pending_count": 15 },
  "breach_risk": { "at_risk": true, "shortfall": 25000.00, "coverage_ratio": 0.67 }
}
```

### Projection Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting real transaction match |
| `fulfilled` | Matched to real transaction |
| `expired` | Instrument was invalidated |

---

## Preflight Authorization

A ledger-native policy engine that decides whether a proposed transaction should be **allowed before execution**.

> Soledgic never touches the money. It touches truth, intent, and consequence.

### Policy Types

| Policy | Severity | Description |
|--------|----------|-------------|
| `require_instrument` | hard | Block transactions above threshold without authorizing instrument |
| `budget_cap` | soft | Warn when spending exceeds monthly/quarterly caps |
| `projection_guard` | hard | Block if transaction would cause breach risk |

### Preflight Check

```bash
curl -X POST "$URL/preflight-authorization" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "idempotency_key": "expense-2024-001",
    "amount": 500000,
    "currency": "USD",
    "counterparty_name": "Acme Corp"
  }'

# { "decision": { "decision": "allowed", "violated_policies": [], "expires_at": "..." } }
```

### Decision Types

| Decision | Meaning |
|----------|---------|
| `allowed` | Transaction may proceed |
| `warn` | Allowed with soft policy violations |
| `blocked` | Should NOT proceed (hard violations) |

Decisions are advisory-only, time-bound (2-hour default expiry), and idempotent. Pass the `decision_id` to `record-expense` to enforce the preflight check.

---

## Breach Alerts

When `project-intent` creates projections that result in a breach risk (pending obligations exceed cash balance), alerts fire automatically via Slack, email, or webhook.

### Configure Alerts

```bash
# Slack
curl -X POST "$URL/configure-alerts" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "action": "create",
    "alert_type": "breach_risk",
    "channel": "slack",
    "config": { "webhook_url": "https://hooks.slack.com/services/T.../B.../xxx" },
    "thresholds": { "coverage_ratio_below": 0.5, "shortfall_above": 10000 }
  }'

# Email
curl -X POST "$URL/configure-alerts" \
  -H "x-api-key: sk_xxx" \
  -d '{
    "action": "create",
    "alert_type": "breach_risk",
    "channel": "email",
    "config": { "recipients": ["cfo@company.com"] },
    "thresholds": { "coverage_ratio_below": 0.5 }
  }'
```

### Severity Levels

| Coverage Ratio | Severity | Color |
|----------------|----------|-------|
| < 25% | CRITICAL | Red |
| 25-50% | WARNING | Orange |
| > 50% | NOTICE | Blue |

### Alert Channels

| Channel | Status |
|---------|--------|
| `slack` | Supported |
| `email` | Supported (via Resend) |
| `webhook` | Planned |

---

## Web Dashboard

The Next.js frontend at `/web` provides a marketing site and full management dashboard.

### Marketing Site
- Landing page with pricing (Starter $0, Growth $499, Scale custom)
- API documentation at `/docs` with quickstart, guides, and endpoint reference
- Blog content

### Dashboard
- **Ledger management** — create, configure, switch between ledgers
- **Transactions** — browse with filtering by creator, type, status, date
- **Reports** — P&L, Balance Sheet, Trial Balance
- **Reconciliation** — bank statement matching interface
- **Contractors** — manage contractors and 1099s
- **Settings** — API keys, webhooks, organization, billing

### Authentication
- Supabase Auth with SSR middleware
- Session management (JWT, httpOnly cookies, SameSite=Strict)
- CSRF protection and open redirect prevention
- Organization-scoped routes with membership verification

---

## SDK

### TypeScript

```typescript
import Soledgic from '@soledgic/sdk'
const ledger = new Soledgic('sk_live_xxx')

// Marketplace
await ledger.recordSale({ referenceId: 'pi_xxx', creatorId: 'author_123', amount: 2999 })
await ledger.processPayout({ creatorId: 'author_123', amount: 5000 })

// Standard
await ledger.recordIncome({ referenceId: 'inv_001', amount: 500000, description: 'Consulting' })
await ledger.recordExpense({ referenceId: 'exp_001', amount: 15000, description: 'Supplies' })

// Reports
await ledger.getProfitLoss('2025-01-01', '2025-12-31')
await ledger.getTrialBalance()
await ledger.get1099Summary(2025)
await ledger.getAllBalances()

// Authorizing Instruments
const instrument = await ledger.registerInstrument({
  externalRef: 'PO-2024-001',
  extractedTerms: { amount: 500000, currency: 'USD', cadence: 'monthly', counterpartyName: 'Acme Corp' }
})

// Shadow Ledger
await ledger.projectIntent({ authorizingInstrumentId: instrument.instrumentId, untilDate: '2026-12-31' })
const runway = await ledger.getRunway()

// Preflight Authorization
const preflight = await ledger.preflightAuthorization({
  idempotencyKey: 'expense-001', amount: 500000, counterpartyName: 'Acme Corp'
})

// Breach Alerts
await ledger.createAlert({
  alertType: 'breach_risk', channel: 'slack',
  config: { webhookUrl: 'https://hooks.slack.com/...' },
  thresholds: { coverageRatioBelow: 0.5 }
})
```

Error types: `SoledgicError`, `ValidationError`, `AuthenticationError`, `NotFoundError`, `ConflictError`

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `ledgers` | Multi-tenant ledger isolation |
| `accounts` | Chart of accounts (asset, liability, revenue, expense) |
| `transactions` | Immutable transaction headers |
| `entries` | Double-entry journal lines (debit/credit) |

### Business Tables

| Table | Description |
|-------|-------------|
| `invoices` / `invoice_payments` | Accounts receivable |
| `bills` | Accounts payable |
| `payouts` | Creator/contractor payouts |
| `contractors` | Contractor profiles with tax info |

### Revenue Splits

| Table | Description |
|-------|-------------|
| `creator_tiers` | Tiered split percentages by earnings |
| `creator_splits` | Per-creator split overrides |
| `product_splits` | Per-product split configuration |
| `withholding_rules` / `held_funds` | Tax/refund reserves |

### Banking

| Table | Description |
|-------|-------------|
| `bank_accounts` | Connected bank accounts |
| `bank_lines` | Imported bank statement lines |
| `reconciliations` | Bank reconciliation records |
| `plaid_items` | Plaid connection tokens (encrypted) |

### Authorization & Projections

| Table | Description |
|-------|-------------|
| `authorizing_instruments` | Immutable financial authorization records |
| `projected_transactions` | Shadow Ledger ghost entries |
| `authorization_policies` | Preflight authorization rules |
| `authorization_decisions` | Immutable preflight decisions |
| `alert_configurations` | Alert settings per ledger |
| `alert_history` | Sent alert audit trail |

### Security & Organizations

| Table | Description |
|-------|-------------|
| `audit_log` | Immutable audit trail |
| `api_keys` | SHA-256 hashed API keys |
| `rate_limits` | Rate limit tracking |
| `security_events` | Security event log |
| `organizations` / `organization_members` | Org hierarchy |
| `users` / `invitations` | User accounts and invites |

---

## Integrations

### Stripe
- **Stripe Connect** — payout to connected accounts
- **Webhook handlers** — payment succeeded/failed/refunded, subscription events
- **Checkout** — create checkout sessions
- **Billing** — subscription management for Soledgic itself

### Plaid
- **Bank connection** — link bank accounts via Plaid Link
- **Transaction sync** — import transactions automatically
- **Balance sync** — real-time balance updates

### Outbound Webhooks
Configure webhooks for real-time notifications:
`sale.recorded`, `payout.initiated`, `payout.completed`, `refund.processed`, `invoice.sent`, `invoice.paid`, `balance.threshold`

---

## Security

### Defense in Depth

| Layer | Protection |
|-------|------------|
| 1 | DDoS protection (Cloudflare/CDN) |
| 2 | Rate limiting (Redis + database fallback) |
| 3 | Authentication (Supabase Auth + API keys) |
| 4 | Authorization (Row-Level Security on all tables) |
| 5 | Input validation (type checking + sanitization) |
| 6 | Audit logging (immutable trail) |
| 7 | Encryption (TLS 1.3 + AES-256 at rest) |

### Security Headers
CSP, HSTS, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, Permissions-Policy — all configured in `next.config.js`.

### API Key Security
- SHA-256 hashed, never stored in plaintext
- Scoped to specific ledgers
- Rate-limited per endpoint (5-200 req/min depending on sensitivity)
- Fail-closed on rate limit for critical endpoints (payouts, webhooks)

### Compliance
- **SOC 2** — Type II audit ready (92% compliant)
- **GDPR** — data processing agreements available
- **PCI DSS** — Stripe handles card data (Level 1 certified)

### CI/CD Security (GitHub Actions)
- Dependency audit (`npm audit`)
- Secret scanning (TruffleHog)
- CodeQL static analysis
- Security header verification
- SQL injection pattern detection

See `SECURITY.md` and `docs/SECURITY_*.md` for full details.

---

## Testing

```bash
# Unit/integration tests
npm test

# Watch mode
npm run test:watch

# Stress tests
npm run test:stress

# Coverage
npm run test:coverage
```

### Stress Test Suite
| Test | Description |
|------|-------------|
| `volume.test.ts` | 50+ transactions in rapid succession |
| `invoicing.test.ts` | Invoice lifecycle under load |
| `bills-ap.test.ts` | Accounts payable stress |
| `bank-reconciliation.test.ts` | Reconciliation performance |
| `period-close.test.ts` | Period closing under load |

---

## Deployment

### Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy a specific function
supabase functions deploy record-sale
```

### Database Migrations

```bash
supabase db push
```

### Web Dashboard (Vercel)

The Next.js frontend is deployed to Vercel with:
- **Root Directory**: `web`
- **Framework**: Next.js
- **Domain**: soledgic.com

Pushes to `main` trigger automatic deployments via GitHub integration.

### Cron Jobs

```sql
SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_rate_limits()');
SELECT cron.schedule('cleanup-audit-log', '0 3 * * *', 'SELECT cleanup_audit_log(90)');
```

---

## Project Structure

```
soledgic/
├── supabase/
│   ├── functions/              # 65+ Deno edge functions
│   │   ├── _shared/            # Shared utilities (auth, validation, errors)
│   │   ├── record-sale/        # Core sale recording with splits
│   │   ├── record-expense/     # Expense recording + instrument validation
│   │   ├── process-payout/     # Payout initiation
│   │   ├── reconcile/          # Bank reconciliation
│   │   ├── register-instrument/# Authorizing instruments
│   │   ├── project-intent/     # Shadow Ledger projections
│   │   ├── preflight-authorization/  # Policy engine
│   │   ├── configure-alerts/   # Alert CRUD
│   │   ├── stripe-webhook/     # Stripe event handler
│   │   └── ...                 # 55+ more functions
│   └── migrations/             # 140+ database migrations
│
├── web/                        # Next.js 14 frontend (marketing + dashboard)
│   ├── src/app/
│   │   ├── (auth)/             # Login, signup
│   │   ├── (dashboard)/        # Ledgers, contractors, billing, settings
│   │   ├── (marketing)/docs/   # API documentation site
│   │   ├── dashboard/          # Dashboard views (reports, reconciliation, etc.)
│   │   └── api/                # 15 Next.js API routes
│   └── src/components/         # React components
│
├── sdk/typescript/             # TypeScript SDK
│   └── src/                    # Client, types, exports
│
├── api/                        # API client library
│   └── src/                    # HTTP client, types
│
├── tests/
│   ├── stress/                 # Stress/load tests (Vitest)
│   ├── test-client.ts          # API test client
│   └── global-setup.ts         # Test setup
│
├── docs/                       # Documentation
│   ├── API.md                  # Endpoint reference
│   ├── ACCOUNTING_RULES.md     # Double-entry principles
│   ├── ARCHITECTURE_PRINCIPLES.md
│   ├── how-money-flows.md
│   ├── how-reconciliation-works.md
│   ├── how-taxes-are-prepared.md
│   ├── technical-whitepaper.md
│   ├── CUSTOMER_ONBOARDING.md
│   ├── AUDITOR_DEMO_SCRIPT.md
│   ├── SECURITY_*.md           # Security documentation (5 docs)
│   ├── SOC2_READINESS_MEMO.md
│   ├── policies/               # Business continuity, InfoSec, vendor assessments
│   └── legal/                  # Terms of service, privacy policy, DPA
│
├── scripts/                    # Diagnostic SQL scripts
├── .github/workflows/          # CI/CD (security scanning)
├── public/index.html           # Static landing page
├── SECURITY.md                 # Security policy
├── vitest.config.ts            # Test config
└── vitest.stress.config.ts     # Stress test config
```

---

## Environment Variables

### Supabase Edge Functions (secrets)

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set STRIPE_BILLING_WEBHOOK_SECRET=whsec_xxx
supabase secrets set PLAID_CLIENT_ID=xxx
supabase secrets set PLAID_SECRET=xxx
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set CRON_SECRET=xxx
supabase secrets set ENVIRONMENT=production
```

### Web Dashboard (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
CSRF_SECRET=your-csrf-secret
```

### Local Development

```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Documentation

### Core
| Document | Description |
|----------|-------------|
| `docs/API.md` | Full endpoint reference |
| `docs/ACCOUNTING_RULES.md` | Double-entry accounting principles |
| `docs/ARCHITECTURE_PRINCIPLES.md` | System design decisions |
| `docs/how-money-flows.md` | Transaction flow diagrams |
| `docs/how-reconciliation-works.md` | Bank reconciliation guide |
| `docs/how-taxes-are-prepared.md` | 1099 generation process |
| `docs/technical-whitepaper.md` | Technical deep-dive |
| `docs/CUSTOMER_ONBOARDING.md` | Onboarding checklist |
| `docs/AUDITOR_DEMO_SCRIPT.md` | Demo script for auditors |

### Security
| Document | Description |
|----------|-------------|
| `docs/SECURITY_BASELINE_V1.md` | Security baseline |
| `docs/SECURITY_AUDIT_REPORT.md` | Audit findings |
| `docs/SECURITY_HARDENING.md` | Hardening guide |
| `docs/SECURITY_RUNBOOK.md` | Operational runbook |
| `docs/SOC2_READINESS_MEMO.md` | SOC 2 preparation |
| `docs/DDOS_RESPONSE_PLAYBOOK.md` | Incident response |

### Legal
| Document | Description |
|----------|-------------|
| `docs/legal/terms-of-service.md` | Terms of Service |
| `docs/legal/privacy-policy.md` | Privacy Policy |
| `docs/legal/data-processing-addendum.md` | DPA for GDPR |

---

## License

Proprietary. Copyright 2026 Osifo Holdings L.L.C.
