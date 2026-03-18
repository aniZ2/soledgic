# Credit System Architecture (Internal)

## Overview

Virtual credits are a two-layer economy: a closed reward loop (users earn and spend) feeding an open payment system (creators get real payouts). Every credit has a funding source and an accounting trail.

**Standard rate:** 1,000 credits = $1 USD. Enforced globally. No per-platform overrides.

---

## Account Types

| Account | Type | Purpose |
|---------|------|---------|
| `user_wallet` | Per-user | Holds unconverted earned credits (dollar-equivalent) |
| `user_spendable_balance` | Per-user | Holds converted credits ready to spend |
| `credits_liability` | Per-ledger (system) | Platform's obligation for issued credits |
| `platform_marketing_expense` | Per-ledger (system) | Cost of the free credit program |
| `creator_balance` | Per-creator | Creator's earned revenue (existing) |
| `platform_revenue` | Per-ledger | Platform's revenue share (existing) |

---

## Double-Entry Flows

### 1. Issue Credits (liability at issuance)

```
User earns 5000 credits ($5)

DR platform_marketing_expense    $5.00   (expense recognized)
CR credits_liability             $5.00   (promise created)
CR user_wallet                   $5.00   (user sees balance)
```

**Transaction type:** `credit_issue`
**RPC:** `issue_credits(p_ledger_id, p_user_id, p_amount_cents, p_reason, p_reference_id)`

### 2. Convert Credits (liability settled)

```
User converts 5000 credits → $5 spendable

DR user_wallet                   $5.00   (credits leave wallet)
DR credits_liability             $5.00   (liability decreases)
CR user_spendable_balance        $5.00   (spendable goes up)
```

**Transaction type:** `credit_conversion`
**Handled in:** Edge function (not RPC — multi-account operation)
**Gate:** Minimum 5,000 credits ($5)

### 3. Redeem (spend on content)

```
User spends $5 on creator content (80/20 split)

DR user_spendable_balance        $5.00   (balance leaves user)
CR creator_balance               $4.00   (creator earns 80%)
CR platform_revenue              $1.00   (platform earns 20%)
```

**Transaction type:** `credit_redemption`
**RPC:** `redeem_credits(p_ledger_id, p_user_id, p_creator_id, p_amount_cents, p_reference_id, p_description, p_split_percent)`

### 4. Payout (existing flow)

```
Creator withdraws $4

DR creator_balance               $4.00
CR cash                          $4.00
```

Uses existing payout infrastructure (Mercury ACH, Stripe Connect, etc.)

---

## Budget Enforcement

| Column | Table | Purpose |
|--------|-------|---------|
| `credit_budget_monthly_cents` | organizations | Monthly issuance cap (0 = unlimited) |
| `credits_issued_this_month_cents` | organizations | Running counter |
| `credit_budget_reset_at` | organizations | Auto-resets at month boundary |

**Enforcement point:** `issue_credits` RPC checks budget before creating entries. Returns `Monthly credit budget exhausted` with remaining budget info.

---

## Critical Rules

1. **Liability at issuance, NOT at spend.** The moment credits are granted, the platform owes that value.
2. **No floating conversion rates.** 1000:$1 is hardcoded in the edge function, not configurable.
3. **Users cannot withdraw.** `user_wallet` and `user_spendable_balance` have no withdrawal path. Money exits only through creator payouts.
4. **Conversion is gated.** Minimum 5000 credits ($5) prevents dust conversions.
5. **Split applies on redemption.** Credit-funded purchases use the same creator/platform split as real-money purchases.

---

## Fraud Vectors & Mitigations

| Vector | Mitigation |
|--------|-----------|
| Credit farming (bots earn infinite credits) | Monthly budget cap blocks issuance |
| Conversion churning | Minimum $5 threshold |
| Platform bleeding (credits exceed revenue) | Budget tracked as marketing expense — visible in P&L |
| Creator collusion (fake purchases) | Same fraud detection as real purchases (risk engine) |

---

## Edge Function: `/v1/credits`

**Actions:** `issue`, `convert`, `redeem`, `balance`
**Auth:** API key (standard `createHandler`)
**Rate limit:** Standard endpoint limits

---

## Migration Files

- `20260378_credit_redemption_system.sql` — RPCs, budget columns, account type setup
- `20260379_fix_redeem_credits_rpc.sql` — Fix stale liability reference in redeem

---

## SDK Methods

```typescript
soledgic.issueCredits(userId, credits, { reason, referenceId })
soledgic.convertCredits(userId, credits)
soledgic.redeemCredits(userId, creatorId, amountCents, referenceId, { description, splitPercent })
soledgic.getCreditBalance(userId)
```
