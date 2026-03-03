# Secret Rotation Runbook

## Secrets Inventory

| Secret | Location | Rotation Impact |
|--------|----------|----------------|
| `PROCESSOR_USERNAME` / `PROCESSOR_PASSWORD` | Supabase env + Vercel env | All payment operations pause until updated |
| `PROCESSOR_WEBHOOK_TOKEN` | Supabase env + Vercel env + Finix dashboard | Inbound webhooks rejected until both sides match |
| `PROCESSOR_WEBHOOK_SIGNING_KEY` | Supabase env + Vercel env + Finix dashboard | Inbound webhooks rejected until both sides match |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (auto-managed) | Only rotate via Supabase dashboard |
| `RESEND_API_KEY` | Supabase env + Vercel env | Emails stop until updated |
| `CRON_SECRET` | Supabase env | Scheduled jobs fail until updated |
| API keys (`sk_test_*`, `sk_live_*`) | `ledgers.api_key_hash` in DB | Per-ledger, via `generate_api_key()` RPC |
| Webhook endpoint secrets | `vault.secrets` | Per-endpoint, via `rotate_webhook_secret()` RPC |

## Rotating Processor Credentials (Finix)

### 1. Generate New Credentials in Finix

- Log into Finix dashboard
- Navigate to Settings > API Keys
- Create a new API key pair

### 2. Update Supabase Environment

```bash
# Update Edge Function secrets
supabase secrets set \
  PROCESSOR_USERNAME=USRnew_username \
  PROCESSOR_PASSWORD=new_password

# Verify
supabase secrets list
```

### 3. Update Vercel Environment

```bash
# Update via Vercel CLI or dashboard
vercel env rm PROCESSOR_USERNAME production
vercel env rm PROCESSOR_PASSWORD production
echo "USRnew_username" | vercel env add PROCESSOR_USERNAME production
echo "new_password" | vercel env add PROCESSOR_PASSWORD production
vercel deploy --prod
```

### 4. Verify

```bash
# Test a balance check (non-destructive)
curl -X POST "$SUPABASE_URL/functions/v1/health-check" \
  -H "x-api-key: $API_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "run"}'
```

### 5. Revoke Old Credentials

- Disable/delete old API key pair in Finix dashboard

## Rotating Processor Webhook Token

### 1. Generate New Token

```bash
openssl rand -hex 32
```

### 2. Update Both Sides Simultaneously

Window of risk: webhooks received between updating one side and the other will be rejected.

```bash
# Step A: Update Vercel (receives webhooks)
vercel env rm PROCESSOR_WEBHOOK_TOKEN production
echo "NEW_TOKEN_HEX" | vercel env add PROCESSOR_WEBHOOK_TOKEN production
vercel deploy --prod

# Step B: Update Finix webhook configuration
# In Finix dashboard: Settings > Webhooks > Edit > Update auth token
```

### 3. Verify

Send a test webhook from Finix dashboard and check it's accepted.

## Rotating Webhook Signing Key

If using HMAC signature verification instead of token auth:

### 1. Generate New Key

```bash
openssl rand -hex 32
```

### 2. Update Vercel

```bash
vercel env rm PROCESSOR_WEBHOOK_SIGNING_KEY production
echo "NEW_SIGNING_KEY" | vercel env add PROCESSOR_WEBHOOK_SIGNING_KEY production
vercel deploy --prod
```

### 3. Update Finix

Update the signing secret in Finix dashboard webhook configuration.

### 4. Verify with Test Event

Check Vercel function logs to confirm signature verification passes.

## Rotating Per-Ledger API Keys

```sql
-- Generate a new API key for a ledger
SELECT generate_api_key() as new_key;

-- Update the ledger (hash the new key first)
UPDATE ledgers
SET api_key_hash = encode(digest('sk_live_NEW_KEY_HERE', 'sha256'), 'hex'),
    updated_at = NOW()
WHERE id = 'LEDGER_UUID';
```

Communicate the new key to the customer securely.

## Rotating Outbound Webhook Secrets

```sql
-- Rotate via RPC (generates new secret, returns it once)
SELECT rotate_webhook_secret('ENDPOINT_UUID');
```

Communicate the new secret to the customer securely.

## Emergency: Compromised Secret

1. Rotate immediately using the steps above
2. Check audit logs for unauthorized access:

```sql
SELECT * FROM audit_log
WHERE action IN ('api_key_used', 'webhook_received')
  AND created_at > 'COMPROMISE_TIMESTAMP'
ORDER BY created_at DESC;
```

3. Review processor transactions for unauthorized transfers
4. Notify affected customers if their data may have been exposed
