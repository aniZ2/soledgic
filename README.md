# Soledgic

**Double-entry accounting API for any business.**

Soledgic is financial infrastructure that handles revenue splits, creator payouts, expense tracking, and tax compliance. Works for marketplaces (Booklyverse), SaaS platforms (Vantage Registry), and any business that needs clean books.

## Table of Contents

- [Architecture](#architecture)
- [Two Modes](#two-modes)
- [Quick Start](#quick-start)
- [API Endpoints](#api-endpoints)
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
│                   (48 Edge Functions)                           │
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
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────┤
│  ledgers          │ Multi-tenant ledger isolation               │
│  accounts         │ Chart of accounts per ledger (asset/liab)   │
│  transactions     │ Immutable transaction headers               │
│  entries          │ Double-entry journal lines (debit/credit)   │
│  invoices         │ AR/AP invoice management                    │
│  payouts          │ Creator/contractor payout tracking          │
│  creator_tiers    │ Tiered split configuration                  │
│  withholding_rules│ Tax/refund holds                            │
│  held_funds       │ Funds in reserve                            │
│  bank_accounts    │ Connected bank account tracking             │
│  bank_lines       │ Imported bank statement lines               │
│  reconciliations  │ Bank reconciliation records                 │
│  audit_log        │ Full audit trail (immutable)                │
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

### Operations

| Endpoint | Description |
|----------|-------------|
| `POST /health-check` | System health status |
| `POST /security-alerts` | Security event notifications |
| `POST /send-statements` | Email statements to creators |
| `POST /upload-receipt` | Upload receipt attachments |
| `POST /billing` | Internal billing/usage tracking |

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

---

## Project Structure

```
soledgic/
├── supabase/
│   ├── functions/           # 48 Edge Functions
│   │   ├── _shared/         # Shared utilities
│   │   ├── record-sale/     # Core sale recording
│   │   ├── record-income/   # Income recording
│   │   ├── record-expense/  # Expense recording
│   │   ├── process-payout/  # Payout initiation
│   │   ├── invoices/        # Invoice management
│   │   ├── reconcile/       # Bank reconciliation
│   │   ├── profit-loss/     # P&L report
│   │   ├── balance-sheet/   # Balance sheet
│   │   ├── stripe/          # Stripe integration
│   │   ├── plaid/           # Plaid integration
│   │   └── ...              # 38 more functions
│   └── migrations/          # 80+ database migrations
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
