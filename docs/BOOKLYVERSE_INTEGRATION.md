# Soledgic ↔ Booklyverse Integration Guide

## The "Banker Model" Architecture

Soledgic operates as an **Escrow Agent** with full control over cash flow:

```
Reader pays $10 for book
         ↓
Money lands in → Soledgic Platform Payment Processor Account (YOUR account)
         ↓
Ledger entry created: status = HELD
         ↓
[7 days pass - dispute window]
         ↓
Admin clicks "Release" OR auto-release triggers
         ↓
Payment Processor Transfer → Author's Connected Account (Custom)
         ↓
Ledger entry updated: status = RELEASED
         ↓
Author sees "Available" balance
         ↓
Author requests payout → You approve → Bank transfer
```

**Key Principle:** Money never moves until YOU say so.

---

## Why Custom Accounts?

| Account Type | Who Controls | Your Control Level |
|-------------|--------------|-------------------|
| Standard | Creator | ❌ None - they control everything |
| Express | Shared | ⚠️ Limited - they control payouts |
| **Custom** | **YOU** | ✅ **Total** - you control everything |

With Custom accounts:
- You collect creator KYC info
- You submit it to Payment Processor
- You control when funds transfer to their account
- You control when payouts go to their bank
- Auto-payouts are **disabled**

---

## The Two-Step Release

### Step 1: Release to Wallet (Internal Transfer)
Moving money from YOUR Payment Processor balance → Creator's Connected Account

```
Soledgic Platform Balance: $1000
                ↓
        [Release $80 to Author_A]
                ↓
Author_A's Connected Account: $80
```

### Step 2: Payout to Bank (External Transfer)
Moving money from Creator's Connected Account → Their Bank

```
Author_A's Connected Account: $80
                ↓
        [Author requests payout]
                ↓
        [You approve]
                ↓
Author_A's Bank Account: $80
```

**You control both steps.**

---

## Integration Points

### 1. Create Checkout (Payment Initiation)

**Endpoint:** `POST /functions/v1/create-checkout`

**Request:**
```typescript
{
  amount: 999,              // In cents ($9.99)
  creator_id: "author_123",
  payment_method_id: "src_xxx", // Required buyer payment source/instrument
  product_id: "book_456",
  product_name: "The Great Novel",
  customer_email: "reader@example.com"
}
```

**Response:**
```typescript
{
  success: true,
  client_secret: "pi_xxx_secret_yyy",
  payment_intent_id: "pi_xxx",
  breakdown: {
    gross_amount: 9.99,
    creator_amount: 7.99,    // 80% - but HELD
    platform_amount: 2.00
  }
}
```

### 2. Webhook Processing (Automatic + Escrow)

When payment succeeds, Soledgic automatically:
1. Creates transaction record
2. Creates entries with `release_status = 'held'`
3. Sets `hold_until = NOW() + 7 days` (configurable)

**No funds move yet.** Money sits in YOUR Payment Processor account.

### 3. View Held Funds (Admin Dashboard)

**Endpoint:** `POST /functions/v1/release-funds`

**Request:**
```typescript
{
  action: "get_summary"
}
```

**Response:**
```typescript
{
  success: true,
  summary: {
    total_held: 5000.00,
    total_ready: 3500.00,  // Past dispute window
    ventures: [
      {
        venture_name: "Booklyverse",
        total_held: 3000.00,
        ready_for_release: 2500.00,
        entry_count: 150
      },
      {
        venture_name: "MTF Prop",
        total_held: 2000.00,
        ready_for_release: 1000.00,
        entry_count: 45
      }
    ]
  }
}
```

### 4. Release Funds (Manual or Auto)

**Single Release:**
```typescript
{
  action: "release",
  entry_id: "uuid-of-held-entry"
}
```

**Batch Release:**
```typescript
{
  action: "batch_release",
  entry_ids: ["uuid-1", "uuid-2", "uuid-3"]
}
```

**What happens:**
1. Validates entry is `held` and past `hold_until`
2. Creates Payment Processor Transfer to creator's Connected Account
3. Updates entry to `released`
4. Logs audit trail

### 5. Check Creator Balance

**Endpoint:** `POST /functions/v1/get-balance`

**Response:**
```typescript
{
  balance: {
    held: 150.00,       // In escrow (not yet released)
    available: 500.00,  // Released to their Connected Account
    pending: 0.00,      // Processing
    total_earned: 2000.00,
    total_paid_out: 1350.00
  }
}
```

### 6. Creator Requests Payout

**Endpoint:** `POST /functions/v1/process-payout`

**Request:**
```typescript
{
  creator_id: "author_123",
  amount: 10000  // In cents
}
```

**This requires:**
1. Creator has Connected Account with `payouts_enabled = true`
2. Sufficient `available` balance (not `held`)
3. Your approval (if manual payout mode)

---

## Configuration

### Ledger Settings

```json
{
  "default_hold_days": 7,           // Dispute window
  "require_manual_release": false,  // true = always manual, false = auto after hold_days
  "default_split_percent": 80,      // Creator gets 80%
  "min_payout_amount": 10.00
}
```

### Creating a Venture

```sql
INSERT INTO ventures (
  ledger_id,
  venture_id,
  name,
  release_policy,
  dispute_window_days,
  default_creator_percent
) VALUES (
  'your-ledger-uuid',
  'booklyverse',
  'Booklyverse',
  'auto_after_window',  -- or 'manual' for full control
  7,
  80.00
);
```

### Creating a Creator's Connected Account

```sql
INSERT INTO connected_accounts (
  ledger_id,
  entity_type,
  entity_id,
  display_name,
  processor_account_id,
  processor_status,
  payouts_enabled,
  is_active
) VALUES (
  'your-ledger-uuid',
  'creator',
  'author_123',
  'Jane Doe',
  'acct_xxx',  -- Created via Payment Processor API
  'enabled',
  true,
  true
);
```

---

## Why This Matters

### 1. Fraud Protection
If a reader uses a stolen card:
- Money is still in YOUR account
- You don't have to chase the author for a refund
- Keep the entry held until your investigation is complete, then release or refund

### 2. Dispute Window
Payment Processor disputes can come up to 120 days later, but most come within 7-14 days:
- Hold funds for the high-risk period
- Auto-release after window passes
- Or hold indefinitely and release manually

### 3. Treasury Yield
While funds sit in your Payment Processor account:
- They contribute to your balance
- You can earn interest on cash management products
- Float is money

### 4. Operational Control
If you suspect fraud, a bad actor, or need to investigate:
- Funds are frozen by default
- You release only what you're confident about
- Full audit trail of every release

---

## Files Created

### New Files
- `supabase/functions/create-checkout/index.ts` - Payment initiation
- `supabase/functions/release-funds/index.ts` - Manual/batch release
- `supabase/migrations/20260240_escrow_control_system.sql` - Escrow schema

### Updated Files
- `apps/web/src/app/api/webhooks/processor/route.ts` - Inbound processor events persisted
- `supabase/functions/process-processor-inbox/index.ts` - Normalized processor events update escrow/refund/payout state
- `supabase/functions/_shared/utils.ts` - Booklyverse CORS, rate limits

---

## Deployment Checklist

- [ ] Run migration: `20260240_escrow_control_system.sql`
- [ ] Deploy functions: `create-checkout`, `release-funds`
- [ ] Create Booklyverse venture record
- [ ] Configure Payment Processor Custom accounts (disable auto-payouts!)
- [ ] Set up admin dashboard to view/release held funds
- [ ] Configure cron job for auto-release (optional)
- [ ] Update Booklyverse to call Soledgic instead of Payment Processor directly
