# Soledgic Auto-Email & Processor Adapter Guide

## Overview

Soledgic now supports two powerful automation features:

1. **Auto-Email Service** - Automatically sends PDF earnings statements to creators on the 1st of each month
2. **Processor Adapter** - Swap between payment rails (Stripe Connect, Plaid, manual bank files) without changing ledger code

---

## 1. Auto-Email Service

### Configuration

```typescript
import Soledgic from '@soledgic/sdk'

const ledger = new Soledgic('sk_live_...')

// Configure auto-email
await ledger.configureEmail({
  enabled: true,
  sendDay: 1, // Day of month to send (1-28)
  fromName: 'Booklyverse',
  fromEmail: 'statements@booklyverse.com',
  subjectTemplate: 'Your {{month}} {{year}} Earnings Statement',
  bodyTemplate: `Hi {{creator_name}},

Please find attached your earnings statement for {{month}} {{year}}.

Thank you for being a creator with {{business_name}}!

Best regards,
The {{business_name}} Team`,
})
```

### Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{creator_name}}` | Creator's display name | "Jane Doe" |
| `{{month}}` | Full month name | "December" |
| `{{year}}` | Four-digit year | "2024" |
| `{{business_name}}` | Your platform name | "Booklyverse" |

### Manual Sending

```typescript
// Send statement to specific creator
await ledger.sendCreatorStatement('creator_jane_doe', 2024, 12)

// Send all statements for a month (batch)
await ledger.sendMonthlyStatements(2024, 12)

// Preview email without sending
const preview = await ledger.previewStatementEmail('creator_jane_doe')
```

### Email Providers

| Provider | Env Var | Credentials |
|----------|---------|-------------|
| SendGrid | `sendgrid` | `SENDGRID_API_KEY` |
| Resend | `resend` | `RESEND_API_KEY` |
| Console | `console` | None (testing) |

---

## 2. Processor Adapter

### Supported Rails

| Rail | Key | Description |
|------|-----|-------------|
| Finix | `finix` | Primary payout rail |
| Stripe Connect | `stripe_connect` | Instant transfers |
| Plaid Transfer | `plaid_transfer` | ACH via Plaid |
| Manual | `manual` | NACHA file generation |

### Configuration

```typescript
// Configure Stripe Connect
await ledger.configurePayoutRail('stripe_connect', {
  enabled: true,
  credentials: { secret_key: 'sk_live_xxx' }
})

// Configure manual bank files
await ledger.configurePayoutRail('manual', {
  enabled: true,
  settings: {
    company_name: 'BOOKLYVERSE',
    company_id: '1234567890',
    originating_dfi: '12345678'
  }
})
```

### Executing Payouts

```typescript
// 1. Create payout in ledger
const payout = await ledger.processPayout({
  creatorId: 'creator_jane_doe',
  referenceId: 'payout_dec_2024',
})

// 2. Execute via payment rail
const result = await ledger.executePayout(payout.payout_id)
// { success: true, rail: 'stripe_connect', external_id: 'tr_xxx' }

// Batch execution
await ledger.executeBatchPayouts(['payout_1', 'payout_2', 'payout_3'])

// Generate NACHA file for manual upload
const file = await ledger.generateBatchPayoutFile(['payout_1', 'payout_2'])
// { filename: 'payouts_2024-12-20.ach', content: '101...' }
```

---

## Deployment

```bash
# Deploy new functions
supabase functions deploy send-statements --no-verify-jwt
supabase functions deploy execute-payout --no-verify-jwt
supabase functions deploy generate-pdf --no-verify-jwt

# Run migration
supabase db push

# Set secrets
supabase secrets set EMAIL_PROVIDER=sendgrid
supabase secrets set SENDGRID_API_KEY=SG.xxx
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
```
