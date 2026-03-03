# Environment Validation Runbook

## Required Environment Variables by Deployment Target

### Supabase Edge Functions (Production)

| Variable | Required | Description |
|----------|----------|-------------|
| `PROCESSOR_BASE_URL` | Yes | Finix API base URL (production) |
| `PROCESSOR_USERNAME` | Yes | Finix API username |
| `PROCESSOR_PASSWORD` | Yes | Finix API password |
| `PROCESSOR_MERCHANT_ID` | Yes | Platform merchant ID |
| `PROCESSOR_NAME` | Yes | Processor name (must NOT be DUMMY_V1) |
| `PROCESSOR_ENV` | Yes | Must be `production` |
| `PROCESSOR_API_VERSION` | No | Defaults to `2022-02-01` |
| `PROCESSOR_VERSION_HEADER` | No | Defaults to `Finix-Version` |
| `PROCESSOR_TRANSFERS_PATH` | No | Defaults to `/transfers` |
| `PROCESSOR_PAYOUT_SOURCE_ID` | Yes (payouts) | Platform funding instrument for CREDIT flows |
| `PROCESSOR_PAYOUT_OPERATION_KEY` | No | Defaults to `PUSH_TO_ACH` |
| `RESEND_API_KEY` | Yes | Email delivery |
| `FROM_EMAIL` | Yes | Sender email address |
| `CRON_SECRET` | Yes | For scheduled job authentication |
| `SUPABASE_URL` | Auto | Set by Supabase |
| `SUPABASE_ANON_KEY` | Auto | Set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Set by Supabase |

### Vercel (Next.js App — Production)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | For server-side operations |
| `PROCESSOR_WEBHOOK_TOKEN` | Conditional | Required if not using signing key |
| `PROCESSOR_WEBHOOK_SIGNING_KEY` | Conditional | HMAC signing key (preferred over token) |
| `CSRF_ALLOWED_ORIGINS` | Yes | Comma-separated allowed origins |

## Pre-Deploy Validation Script

Run before deploying to verify all required variables are set:

```bash
#!/bin/bash
# scripts/validate-env.sh

ERRORS=0

check_var() {
  local name=$1
  local required=$2
  local value=$(eval echo \$$name)

  if [ -z "$value" ] && [ "$required" = "yes" ]; then
    echo "ERROR: $name is not set"
    ERRORS=$((ERRORS + 1))
  elif [ -z "$value" ]; then
    echo "WARN:  $name is not set (optional)"
  else
    echo "OK:    $name is set"
  fi
}

echo "=== Supabase Edge Function Environment ==="
check_var PROCESSOR_BASE_URL yes
check_var PROCESSOR_USERNAME yes
check_var PROCESSOR_PASSWORD yes
check_var PROCESSOR_MERCHANT_ID yes
check_var PROCESSOR_NAME yes
check_var PROCESSOR_ENV yes
check_var PROCESSOR_PAYOUT_SOURCE_ID yes
check_var RESEND_API_KEY yes
check_var FROM_EMAIL yes
check_var CRON_SECRET yes

echo ""
echo "=== Vercel Environment ==="
check_var NEXT_PUBLIC_SUPABASE_URL yes
check_var NEXT_PUBLIC_SUPABASE_ANON_KEY yes
check_var SUPABASE_SERVICE_ROLE_KEY yes
check_var CSRF_ALLOWED_ORIGINS yes

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "FAILED: $ERRORS required variable(s) missing"
  exit 1
else
  echo "PASSED: All required variables are set"
fi
```

## Safety Checks

### Processor Environment Mismatch

The payment provider validates that the base URL matches the configured environment:
- `PROCESSOR_ENV=production` + sandbox URL → **blocked**
- `PROCESSOR_ENV=sandbox` + production URL → **blocked**

### PROCESSOR_NAME Guard

In production (`PROCESSOR_ENV=production`), `PROCESSOR_NAME` must be explicitly set. If missing, payout execution fails with `PROCESSOR_NAME must be configured in production`.

### Webhook Auth

If `PROCESSOR_WEBHOOK_SIGNING_KEY` is set, signature verification is **mandatory** — missing `Finix-Signature` headers are rejected. Token auth is only used as a fallback when no signing key is configured.

## Listing Current Supabase Secrets

```bash
supabase secrets list
```

Note: Values are not shown, only names. To verify a value, check the function's behavior or deploy a temporary debug log.

## Sandbox vs Production Checklist

Before switching from sandbox to production:

- [ ] `PROCESSOR_ENV` set to `production`
- [ ] `PROCESSOR_BASE_URL` points to production Finix URL
- [ ] `PROCESSOR_USERNAME` / `PROCESSOR_PASSWORD` are production credentials
- [ ] `PROCESSOR_MERCHANT_ID` is the production merchant
- [ ] `PROCESSOR_NAME` is set (not DUMMY_V1)
- [ ] `PROCESSOR_PAYOUT_SOURCE_ID` is a production funding instrument
- [ ] `PROCESSOR_WEBHOOK_SIGNING_KEY` is configured (not just token auth)
- [ ] All ledgers have production API keys (not `sk_test_*`)
- [ ] Webhook endpoints use HTTPS
- [ ] CSRF_ALLOWED_ORIGINS contains only production domains
