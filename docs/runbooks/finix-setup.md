# Finix Setup Checklist

## Initial Setup

### 1. Create Finix Account

- Sign up at finix.com
- Complete business verification
- Note your Application ID

### 2. Create API Credentials

- Navigate to Settings > API Keys
- Create a new key pair
- Save the username (`USR...`) and password securely

### 3. Create Merchant

- Navigate to Merchants
- Create a merchant for your platform
- Note the Merchant ID (`MU...`)
- This is your `PROCESSOR_MERCHANT_ID`

### 4. Set Up Payment Instruments

For payouts (CREDIT flows), you need a platform funding instrument:
- Navigate to Payment Instruments
- Create a bank account or card instrument for platform funding
- Note the Payment Instrument ID (`PI...`)
- This is your `PROCESSOR_PAYOUT_SOURCE_ID`

### 5. Configure Webhooks in Finix

- Navigate to Settings > Webhooks
- Add webhook URL: `https://your-domain.com/api/webhooks/processor`
- Select events: Transfer events (created, updated, failed)
- Set authentication:
  - **Recommended**: HMAC signing key → `PROCESSOR_WEBHOOK_SIGNING_KEY`
  - **Alternative**: Bearer token → `PROCESSOR_WEBHOOK_TOKEN`

## Environment Variables

### Sandbox

```bash
PROCESSOR_ENV=sandbox
PROCESSOR_BASE_URL=https://finix.sandbox-payments-api.com
PROCESSOR_USERNAME=USRsandbox_username
PROCESSOR_PASSWORD=sandbox_password
PROCESSOR_MERCHANT_ID=MUsandbox_merchant
PROCESSOR_NAME=DUMMY_V1
PROCESSOR_API_VERSION=2022-02-01
PROCESSOR_VERSION_HEADER=Finix-Version
PROCESSOR_TRANSFERS_PATH=/transfers
PROCESSOR_PAYOUT_SOURCE_ID=PIsandbox_instrument
PROCESSOR_PAYOUT_OPERATION_KEY=PUSH_TO_ACH
PROCESSOR_WEBHOOK_TOKEN=sandbox_webhook_token
```

### Production

```bash
PROCESSOR_ENV=production
PROCESSOR_BASE_URL=https://finix.live-payments-api.com
PROCESSOR_USERNAME=USRprod_username
PROCESSOR_PASSWORD=prod_password
PROCESSOR_MERCHANT_ID=MUprod_merchant
PROCESSOR_NAME=your_processor_name
PROCESSOR_API_VERSION=2022-02-01
PROCESSOR_VERSION_HEADER=Finix-Version
PROCESSOR_TRANSFERS_PATH=/transfers
PROCESSOR_PAYOUT_SOURCE_ID=PIprod_instrument
PROCESSOR_PAYOUT_OPERATION_KEY=PUSH_TO_ACH
PROCESSOR_WEBHOOK_SIGNING_KEY=prod_hmac_signing_key
```

## Soledgic Payment Flows via Finix

### Charge (DEBIT) Flow

```
Customer Payment → Soledgic checkout → Finix POST /transfers
  source: customer payment instrument (PI...)
  merchant: platform merchant (MU...)
  → Transfer created → Finix webhook → processor_webhook_inbox
  → process-processor-inbox → checkout.completed webhook
```

### Payout (CREDIT) Flow

```
Creator Payout → payouts (ledger resource) → execute-payout → Finix POST /transfers
  destination: creator payment instrument (PI...)
  operation_key: PUSH_TO_ACH
  processor: PROCESSOR_NAME
  → Transfer created → Finix webhook → processor_webhook_inbox
  → process-processor-inbox → payout.executed or payout.failed webhook
```

### Refund Flow

```
Record Refund → refunds (ledger resource) → refund.created webhook
  If mode=processor_refund:
    → Finix POST /transfers/{id}/reversals
    → Reversal created → Finix webhook → processor_webhook_inbox
    → process-processor-inbox → sale.refunded webhook
```

## Testing Webhooks Locally

### Using ngrok

```bash
# Start your Next.js app
cd apps/web && npm run dev

# In another terminal, expose it
ngrok http 3000

# Update Finix webhook URL to ngrok URL
# https://xxxx.ngrok.io/api/webhooks/processor
```

### Manual Test

```bash
curl -X POST http://localhost:3000/api/webhooks/processor \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PROCESSOR_WEBHOOK_TOKEN" \
  -d '{
    "entity": "transfer",
    "type": "created",
    "_embedded": {
      "transfers": [{
        "id": "TRtest123",
        "state": "SUCCEEDED",
        "amount": 5000,
        "currency": "USD",
        "type": "DEBIT",
        "tags": {
          "ledger_id": "your-ledger-uuid",
          "creator_id": "your-creator-id"
        }
      }]
    }
  }'
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Payment processor base URL is not configured` | Missing `PROCESSOR_BASE_URL` | Set in Supabase secrets |
| `Payment processor credentials are not configured` | Missing username/password | Set credentials |
| `Payment processor merchant is not configured` | Missing `PROCESSOR_MERCHANT_ID` | Set merchant ID |
| `PROCESSOR_NAME must be configured in production` | Missing in prod env | Set to your Finix processor name |
| `Merchant override is not allowed` | Client tried to set merchant_id | Platform-managed; remove from request |
| `production environment cannot use sandbox base URL` | Env/URL mismatch | Align `PROCESSOR_ENV` with URL |
| Webhook signature verification failed | Key mismatch | Verify signing key matches Finix config |
| `Signature header required when signing key is configured` | Signing key set but no header | Finix must send Finix-Signature header |
