# Soledgic: The Banker Model

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SOLEDGIC PLATFORM                               │
│                         (Your Payment Processor Platform Account)                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          ESCROW HOLDING                              │   │
│  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │   │
│  │   │ Booklyverse  │   │   MTF Prop   │   │   Future     │           │   │
│  │   │    $5,000    │   │   $12,000    │   │   Venture    │           │   │
│  │   │    HELD      │   │    HELD      │   │    HELD      │           │   │
│  │   └──────────────┘   └──────────────┘   └──────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    [ADMIN: Release Funds]                                   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     STRIPE CUSTOM ACCOUNTS                          │   │
│  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │   │
│  │   │   Author A   │   │   Trader B   │   │   Author C   │           │   │
│  │   │ acct_xxx123  │   │ acct_xxx456  │   │ acct_xxx789  │           │   │
│  │   │  $800 avail  │   │  $2,500 avail│   │  $150 avail  │           │   │
│  │   └──────────────┘   └──────────────┘   └──────────────┘           │   │
│  │            │                  │                  │                  │   │
│  │    [Request Payout]  [Request Payout]  [Request Payout]            │   │
│  │            ▼                  ▼                  ▼                  │   │
│  │      ┌─────────┐        ┌─────────┐        ┌─────────┐             │   │
│  │      │  Bank   │        │  Bank   │        │  Bank   │             │   │
│  │      └─────────┘        └─────────┘        └─────────┘             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Two Gates

### Gate 1: Release (Platform → Connected Account)
- Money moves from YOUR Payment Processor balance to the creator's Custom account
- **YOU control this** via `release-funds` endpoint
- Default: Held for 7 days (dispute window)
- Can be: Manual only, Auto after X days, or Rule-based

### Gate 2: Payout (Connected Account → Bank)
- Money moves from creator's Payment Processor account to their bank
- **YOU control this** via `payouts_paused: true` on Custom accounts
- Creator must request payout
- Admin approves → Payout executes

---

## API Endpoints

### 1. `POST /connected-accounts`

Create and manage Payment Processor Custom accounts for creators.

**Create Account:**
```typescript
{
  action: 'create',
  entity_type: 'creator',    // or 'venture', 'merchant'
  entity_id: 'author_123',
  email: 'author@example.com',
  display_name: 'Jane Author',
  country: 'US'
}
```

**Response:**
```typescript
{
  success: true,
  account: {
    id: 'uuid',
    processor_account_id: 'acct_xxx',
    processor_status: 'pending',
    charges_enabled: false,
    payouts_enabled: false,
    can_receive_transfers: false  // Must complete onboarding first
  }
}
```

**Create Onboarding Link:**
```typescript
{
  action: 'create_onboarding_link',
  processor_account_id: 'acct_xxx',
  return_url: 'https://booklyverse.com/author/dashboard',
  refresh_url: 'https://booklyverse.com/author/onboarding'
}
```

### 2. `POST /create-checkout`

Create payment intent (unchanged from before). Money lands in YOUR platform account.

```typescript
{
  amount: 999,              // $9.99 in cents
  creator_id: 'author_123',
  product_id: 'book_456',
  product_name: 'The Great Novel'
}
```

### 3. Webhook: `payment_intent.succeeded`

Automatically handled. Creates ledger entries with:
- `release_status: 'held'`
- `hold_until: NOW() + 7 days`
- `hold_reason: 'dispute_window'`

### 4. `POST /release-funds`

The banker's control panel.

**Get Held Funds Dashboard:**
```typescript
{
  action: 'get_held',
  venture_id: 'booklyverse',  // Optional filter
  ready_only: true            // Only entries past hold period
}
```

**Response:**
```typescript
{
  held_funds: [
    {
      entry_id: 'uuid',
      amount: 7.99,
      held_since: '2025-01-22T10:00:00Z',
      days_held: 7,
      hold_until: '2025-01-29T10:00:00Z',
      ready_for_release: true,
      recipient_type: 'creator',
      recipient_id: 'author_123',
      recipient_name: 'Jane Author',
      has_connected_account: true,
      processor_account_id: 'acct_xxx',
      product_name: 'The Great Novel'
    }
  ]
}
```

**Release Single Entry:**
```typescript
{
  action: 'release',
  entry_id: 'uuid'
}
```

**Batch Release:**
```typescript
{
  action: 'batch_release',
  entry_ids: ['uuid1', 'uuid2', 'uuid3']
}
```

**Void (Cancel) Held Funds:**
```typescript
{
  action: 'void',
  entry_id: 'uuid',
  void_reason: 'Suspected fraud'
}
```

**Trigger Auto-Release:**
```typescript
{
  action: 'auto_release'  // Releases all entries past hold_until
}
```

### 5. `POST /payout-request` (Coming Soon)

For creators to request payout from their connected account to bank.

---

## Database Schema

### `connected_accounts`
```sql
- processor_account_id     -- acct_xxx
- processor_status         -- pending, restricted, enabled, disabled
- charges_enabled       -- Can receive charges
- payouts_enabled       -- Can receive payouts
- payouts_paused: true  -- CRITICAL: You control payouts
- can_receive_transfers -- Set to true only when fully verified
```

### `entries` (Updated)
```sql
- release_status        -- immediate, held, pending_release, released, voided
- hold_reason           -- dispute_window, manual_review, etc.
- hold_until            -- Auto-release date
- released_at           -- When released
- released_by           -- Admin who released
- release_transfer_id   -- tr_xxx from Payment Processor
```

### `escrow_releases`
```sql
- entry_id              -- What we're releasing
- recipient_stripe_account  -- acct_xxx
- amount, currency
- status                -- pending, processing, completed, failed
- processor_transfer_id    -- tr_xxx
- approved_by, executed_at
```

---

## Ledger Settings

```typescript
{
  // Release control
  default_hold_days: 7,           // Days to hold before auto-release
  require_manual_release: false,  // If true, never auto-release
  
  // Split configuration
  default_split_percent: 80,      // Creator gets 80%
  
  // Payout control
  min_payout_amount: 10.00,
  payout_approval_required: true
}
```

---

## Flow: Reader Buys Book

```
1. Reader → Booklyverse → POST /create-checkout
   ↓
2. Booklyverse shows Payment Processor Elements checkout
   ↓
3. Reader pays $9.99
   ↓
4. Payment Processor → POST /processor-webhook (payment_intent.succeeded)
   ↓
5. Soledgic creates entries:
   - DEBIT cash $9.99
   - DEBIT fees $0.59 (Payment Processor fee)
   - CREDIT author_balance $7.52 (80% of net) [HELD, hold_until: +7 days]
   - CREDIT platform_revenue $1.88 (20% of net)
   ↓
6. Author sees "Pending: $7.52" in dashboard
   ↓
7. [7 days pass, OR admin clicks Release]
   ↓
8. POST /release-funds { action: 'release', entry_id: '...' }
   ↓
9. Soledgic → Payment Processor Transfer API
   ↓
10. Author's connected account now has $7.52
    ↓
11. Author sees "Available: $7.52" in dashboard
    ↓
12. Author clicks "Withdraw"
    ↓
13. POST /payout-request { amount: 7.52 }
    ↓
14. Admin approves (or auto-approve if configured)
    ↓
15. Payment Processor Payout → Author's bank
```

---

## Why This Architecture?

1. **Fraud Protection**: Disputes happen in first 7-14 days. Money stays with you until safe.

2. **Treasury Float**: While held, funds contribute to your balance. At scale, this is meaningful.

3. **Total Control**: You ARE the bank. Every dollar moves only when you say so.

4. **Flexibility**: Per-venture policies, per-creator overrides, rule-based releases.

5. **Compliance**: Clear audit trail of every release decision.

---

## Migration Checklist

- [ ] Apply migrations:
  - `20260240_escrow_control_system.sql`
  - `20260241_stripe_custom_accounts.sql`

- [ ] Deploy functions:
  - `create-checkout`
  - `connected-accounts`
  - `release-funds`

- [ ] Configure Payment Processor:
  - Ensure Platform account exists
  - Configure webhook for `account.updated` events

- [ ] Create first connected account (test)

- [ ] Test full flow:
  - Create checkout → Pay → Entry created as HELD
  - Verify hold period
  - Release funds → Transfer created
  - Verify connected account balance

---

## Files Created/Modified

### New Migrations
- `20260240_escrow_control_system.sql` - Escrow tables and functions
- `20260241_stripe_custom_accounts.sql` - Connected accounts infrastructure

### New Edge Functions
- `connected-accounts/index.ts` - Create/manage Payment Processor Custom accounts
- `release-funds/index.ts` - Escrow release control

### Modified Files
- `processor-webhook/index.ts` - Entries now created with `release_status: 'held'`
- `_shared/utils.ts` - Added Booklyverse CORS, rate limits

### Documentation
- `docs/BOOKLYVERSE_INTEGRATION.md` - Basic integration guide
- This file - Complete banker model documentation
