# Soledgic Security Update Status

## Functions Updated ✅

| Function | Status | Notes |
|----------|--------|-------|
| `_shared/utils.ts` | ✅ Updated | CORS, rate limiting, validation |
| `record-sale` | ✅ Updated | Hash-based auth, IP logging |
| `record-refund` | ✅ Updated | Hash-based auth, IP logging |
| `record-expense` | ✅ Updated | Hash-based auth, IP logging |
| `record-income` | ✅ Updated | Hash-based auth, IP logging |
| `process-payout` | ✅ Updated | Hash-based auth, IP logging |
| `execute-payout` | ✅ Updated | Vault integration, IP logging |
| `get-balance` | ✅ Updated | Hash-based auth |
| `get-transactions` | ✅ Updated | Hash-based auth, input validation |
| `stripe-webhook` | ✅ Updated | Replay protection, constant-time sig |
| `plaid` | ✅ Updated | Vault storage |
| `webhooks` | ✅ Updated | SSRF protection |

## Functions Still Using Old Pattern ⚠️

These functions still use `.eq('api_key', apiKey)` and need to be updated:

### High Priority (Financial Operations)
- `reverse-transaction`
- `record-transfer`
- `record-bill`
- `pay-bill`
- `receive-payment`
- `check-payout-eligibility`

### Medium Priority (Reporting)
- `trial-balance`
- `profit-loss`
- `generate-report`
- `generate-pdf`
- `generate-tax-summary`
- `export-report`

### Medium Priority (Reconciliation)
- `reconcile`
- `import-transactions`
- `import-bank-statement`

### Lower Priority (Management)
- `manage-splits`
- `manage-bank-accounts`
- `manage-contractors`
- `manage-recurring`
- `manage-budgets`

### Lower Priority (Other)
- `create-ledger`
- `list-ledgers`
- `close-period`
- `record-opening-balance`
- `record-adjustment`
- `get-runway`
- `get-balances`
- `upload-receipt`
- `submit-tax-info`
- `tax-documents`
- `frozen-statements`
- `send-statements`
- `health-check`
- `billing`
- `stripe`
- `stripe-billing-webhook`
- `process-webhooks`

## Quick Fix Pattern

To update any function, replace:

```typescript
// OLD (insecure - plaintext API key lookup)
const { data: ledger, error: ledgerError } = await supabase
  .from('ledgers')
  .select('id, settings, status')
  .eq('api_key', apiKey)
  .single()
```

With:

```typescript
// NEW (secure - hash-based lookup)
import { validateApiKey, getCorsHeaders, getSupabaseClient } from '../_shared/utils.ts'

const supabase = getSupabaseClient()
const ledger = await validateApiKey(supabase, apiKey)
```

## Deployment Commands

```bash
# Deploy all updated functions
supabase functions deploy record-sale --no-verify-jwt
supabase functions deploy record-refund --no-verify-jwt
supabase functions deploy record-expense --no-verify-jwt
supabase functions deploy record-income --no-verify-jwt
supabase functions deploy process-payout --no-verify-jwt
supabase functions deploy execute-payout --no-verify-jwt
supabase functions deploy get-balance --no-verify-jwt
supabase functions deploy get-transactions --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy plaid --no-verify-jwt
supabase functions deploy webhooks --no-verify-jwt

# Set production mode
supabase secrets set ENVIRONMENT=production
```

## Testing After Deployment

```bash
# Test invalid API key (should fail)
curl -X POST "https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1/record-sale" \
  -H "x-api-key: invalid" \
  -H "Content-Type: application/json" \
  -d '{"reference_id": "test", "creator_id": "c1", "amount": 1000}'

# Expected: {"success":false,"error":"Invalid API key"}
```

## Important Notes

1. **Database Migration Applied**: The `api_key` column has been removed from the `ledgers` table. All functions MUST use hash-based lookup.

2. **Functions with old pattern will fail**: Any function still using `.eq('api_key', apiKey)` will return 0 results because that column no longer exists.

3. **Priority**: Update high-priority financial functions first, then reporting, then management functions.
