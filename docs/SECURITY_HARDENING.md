# Soledgic - Security Hardening Complete ✅

## Summary

**All 48 Edge Functions** have been updated with comprehensive security hardening. The API is production-ready with Redis-backed rate limiting.

---

## Rate Limiting Architecture (Redis + Database Fallback)

### Overview

Rate limiting uses a **dual-layer architecture** with the "Narrow Gate" strategy:

```
Request → Redis (Upstash) → Response
           │ Full limits (200 req/min)
           │
           ↓ (if Redis fails)
           │
         Database (Postgres) → Response  
           │ THROTTLED limits (20 req/min = 10%)
           │
           ↓ (if both fail)
           │
         Fail-Closed or Fail-Open
```

**Primary:** Upstash Redis - fast, distributed, full throughput
**Fallback:** Postgres `rate_limits` table - throttled to **10% of Redis limits**
**Circuit Breaker:** If Redis fails, skip it for 30 seconds before retrying

### The "Narrow Gate" Strategy

| Layer | Limit | Purpose |
|-------|-------|--------|
| Redis (Wide Gate) | 200 req/min | Handle 99% of traffic, fast |
| Postgres (Narrow Gate) | 20 req/min | Protect DB during Redis outage |

**Why this works:**
- Redis handles normal traffic at full speed
- If Redis goes down, DB takes over with strict limits
- Attackers exploiting a Redis outage hit the "narrow gate" (20 req/min)
- Your Postgres instance stays healthy even under attack
- Legitimate users still get through (just slower)

### Rate Limits by Endpoint

| Endpoint | Redis Limit | DB Fallback (10%) | Window | Fail Behavior |
|----------|-------------|-------------------|--------|---------------|
| `record-sale` | 200 | 20 | 1 min | **Fail-Closed** |
| `record-expense` | 200 | 20 | 1 min | Fail-Open |
| `record-income` | 200 | 20 | 1 min | Fail-Open |
| `record-refund` | 100 | 10 | 1 min | **Fail-Closed** |
| `execute-payout` | 50 | 5 | 1 min | **Fail-Closed** |
| `process-payout` | 50 | 5 | 1 min | **Fail-Closed** |
| `plaid` | 50 | 5 | 1 min | **Fail-Closed** |
| `stripe-webhook` | 500 | 50 | 1 min | **Fail-Closed** |
| `generate-pdf` | 20 | 2 | 1 min | Fail-Open |
| `generate-report` | 30 | 3 | 1 min | Fail-Open |
| `export-report` | 20 | 2 | 1 min | Fail-Open |
| `import-transactions` | 10 | 1 | 1 min | **Fail-Closed** |
| `import-bank-statement` | 10 | 1 | 1 min | **Fail-Closed** |
| `send-statements` | 20 | 2 | 1 min | **Fail-Closed** |
| `create-ledger` | 10 | 1 | 1 hour | **Fail-Closed** (per-IP) |
| `upload-receipt` | 50 | 5 | 1 min | Fail-Open |
| `webhooks` | 100 | 10 | 1 min | Fail-Open |
| `health-check` | 10 | 1 | 1 min | Fail-Open |
| Default | 100 | 10 | 1 min | Fail-Open |

### Fail-Open vs Fail-Closed

When **BOTH Redis AND Database** are unavailable:

**Fail-Closed** (block requests):
- `execute-payout`, `process-payout`: Prevents double payouts
- `stripe-webhook`, `plaid`: Prevents replay attacks
- `record-sale`, `record-refund`: Prevents transaction flooding
- `create-ledger`: Prevents resource exhaustion
- `send-statements`: Prevents email spam
- `import-transactions`, `import-bank-statement`: Prevents data flooding

**Fail-Open** (allow with warning):
- `generate-pdf`, `generate-report`: Better UX, lower risk
- `get-balance`, `get-transactions`: Read-only operations
- `webhooks`, `health-check`: System operations

### Environment Variables Required

```bash
# Supabase Edge Function secrets
UPSTASH_REDIS_URL=https://your-instance.upstash.io
UPSTASH_REDIS_TOKEN=your-token-here
```

### Testing Rate Limits

```bash
# Test rate limiting is working
for i in {1..15}; do 
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://YOUR_PROJECT.supabase.co/functions/v1/health-check" \
    -H "x-api-key: YOUR_API_KEY"
done
# Expected: 200 for first 10, 429 for remaining 5
```

---

## Updated Functions (48 Total)

### Core Transactions (9)
| Function | Description |
|----------|-------------|
| `record-sale` | Sale recording with creator splits |
| `record-refund` | Refund processing with balance reversal |
| `record-expense` | Expense tracking with categories |
| `record-income` | Income recording |
| `record-transfer` | Internal account transfers |
| `record-adjustment` | Journal adjustments (corrections, accruals) |
| `record-bill` | Accounts payable entry |
| `record-opening-balance` | Opening balance for new ledgers |
| `reverse-transaction` | Transaction reversal with audit trail |

### Queries (4)
| Function | Description |
|----------|-------------|
| `get-balance` | Single creator balance lookup |
| `get-balances` | All balances, summary, or by creator |
| `get-transactions` | Transaction listing with filters |
| `get-runway` | Cash runway and financial health |

### Payouts (3)
| Function | Description |
|----------|-------------|
| `process-payout` | Initiate payout (Stripe/manual) |
| `execute-payout` | Execute approved payout |
| `check-payout-eligibility` | Verify tax info, holds, minimums |

### Reports (5)
| Function | Description |
|----------|-------------|
| `trial-balance` | Trial balance report |
| `profit-loss` | Profit & Loss statement |
| `generate-report` | Various financial reports |
| `generate-pdf` | PDF document generation |
| `export-report` | CSV/JSON data exports |

### Management (7)
| Function | Description |
|----------|-------------|
| `reconcile` | Bank reconciliation engine |
| `manage-splits` | Revenue split configuration |
| `manage-contractors` | Contractor management & 1099 |
| `manage-recurring` | Recurring expense templates |
| `manage-budgets` | Budget envelope tracking |
| `manage-bank-accounts` | Bank account settings |
| `close-period` | Period closing with snapshots |

### Ledger & Health (3)
| Function | Description |
|----------|-------------|
| `create-ledger` | Ledger creation (hashed API keys) |
| `list-ledgers` | List ledgers for owner |
| `health-check` | Ledger health monitoring |

### Integrations (3)
| Function | Description |
|----------|-------------|
| `stripe-webhook` | Stripe event processing (replay protection) |
| `plaid` | Plaid bank integration (Vault encryption) |
| `webhooks` | Outbound webhook delivery (SSRF protection) |

### Standard Mode (4)
| Function | Description |
|----------|-------------|
| `pay-bill` | Bill payment (A/P → Cash) |
| `receive-payment` | Payment receipt (Cash → A/R) |
| `send-statements` | Email creator statements |
| `frozen-statements` | Frozen period statements with integrity |

### Tax & Billing (4)
| Function | Description |
|----------|-------------|
| `generate-tax-summary` | 1099 year-end summaries |
| `tax-documents` | 1099 document management |
| `submit-tax-info` | Deprecated (returns 410 Gone) |
| `billing` | Subscription management (JWT auth) |

### Imports & Utilities (6)
| Function | Description |
|----------|-------------|
| `import-transactions` | CSV/OFX transaction import |
| `import-bank-statement` | Bank statement import |
| `upload-receipt` | Receipt image upload |
| `stripe` | Stripe transaction management |
| `stripe-billing-webhook` | Billing lifecycle events |
| `process-webhooks` | Webhook queue processor (cron) |

---

## Security Features

### Authentication
- ✅ **Hash-based API key validation** - SHA-256, no plaintext in DB
- ✅ **Timing-safe comparison** - Prevents timing attacks
- ✅ **Plaid tokens in Vault** - Encrypted at rest

### Rate Limiting
- ✅ **Redis-backed (Upstash)** - Distributed, persistent, primary layer
- ✅ **Database fallback** - Postgres `rate_limits` table as backup
- ✅ **"Narrow Gate" throttling** - DB gets 10% of Redis limits
- ✅ **Sliding window algorithm** - Prevents burst abuse
- ✅ **Per-endpoint limits** - Tuned for each operation type
- ✅ **Fail-closed for sensitive ops** - Blocks when both layers fail
- ✅ **Circuit breaker** - Skips Redis for 30s after failure

### Request Validation
- ✅ **Input validation** - All parameters sanitized
- ✅ **Request body limits** - 256-512KB max
- ✅ **Date format validation** - YYYY-MM-DD required
- ✅ **Amount validation** - Positive integers (cents)
- ✅ **ID sanitization** - Length and character limits

### CORS & Headers
- ✅ **Dynamic CORS** - Origin-based, no wildcards
- ✅ **Security headers** - CSP, HSTS in Next.js

### Audit Trail
- ✅ **IP address logging** - Full request tracking
- ✅ **User agent logging** - Client fingerprinting
- ✅ **Risk scoring** - Suspicious activity detection
- ✅ **Fire-and-forget** - Non-blocking audit writes

### Webhook Security
- ✅ **Stripe replay protection** - 5-minute window
- ✅ **Constant-time signatures** - Prevents timing leaks
- ✅ **SSRF protection** - Private IP blocking
- ✅ **Domain allowlist** - Outbound restrictions

---

## Deployment

```bash
cd /Users/osifo/Desktop/soledgic
chmod +x scripts/deploy-all-functions.sh
./scripts/deploy-all-functions.sh
```

## Testing

```bash
cd test-data && ./test-api.sh
```

---

## Shared Utilities

All functions import from `_shared/utils.ts`:

```typescript
import { 
  createHandler,       // Standard handler wrapper with auth & rate limiting
  getCorsHeaders,      // Dynamic CORS based on origin
  getSupabaseClient,   // Configured Supabase client
  validateApiKey,      // Hash-based key validation
  checkRateLimit,      // Redis rate limit check
  jsonResponse,        // Standard JSON response
  errorResponse,       // Error response with CORS
  validateId,          // ID sanitization
  validateString,      // String length limits
  validateAmount,      // Amount validation
  validateEmail,       // Email format check
  getClientIp,         // Client IP extraction
  LedgerContext        // Type for validated ledger
} from '../_shared/utils.ts'
```

---

## Files Modified

```
supabase/functions/_shared/utils.ts           # Security utilities + rate limiting
supabase/functions/*/index.ts                 # 48 functions updated
supabase/migrations/20260119_security.sql     # Vault & hashing
scripts/deploy-all-functions.sh               # Deployment script
docs/SECURITY_HARDENING.md                    # This document
TODO.md                                       # Updated tracking
```

---

## Database Tables

### `rate_limits` Table (Active - DB Fallback)

Used as fallback when Redis is unavailable:

```sql
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,           -- API key or IP:API key combo
  endpoint TEXT NOT NULL,      -- Function name
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key, endpoint)
);

-- Postgres function for rate limiting
CREATE FUNCTION check_rate_limit(
  p_key TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN;
```

**Note:** DB fallback uses **10% of Redis limits** ("Narrow Gate") to protect Postgres during Redis outages.

---

**Status: Production Ready ✅**

Last Updated: December 22, 2025
