# Soledgic - Final System Status

## Quick Deploy

```bash
# Apply all migrations
supabase db push

# Deploy all functions  
supabase functions deploy

# Initialize existing ledger (run in SQL editor)
SELECT initialize_receipt_rules('e642627c-bc08-4881-a039-77c14d1c6874');
SELECT initialize_tax_buckets('e642627c-bc08-4881-a039-77c14d1c6874');
```

---

## Representative Endpoint List (See /supabase/functions for the full set)

### Revenue (6)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `record-sale` | POST | Record sales with creator splits |
| `get-balance` | GET | Creator/platform balances |
| `process-payout` | POST | Record payout events |
| `record-refund` | POST | Record refunds |
| `reverse-transaction` | POST | Immutable reversals |
| `get-transactions` | GET | Query transaction history |

### Expenses (4)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `record-expense` | POST | Log expenses with IRS categories |
| `upload-receipt` | POST | Attach receipts to transactions |
| `manage-recurring` | GET/POST | Track subscriptions |
| `manage-recurring/due` | GET | Upcoming expenses |

### Accounting Controls (5)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `record-adjustment` | POST | CPA-style journal entries |
| `record-transfer` | POST | Internal transfers (tax reserve, draws) |
| `record-opening-balance` | POST | Set initial balances |
| `close-period` | POST | Lock months/quarters |
| `trial-balance` | GET | Verify books balance |

### Reports (3)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `profit-loss` | GET | P&L (annual/monthly/quarterly) |
| `export-report` | POST | CSV/JSON exports |
| `get-runway` | GET | Cash runway & projections |

### Reconciliation (3)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `import-bank-statement` | POST | Import CSV bank lines |
| `reconcile` | GET | Get unmatched items |
| `reconcile/match` | POST | Match bank line to transaction |
| `reconcile/exclude` | POST | Exclude bank line |
| `reconcile/complete` | POST | Complete period reconciliation |

### Business Ops (6)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `manage-contractors` | GET/POST | Track contractors |
| `manage-contractors/payment` | POST | Record payment + 1099 threshold |
| `manage-budgets` | GET/POST | Budget envelopes |
| `manage-bank-accounts` | GET/POST | Track payment sources |
| `create-ledger` | POST | New business |
| `list-ledgers` | GET | All your businesses |

---

## Database Schema (27 Tables)

### Core Accounting
- `ledgers` - Multi-tenant businesses
- `accounts` - Chart of accounts
- `transactions` - Immutable transaction headers
- `entries` - Double-entry debit/credit lines
- `payouts` - Payout event records
- `audit_log` - Every API call logged
- `webhook_events` - Outbound webhooks

### Accounting Controls
- `accounting_periods` - Period open/close tracking
- `trial_balance_snapshots` - Hashed balance snapshots
- `idempotency_keys` - Duplicate prevention
- `adjustment_journals` - CPA adjustments
- `opening_balances` - Initial balance records

### Expenses & Receipts
- `expense_categories` - IRS-aligned (31 categories)
- `receipts` - Receipt files
- `receipt_rules` - Enforcement rules
- `expense_attachments` - Links receipts to transactions
- `recurring_expense_templates` - Subscriptions
- `mileage_entries` - Business mileage

### Banking & Reconciliation
- `bank_accounts` - Your bank/card accounts
- `bank_statements` - Statement PDFs
- `bank_statement_lines` - Imported line items
- `reconciliation_sessions` - Reconciliation records
- `reconciliation_records` - Payment Processor matching

### Operations
- `contractors` - Contractor tracking
- `contractor_payments` - Payment history + 1099
- `tax_buckets` - Tax reserves
- `budget_envelopes` - Budget tracking
- `runway_snapshots` - Financial health
- `api_key_scopes` - Role-based access

### Reporting
- `creator_payout_summaries` - Annual aggregates
- `report_exports` - Export audit trail
- `processor_account_links` - Payment Processor account mapping

---

## What soledgic Replaces

| App | What soledgic Does Instead |
|-----|---------------------------|
| QuickBooks | Full double-entry, P&L, trial balance, period close |
| Expensify | Receipt tracking, IRS categories, business purpose |
| YNAB | Budget envelopes with alerts |
| Spreadsheets | Contractor tracking, 1099 thresholds |
| Mercury Dashboard | Cash runway, projections |
| Multiple logins | Multi-business under one system |

---

## Verification Tests (Example)

Run these to confirm everything works:

```bash
BASE="https://YOUR_PROJECT.supabase.co/functions/v1"
AUTH="Authorization: Bearer <ANON_OR_SERVICE_KEY>"
KEY="x-api-key: <LEDGER_API_KEY>"

# 1. Trial balance
curl "$BASE/trial-balance" -H "$AUTH" -H "$KEY"

# 2. P&L with monthly breakdown
curl "$BASE/profit-loss?year=2025&breakdown=monthly" -H "$AUTH" -H "$KEY"

# 3. Cash runway
curl "$BASE/get-runway" -H "$AUTH" -H "$KEY"

# 4. List all ledgers
curl "$BASE/list-ledgers" -H "$AUTH" -H "$KEY"

# 5. Transaction export
curl -X POST "$BASE/export-report" -H "$AUTH" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d '{"report_type":"transaction_detail","format":"json"}'

# 6. Create recurring expense
curl -X POST "$BASE/manage-recurring" -H "$AUTH" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vercel Pro",
    "merchant_name": "Vercel",
    "category_code": "software",
    "amount": 2000,
    "recurrence_interval": "monthly",
    "start_date": "2025-01-01",
    "business_purpose": "Booklyverse hosting"
  }'

# 7. Create budget
curl -X POST "$BASE/manage-budgets" -H "$AUTH" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Software Budget",
    "category_code": "software",
    "budget_amount": 50000,
    "budget_period": "monthly"
  }'

# 8. Create contractor
curl -X POST "$BASE/manage-contractors" -H "$AUTH" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Contractor", "email": "test@example.com"}'

# 9. Transfer to tax reserve
curl -X POST "$BASE/record-transfer" -H "$AUTH" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from_account_type": "cash",
    "to_account_type": "tax_reserve",
    "amount": 500,
    "transfer_type": "tax_reserve",
    "description": "Q4 estimated tax reserve"
  }'

# 10. Get budgets with status
curl "$BASE/manage-budgets" -H "$AUTH" -H "$KEY"
```

---

## Architecture Boundary

```
┌─────────────────────────────────────────────────────────────┐
│                    PAYMENT PROCESSOR                         │
│  • Moves money           • Issues 1099s                      │
│  • Collects W-9          • KYC/AML                          │
│  • Blocks/approves payouts                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ Webhooks
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        SOLEDGIC                              │
│  • Records events        • Maintains audit trail             │
│  • Calculates splits     • Generates reports                 │
│  • Tracks expenses       • Reconciles with bank              │
│  • NEVER decides, blocks, or holds                           │
└─────────────────────────────────────────────────────────────┘
```

---

## The One Rule

> **Soledgic never custodies funds. It can initiate payouts via external processors and records outcomes reported by those rails.**

Recording ≠ deciding.
