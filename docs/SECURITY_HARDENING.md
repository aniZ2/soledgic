# Soledgic - Security Hardening Complete ✅

## Summary

The repo currently contains **72 deployable Edge Functions** under `supabase/functions` (plus `_shared`). This document describes the current shared security layer and the live deploy surface, not the older 48-function rollout snapshot.

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
| `refunds` | 100 | 10 | 1 min | **Fail-Closed** |
| `execute-payout` | 50 | 5 | 1 min | **Fail-Closed** |
| `payouts` | 50 | 5 | 1 min | **Fail-Closed** |
| `participants` | 100 | 10 | 1 min | Fail-Open |
| `wallets` | 100 | 10 | 1 min | Fail-Open |
| `transfers` | 100 | 10 | 1 min | Fail-Open |
| `holds` | 50 | 5 | 1 min | **Fail-Closed** |
| `checkout-sessions` | 100 | 10 | 1 min | **Fail-Closed** |
| `generate-pdf` | 20 | 2 | 1 min | Fail-Open |
| `generate-report` | 30 | 3 | 1 min | Fail-Open |
| `export-report` | 20 | 2 | 1 min | Fail-Open |
| `import-transactions` | 10 | 1 | 1 min | **Fail-Closed** |
| `import-bank-statement` | 10 | 1 | 1 min | **Fail-Closed** |
| `send-statements` | 20 | 2 | 1 min | **Fail-Closed** |
| `create-ledger` | 10 | 1 | 1 hour | **Fail-Closed** (per-IP) |
| `upload-receipt` | 50 | 5 | 1 min | Fail-Open |
| `webhooks` | 100 | 10 | 1 min | Fail-Open |
| `health-check` | 5 | 1 | 1 min | Fail-Open |
| Default | 100 | 10 | 1 min | Fail-Open |

### Fail-Open vs Fail-Closed

When **BOTH Redis AND Database** are unavailable:

**Fail-Closed** (block requests):
- `execute-payout`, `payouts`: Prevents double payouts
- `record-sale`, `refunds`: Prevents duplicate or abusive transaction writes
- `create-ledger`: Prevents resource exhaustion
- `send-statements`: Prevents email spam
- `import-transactions`, `import-bank-statement`: Prevents bulk data flooding
- `checkout-sessions`: Prevents checkout spam and upstream processor exhaustion
- `holds`: Prevents unauthorized or repeated fund-release operations

**Fail-Open** (allow with warning):
- `generate-pdf`, `generate-report`, `export-report`: Better UX, lower risk
- `participants`, `wallets`, `transfers`: Lower-risk treasury operations
- `webhooks`, `health-check`, `upload-receipt`: Operational endpoints

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
    "https://api.soledgic.com/v1/health-check" \
    -H "x-api-key: YOUR_API_KEY"
done
# Expected: 200 for first 10, 429 for remaining 5
```

---

## Current Edge Function Inventory (72 Total)

Canonical source: `supabase/functions/*` excluding `_shared`. The current deployable set is:

```text
ap-aging
ar-aging
balance-sheet
bill-overages
billing
checkout-sessions
close-period
compliance
configure-alerts
configure-risk-policy
create-ledger
credits
delete-creator
earnings
execute-payout
export-report
fraud
frozen-statements
generate-pdf
generate-report
get-runway
get-transactions
health-check
holds
import-bank-statement
import-transactions
invoices
list-ledgers
manage-bank-accounts
manage-budgets
manage-contractors
manage-recurring
manage-splits
ops-monitor
participants
pay-bill
payouts
platform-payouts
preflight-authorization
process-processor-inbox
process-webhooks
processor-reconciliation
profit-loss
project-intent
receive-payment
reconcile
reconcile-checkout-ledger
reconciliations
record-adjustment
record-bill
record-expense
record-income
record-opening-balance
record-sale
record-transfer
refunds
register-instrument
release-expired-holds
reverse-transaction
risk-evaluation
scheduled-payouts
security-alerts
send-breach-alert
send-statements
submit-tax-info
tax
test-cleanup
transfers
trial-balance
upload-receipt
wallets
webhooks
```

---

## Security Features

### Authentication
- ✅ **Hash-based API key validation** - SHA-256, no plaintext in DB
- ✅ **Timing-safe comparison** - Prevents timing attacks

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
- ✅ **Payment Processor replay protection** - 5-minute window
- ✅ **Constant-time signatures** - Prevents timing leaks
- ✅ **SSRF protection** - Private IP blocking
- ✅ **Domain allowlist** - Outbound restrictions

### Cross-Ledger Isolation
- ✅ **RLS on financial graph tables** - `transaction_links`, `payout_batches`, `payout_batch_items` restricted to `service_role` only
- ✅ **Ledger ownership guard** - `linkParticipantToUser` verifies participant account belongs to target ledger before identity linking
- ✅ **Ledger-scoped batch queries** - `getPayoutBatch` filters by `ledger_id` (defense in depth alongside RLS)
- ✅ **Boundary violation audit trail** - Cross-ledger attempts logged as `cross_ledger_violation` with `risk_score: 100`
- ✅ **Automated scanner** - `security-alerts` cron detects `cross_ledger_violation` events and fires Slack/email alerts (≥5/hour = critical)

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
