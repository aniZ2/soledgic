# Soledgic

**Double-entry accounting API for any business.**

Soledgic is financial infrastructure that handles revenue splits, creator payouts, expense tracking, and tax compliance. Works for marketplaces (Booklyverse), SaaS platforms (Vantage Registry), and any business that needs clean books.

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
├─────────────────────────────────────────────────────────────────┤
│  record-sale     │ Record sale with automatic split             │
│  record-income   │ Record business income (no split)            │
│  record-expense  │ Record business expense                      │
│  process-payout  │ Pay creator/contractor                       │
│  manage-splits   │ Configure tiers, rates                       │
│  get-balances    │ Account & creator balances                   │
│  generate-report │ P&L, Trial Balance, 1099                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────┤
│  ledgers          │ Multi-tenant ledger isolation               │
│  accounts         │ Chart of accounts per ledger                │
│  transactions     │ All financial transactions                  │
│  entries          │ Double-entry journal entries                │
│  creator_tiers    │ Tiered split configuration                  │
│  withholding_rules│ Tax/refund holds                            │
│  held_funds       │ Funds in reserve                            │
│  audit_log        │ Full audit trail                            │
└─────────────────────────────────────────────────────────────────┘
```

## Two Modes

### Marketplace Mode
For platforms with revenue splits (Booklyverse, Gumroad, etc.)

```bash
curl -X POST "$URL/record-sale" \
  -H "x-api-key: sk_xxx" \
  -d '{"reference_id": "pi_xxx", "creator_id": "author_123", "amount": 2999}'

# Response:
# { "creator_amount": 23.99, "platform_amount": 5.99, "withheld": 2.40 }
```

### Standard Mode
For traditional businesses (Vantage Registry, consulting, etc.)

```bash
curl -X POST "$URL/record-income" \
  -H "x-api-key: sk_xxx" \
  -d '{"reference_id": "inv_001", "amount": 500000, "description": "Consulting"}'

curl -X POST "$URL/record-expense" \
  -H "x-api-key: sk_xxx" \
  -d '{"reference_id": "exp_001", "amount": 15000, "description": "Office supplies"}'
```

## API Endpoints

| Endpoint | Mode | Description |
|----------|------|-------------|
| `POST /record-sale` | Marketplace | Sale with auto-split |
| `POST /process-payout` | Marketplace | Pay a creator |
| `POST /record-income` | Standard | Record income |
| `POST /record-expense` | Both | Record expense |
| `POST /manage-splits` | Marketplace | Tier/rate config |
| `POST /get-balances` | Both | Account balances |
| `POST /generate-report` | Both | Financial reports |

## Features

- **Multi-tenant**: Each API key = isolated ledger
- **Dual Mode**: Marketplace or Standard accounting
- **5-Tier Split Priority**: Request → Creator → Product → Tier → Default
- **Withholding**: Tax reserves, refund buffers
- **Auto-Promote**: Creators advance tiers based on earnings
- **Full Audit Trail**: Every action logged
- **CPA-Ready**: P&L, Trial Balance, 1099 exports

## Project Structure

```
soledgic/
├── supabase/
│   ├── functions/         # Edge Functions
│   │   ├── record-sale/
│   │   ├── record-income/
│   │   ├── record-expense/
│   │   ├── process-payout/
│   │   ├── manage-splits/
│   │   ├── get-balances/
│   │   └── generate-report/
│   └── migrations/        # Database schema
├── sdk/
│   └── typescript/        # TypeScript SDK
└── web/                   # Dashboard (Next.js)
```

## Setup

```bash
# Deploy functions
supabase functions deploy record-sale --no-verify-jwt
supabase functions deploy record-income --no-verify-jwt
supabase functions deploy record-expense --no-verify-jwt
supabase functions deploy process-payout --no-verify-jwt
supabase functions deploy manage-splits --no-verify-jwt
supabase functions deploy get-balances --no-verify-jwt
supabase functions deploy generate-report --no-verify-jwt
```

## SDK Usage

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic('sk_live_xxx')

// Marketplace: Record sale
await ledger.recordSale({
  referenceId: 'stripe_pi_xxx',
  creatorId: 'author_123',
  amount: 2999,
})

// Standard: Record income
await ledger.recordIncome({
  referenceId: 'inv_001',
  amount: 500000,
  description: 'Consulting',
})

// Get reports
const pnl = await ledger.getProfitLoss('2024-01-01', '2024-12-31')
```

## License

MIT
